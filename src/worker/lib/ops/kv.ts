import { CONTENT_BYTES_LIMIT, contentBytes, contentPastLimit, isHttpUrl, type PageContent, type Settings } from '../../../shared/content'
import { normalizeSlug, SLUG_PROBLEM_TEXT, slugProblem, uniqueSlug } from '../../../shared/slug'
import { TOO_LARGE } from '../../../shared/validate'
import { msg } from '../../../templates/msg'
import { precomputeFontLinks } from '../../../templates/render'
import { ApiError } from '../../types'
import {
	COPY_VERSION,
	deleteNamed,
	getLinkRecord,
	getSite,
	putLinkRecord,
	putSite,
	putSnapshot,
	SITE_KEY,
	toLinkRecord,
	type LinkRecord,
	type SiteRecord,
	type Snapshot,
} from '../cache'
import {
	ensureSchema,
	firstPublishedHandles,
	firstPublishedPages,
	forgetPublicNames,
	getLinkBySlug,
	getPage,
	getPageByHandle,
	listPageLinks,
	loadSettings,
	ownersOf,
	type LinkRow,
	type PageRow,
} from '../db'
import { perSite, siteId } from '../sites'

export function blankLink(now: number): Omit<LinkRow, 'id' | 'slug' | 'url' | 'title' | 'kind' | 'pageId'> {
	return {
		status: 'active',
		startsAt: null,
		expiresAt: null,
		passwordHash: null,
		utmSource: null,
		utmMedium: null,
		utmCampaign: null,
		utmContent: null,
		iosUrl: null,
		androidUrl: null,
		lineExternal: false,
		inAppPrompt: false,
		qr: null,
		createdAt: now,
		updatedAt: now,
	}
}

/** Page handles and short link slugs share one namespace: the first path segment. */
export async function takenAmong(db: D1Database, names: readonly string[], except: { pageId?: string; linkId?: string } = {}): Promise<Set<string>> {
	const owners = await ownersOf(db, names.filter(Boolean))
	return new Set(
		owners
			.filter((owner) => (owner.linkId ? owner.linkId !== except.linkId : owner.pageId !== except.pageId))
			.map((owner) => normalizeSlug(owner.name)),
	)
}

/** What uniqueSlug tries for a base, after the base itself. */
export const numberedSlugs = (base: string) => Array.from({ length: 98 }, (_, i) => `${base}-${i + 2}`)

/** Which names are taken among what uniqueSlug would try for these bases: the numbered ones only for bases already taken. */
export async function takenForBases(db: D1Database, bases: readonly string[], except: { pageId?: string; linkId?: string } = {}): Promise<Set<string>> {
	const unique = [...new Set(bases.filter(Boolean))]
	const taken = await takenAmong(db, unique, except)
	const numbered = unique.filter((base) => taken.has(base)).flatMap(numberedSlugs)
	return new Set([...taken, ...(await takenAmong(db, numbered, except))])
}

/**
 * uniqueSlug only knows the names it was given, which leaves its random last resort unchecked. With any number
 * of short links that can collide, so this checks what was picked and draws again for any that are taken.
 */
export async function settleSlugs(db: D1Database, picks: { slug: string }[], taken: Set<string>, except: { pageId?: string; linkId?: string } = {}): Promise<void> {
	for (;;) {
		const clashes = await takenAmong(db, picks.map((pick) => pick.slug), except)
		const redraw = picks.filter((pick) => clashes.has(pick.slug))
		if (!redraw.length) return
		for (const name of clashes) taken.add(name)
		for (const pick of redraw) {
			pick.slug = uniqueSlug('', taken)
			taken.add(pick.slug)
		}
	}
}

export function assertNameFree(name: string, taken: Set<string>, label: string): void {
	const problem = slugProblem(name)
	if (problem) throw new ApiError(400, 'invalid', { key: msg('{label}：{problem}'), params: { label: { key: label }, problem: { key: SLUG_PROBLEM_TEXT[problem] } } })
	if (taken.has(name)) throw new ApiError(409, 'slug-taken', { key: msg('「{name}」已經被使用了，請換一個'), params: { name } })
}

export function optionalUrl(value: string | null, label: string): string | null {
	const url = value?.trim() ?? ''
	if (!url) return null
	if (!isHttpUrl(url)) throw new ApiError(400, 'invalid', { key: msg('{label}要以 http:// 或 https:// 開頭'), params: { label: { key: label } } })
	return url
}

/** The draft isn't the one the caller read: the owner in the dashboard, or another AI, changed it. */
export const draftChanged = (): ApiError => new ApiError(409, 'draft-changed', msg('這個頁面的草稿在別的地方改過了，請重新讀取後再改'))

/** A password, device routing and UTM tags only happen in a redirect, so a button that skipped it would skip them. */
export function linkNeedsWorker(link: LinkRow): boolean {
	return Boolean(link.passwordHash || link.iosUrl || link.androidUrl || link.lineExternal || link.inAppPrompt || link.utmSource || link.utmMedium || link.utmCampaign || link.utmContent)
}

/**
 * What visitors get for a page, or null when they get nothing. Every write of a
 * snapshot and the rebuild from D1 go through here, so with `settings.bio` off no
 * copy of a page reaches KV, and a miss there can't bring one back.
 */
export async function snapshotOf(db: D1Database, page: PageRow, settings: Settings): Promise<Snapshot | null> {
	if (!settings.bio || !page.published || !page.publishedAt) return null
	const viaShortLink = (await listPageLinks(db, page.id)).filter(linkNeedsWorker).map((link) => link.id)
	const fontLinks = settings.hostFonts ? undefined : precomputeFontLinks(page.published, [settings.locale, ...settings.languages], viaShortLink)
	return {
		v: COPY_VERSION,
		viaShortLink,
		pageId: page.id,
		handle: page.handle,
		content: page.published,
		publishedAt: page.publishedAt,
		locale: settings.locale,
		languages: settings.languages,
		home: settings.home === page.id,
		// With hostFonts on, a page whose fonts aren't copied yet (Google was unreachable, or it was
		// imported and not published since) uses the visitor's own fonts rather than Google's.
		...(settings.hostFonts && { fonts: page.fonts ?? [] }),
		...(fontLinks && { fontLinks }),
	}
}

/**
 * Visitors are served from the KV copies, so a change that would leave an
 * outdated copy there (a new password, an archived link, a renamed or
 * deleted page) deletes that copy before D1 changes. If KV refuses, nothing
 * has changed and the owner can try again. The fresh copy is written
 * afterwards; if that write fails, visitors get the D1 version, which is
 * already right, and the next visit tries to put it back in KV.
 *
 * `home` says one of the pages is the home page: its copy is also inside the "site" record, which "/" reads.
 */
export async function dropCopies(env: Env, handles: string[], slugs: string[], { home = false } = {}): Promise<void> {
	try {
		await Promise.all([...[...handles, ...slugs].map((name) => deleteNamed(env, name)), home ? dropHomeCopy(env) : null])
	} catch (error) {
		console.error('KV refused a delete', error)
		throw new ApiError(503, 'kv', msg('Cloudflare KV 暫時寫不進去，這次的修改沒有儲存，請稍後再試。'))
	}
}

/** Taking the home page's copy away is writing the "site" record without it. "/" then asks D1 until the record is written again. */
async function dropHomeCopy(env: Env): Promise<void> {
	const site = await getSite(env)
	if (!site?.page) return
	const { page: _page, ...rest } = site
	await storeSite(env, rest)
}

/** Refuses a page's content that D1 could keep as a draft and never as draft and published both. */
export function refuseTooLarge(content: PageContent, more?: PageContent | null): void {
	// A draft and what is published share the row: a backup's page is held to both together, since a site's own
	// backup may hold a large draft from before there was a limit, beside something small that is published.
	const limit = more ? CONTENT_BYTES_LIMIT * 2 : CONTENT_BYTES_LIMIT
	const bytes = more ? contentBytes(content) + contentBytes(more) : (contentPastLimit(content) ?? 0)
	if (bytes > limit) throw new ApiError(413, 'too-large', { key: TOO_LARGE, params: { size: Math.ceil(bytes / 1000), limit: limit / 1000 } })
}

/**
 * The "site" record lists a few published pages, for "/" to offer when no page is the home page. It is written when
 * the home page or the settings change, so with no home page a page that was deleted or moved stayed offered there,
 * and one just published wasn't. One KV read; with no home page one D1 query too, and a write only when the list is wrong.
 */
export async function relist(env: Env): Promise<void> {
	try {
		const site = await getSite(env)
		// With a home page, or pages off, the list is shown to nobody; whatever takes the home page away rewrites it.
		if (!site || site.home || !site.bio) return
		const now = await firstPublishedHandles(env.DB, SITE_RECORD_PAGES)
		// Made again from D1 and checked against it afterwards, as a visit that found no record would.
		if (now.join('\n') !== site.published.join('\n')) await siteFromDb(env)
	} catch (error) {
		console.error('Could not bring the list of pages at "/" up to date', error)
	}
}

/** Something to be done after the response has left: `waitUntil`, where there is a request to hang it on. */
export type Later = (work: Promise<unknown>) => void

/**
 * A copy rebuilt from D1 is checked against D1 once it is in KV, and taken back if D1 has moved on: the row may have
 * changed between the read and the write, and whoever changed it has done their deletes by then. Where it can, this
 * waits for nobody (`later`), which also means a visitor who leaves early doesn't leave the copy unchecked. If D1
 * can't be asked the copy goes, and the next visit asks again.
 */
export async function takeBackIfOld(later: Later | undefined, old: () => Promise<boolean>, takeBack: () => Promise<unknown>): Promise<void> {
	const work = old()
		.catch(() => true)
		.then((is) => (is ? takeBack() : undefined))
		.catch((error: unknown) => console.error('Could not take back an old copy', error))
	if (later) later(work)
	else await work
}

export async function dropAgain(env: Env, names: string[]): Promise<void> {
	await putCopies([...new Set(names)].map((name) => deleteNamed(env, name)))
}

/** Whether a rebuilt copy reached KV. One that didn't is nothing to check, or to take back. */
const put = (write: Promise<unknown>): Promise<boolean> =>
	write.then(
		() => true,
		(error: unknown) => {
			console.error('KV refused a write', error)
			return false
		},
	)

/** Writes fresh KV copies; see dropCopies for why a failure here only costs speed. */
export async function putCopies(writes: (Promise<unknown> | null)[]): Promise<void> {
	for (const result of await Promise.allSettled(writes)) {
		if (result.status === 'rejected') console.error('KV refused a write', result.reason)
	}
}

/** Rewrites the "site" record: the home page as "/" serves it, and how system pages look. */
export async function writeSite(env: Env, settings: Settings, pages?: PageRow[]): Promise<SiteRecord> {
	const site = await siteRecord(env.DB, settings, pages ?? (await sitePages(env.DB, settings)))
	await storeSite(env, site)
	return site
}

export function storeSite(env: Env, site: SiteRecord): Promise<void> {
	rememberSite(env, site)
	return putSite(env, site)
}

/** The pages the "site" record is made from: the home page and the first few published ones, whatever the site's size. */
export async function sitePages(db: D1Database, settings: Settings): Promise<PageRow[]> {
	const [home, published] = await Promise.all([settings.home ? getPage(db, settings.home) : null, firstPublishedPages(db, SITE_RECORD_PAGES)])
	return home && !published.some((page) => page.id === home.id) ? [...published, home] : published
}

/** How many published pages "/" offers when no page is home. */
const SITE_RECORD_PAGES = 10

export async function siteRecord(db: D1Database, settings: Settings, pages: PageRow[]): Promise<SiteRecord> {
	const home = pages.find((page) => page.id === settings.home)
	const appearance = (home?.published ?? home?.draft ?? pages.find((page) => page.published)?.published)?.appearance
	// System pages wear the colors and fonts, not the CSS: it was written for a page of links, and a system page isn't one.
	const look = appearance ? { ...appearance, css: '' } : null
	// Null with pages off or the home page not published yet: nothing that reads this record can then name a page.
	const page = home ? await snapshotOf(db, home, settings) : null
	return {
		v: COPY_VERSION,
		home: page?.handle ?? '',
		locale: settings.locale,
		languages: settings.languages,
		look,
		published: settings.bio ? pages.filter((entry) => entry.published).map((entry) => entry.handle).slice(0, SITE_RECORD_PAGES) : [],
		bio: settings.bio,
		homeUrl: settings.homeUrl,
		timezone: settings.timezone,
		...(page && { page }),
	}
}

/** Builds the "site" record from D1 when KV doesn't have it, or has it without the home page's copy. */
export async function siteFromDb(env: Env, later?: Later): Promise<SiteRecord> {
	await ensureSchema(env.DB)
	const build = async () => {
		const settings = await loadSettings(env.DB)
		return siteRecord(env.DB, settings, await sitePages(env.DB, settings))
	}
	const site = await build()
	if (!(await put(storeSite(env, site)))) return site
	// As for a page's copy (snapshotFromDb): the home page published again meanwhile must not stay as it was at "/".
	const copy = JSON.stringify(site)
	await takeBackIfOld(
		later,
		async () => JSON.stringify(await build()) !== copy,
		async () => {
			siteMemos.delete(siteId(env))
			await env.KV.delete(SITE_KEY)
		},
	)
	return site
}

/** The "site" record as it is now: KV first, then D1. This is the read "/" costs. */
export async function findSite(env: Env, later?: Later): Promise<SiteRecord> {
	const site = await getSite(env)
	if (!site) return siteFromDb(env, later)
	rememberSite(env, site)
	return site
}

/** How long a copy of the Worker goes by the "site" record it last saw, for system pages and for the time zone. */
const SYSTEM_PAGE_MEMO = 60 * 1000
const TIME_ZONE_MEMO = 5 * 60 * 1000

// Each site this Worker holds has its own record and its own time zone (lib/sites.ts).
const siteMemos = perSite<{ site: SiteRecord; at: number }>()
const timeZoneMemos = perSite<{ timeZone: string; at: number }>()

function rememberSite(env: Env, site: SiteRecord): void {
	// Never the home page's copy: "/" always reads the record itself.
	const { page: _page, ...rest } = site
	const at = Date.now()
	siteMemos.set(siteId(env), { site: rest, at })
	timeZoneMemos.set(siteId(env), { timeZone: site.timezone, at })
}

/** After a wipe: nothing this copy of the Worker remembers is true any more. */
export function forgetSite(): void {
	siteMemos.clear()
	timeZoneMemos.clear()
}

/**
 * The "site" record for a system page: its language, its look, whether pages are on. Anyone can ask for addresses
 * that don't exist as often as they like, so a copy of the Worker reads it at most once a minute for them. Without
 * the home page's copy, and null when KV has no record yet: a system page then wears the default look.
 */
export async function systemSite(env: Env): Promise<SiteRecord | null> {
	const kept = siteMemos.get(siteId(env))
	if (kept && Date.now() - kept.at < SYSTEM_PAGE_MEMO) return kept.site
	const site = await getSite(env)
	if (site) rememberSite(env, site)
	return site ? (siteMemos.get(siteId(env))?.site ?? site) : null
}

/**
 * The site's time zone for a visit. Short links and page copies don't carry it, so changing it rewrites none of
 * them. A copy of the Worker that doesn't know it asks D1, at most once in 5 minutes, and not KV: of the two,
 * KV's reads are the scarce ones. A visit to "/" brings it along in the "site" record. The copy that saved the
 * change knows at once; the others catch up within 5 minutes.
 */
export async function siteTimeZone(env: Env): Promise<string> {
	const kept = timeZoneMemos.get(siteId(env))
	if (kept && Date.now() - kept.at < TIME_ZONE_MEMO) return kept.timeZone
	try {
		// A page with opening hours waits for this before it is drawn, so the settings are asked for alongside
		// the schema check, not after it: one trip to D1 in a new copy of the Worker, where it was three. Only a
		// database with no tables yet has nothing to ask, and that one is asked again once they are made.
		const [early] = await Promise.all([loadSettings(env.DB).catch(() => null), ensureSchema(env.DB)])
		const { timezone } = early ?? (await loadSettings(env.DB))
		timeZoneMemos.set(siteId(env), { timeZone: timezone, at: Date.now() })
		return timezone
	} catch (error) {
		// Visitors are served from KV alone: D1 not answering mustn't take a page down with it.
		console.error('D1 did not give the time zone', error)
		return (await findSite(env)).timezone
	}
}

/** Falls back to D1 when KV has no record for a slug, and repairs KV. */
export async function linkRecordFromDb(env: Env, slug: string, later?: Later): Promise<LinkRecord | null> {
	await ensureSchema(env.DB)
	const row = await getLinkBySlug(env.DB, slug)
	if (!row || row.status !== 'active') return null
	const record = toLinkRecord(row)
	if (!(await put(putLinkRecord(env, slug, record)))) return record
	// The row may have changed between that read and this write: an archived link's copy would then be back for
	// good. Whoever changed it deleted the name before and after, so a copy put back later than that is taken
	// away here, by the one who put it.
	const copy = JSON.stringify(record)
	await takeBackIfOld(
		later,
		async () => {
			const now = await getLinkBySlug(env.DB, slug)
			return !now || now.status !== 'active' || JSON.stringify(toLinkRecord(now)) !== copy
		},
		() => deleteNamed(env, slug),
	)
	return record
}

/** Falls back to D1 when KV has no snapshot for a handle, and repairs KV. */
export async function snapshotFromDb(env: Env, handle: string, later?: Later): Promise<Snapshot | null> {
	await ensureSchema(env.DB)
	// Most misses are addresses that were never anything, so the settings are only read for a page that exists.
	const page = await getPageByHandle(env.DB, handle)
	if (!page?.published) return null
	const snapshot = await snapshotOf(env.DB, page, await loadSettings(env.DB))
	if (snapshot && (await put(putSnapshot(env, snapshot)))) {
		// As for a link. A page's copy is made from more than its own row: which of its links go through their short
		// link, the languages, whether pages are on at all. So it is made again whole and compared, and a link given
		// a password meanwhile doesn't leave its address on the page.
		const copy = JSON.stringify(snapshot)
		await takeBackIfOld(
			later,
			async () => {
				const [now, settings] = await Promise.all([getPageByHandle(env.DB, handle), loadSettings(env.DB)])
				return JSON.stringify(now ? await snapshotOf(env.DB, now, settings) : null) !== copy
			},
			() => deleteNamed(env, handle),
		)
	}
	return snapshot
}

/** A link record by slug: KV first, then D1. */
export async function findLinkRecord(env: Env, slug: string): Promise<LinkRecord | null> {
	return (await getLinkRecord(env, slug)) ?? (await linkRecordFromDb(env, slug))
}

/**
 * After an import. The old copies are gone (dropCopies), so a visit rebuilds each page and short link from D1
 * as it is asked for. Writing them all here could use a whole day's free KV writes on addresses nobody visits.
 */
export async function rebuildCache(env: Env): Promise<void> {
	forgetPublicNames()
	await putCopies([writeSite(env, await loadSettings(env.DB))])
}
