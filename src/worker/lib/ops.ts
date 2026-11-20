import {
	CONTENT_BYTES_LIMIT,
	contentBytes,
	contentPastLimit,
	emptyContent,
	isHttpUrl,
	linkItems,
	newId,
	type PageContent,
	type Settings,
	type ThemeId,
	type Locale,
} from '../../shared/content'
import type { PublishResponse } from '../../shared/api'
import { otherLanguages } from '../../shared/locale'
import { normalizeSlug, SLUG_PROBLEM_TEXT, slugFromText, slugFromUrl, slugProblem, uniqueSlug } from '../../shared/slug'
import { duplicateContent, starterContent, starterWords, type StarterId } from '../../shared/starters'
import { isValidTimeZone } from '../../shared/time'
import { untranslated, usedTranslations } from '../../shared/translations'
import { problemMessage, publishProblems, TOO_LARGE, type Problem } from '../../shared/validate'
import { fill, msg } from '../../templates/msg'
import { ApiError } from '../types'
import { deleteFontFiles, fontKey, hostFonts, parseHostedFonts, unusedFontFiles } from './fonts'
import {
	COPY_VERSION,
	deleteNamed,
	getLinkRecord,
	getSite,
	NAME_PREFIX,
	putLinkRecord,
	putSite,
	putSnapshot,
	SITE_KEY,
	toLinkRecord,
	type LinkRecord,
	type SiteRecord,
	type Snapshot,
} from './cache'
import {
	ensureSchema,
	firstPublishedHandles,
	firstPublishedPages,
	forgetPublicNames,
	getLink,
	getLinkBySlug,
	getLinksByIds,
	getPage,
	getPagesByIds,
	hasOtherPage,
	lastPosition,
	listOwnLinks,
	listPageLinks,
	getPageByHandle,
	insertPageStatement,
	changeSettings,
	homeIfNoneStatement,
	loadSettings,
	loadSettingsWith,
	noLongerHomeStatement,
	clearPasswordTriesStatement,
	publishedHandlesAfter,
	ownersOf,
	pageExists,
	recentlyPublishedPages,
	upsertLinkStatement,
	type LinkRow,
	type PageRow,
	pageVersionStatements,
} from './db'
import { FONT_PAGES_AT_ONCE, KV_OPS_AT_ONCE, VERSIONS_KEPT } from './mode'
import { hashLinkPassword } from './password'
import { perSite, siteId } from './sites'

function blankLink(now: number): Omit<LinkRow, 'id' | 'slug' | 'url' | 'title' | 'kind' | 'pageId'> {
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
async function takenAmong(db: D1Database, names: readonly string[], except: { pageId?: string; linkId?: string } = {}): Promise<Set<string>> {
	const owners = await ownersOf(db, names.filter(Boolean))
	return new Set(
		owners
			.filter((owner) => (owner.linkId ? owner.linkId !== except.linkId : owner.pageId !== except.pageId))
			.map((owner) => normalizeSlug(owner.name)),
	)
}

/** What uniqueSlug tries for a base, after the base itself. */
const numberedSlugs = (base: string) => Array.from({ length: 98 }, (_, i) => `${base}-${i + 2}`)

/** Which names are taken among what uniqueSlug would try for these bases: the numbered ones only for bases already taken. */
async function takenForBases(db: D1Database, bases: readonly string[], except: { pageId?: string; linkId?: string } = {}): Promise<Set<string>> {
	const unique = [...new Set(bases.filter(Boolean))]
	const taken = await takenAmong(db, unique, except)
	const numbered = unique.filter((base) => taken.has(base)).flatMap(numberedSlugs)
	return new Set([...taken, ...(await takenAmong(db, numbered, except))])
}

/**
 * uniqueSlug only knows the names it was given, which leaves its random last resort unchecked. With any number
 * of short links that can collide, so this checks what was picked and draws again for any that are taken.
 */
async function settleSlugs(db: D1Database, picks: { slug: string }[], taken: Set<string>, except: { pageId?: string; linkId?: string } = {}): Promise<void> {
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

function assertNameFree(name: string, taken: Set<string>, label: string): void {
	const problem = slugProblem(name)
	if (problem) throw new ApiError(400, 'invalid', { key: msg('{label}：{problem}'), params: { label: { key: label }, problem: { key: SLUG_PROBLEM_TEXT[problem] } } })
	if (taken.has(name)) throw new ApiError(409, 'slug-taken', { key: msg('「{name}」已經被使用了，請換一個'), params: { name } })
}

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
	return {
		v: COPY_VERSION,
		viaShortLink: (await listPageLinks(db, page.id)).filter(linkNeedsWorker).map((link) => link.id),
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
	}
}

// ---------------------------------------------------------------- KV copies

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

/**
 * After D1 has changed, the names that get no fresh copy are deleted once more. A visit between the first delete
 * and the change read the old row, and may have put its copy back: an archived link that redirects again, a deleted
 * page that is public again, and nothing would ever take that copy away. A failure here is only logged, since D1 is
 * right by now. What a visit rebuilds after this delete it checks against D1 itself (stillThere).
 */
/**
 * What KV still has to be told after a settings change. It is written to _meta before KV is told and taken out when
 * KV has been, so a change that reached D1 and not KV (the day's writes used up, a request cut short) is finished
 * by the next settings call, whatever that one asks for.
 */
interface Owed {
	/** The "site" record is to be written again. */
	site: boolean
	/** Pages whose own copy is to be written again: the ones that stopped or started being the home page. */
	pages: string[]
	/** Every page's copy after this handle is to be dropped, a slice a call: "" is all of them, null none. */
	after: string | null
	/**
	 * Every name's copy in KV is to be deleted, pages' and short links', from this place in KV's own list: "" is from
	 * the start, null none. After a backup was brought in on a site with more names than one request may delete.
	 */
	purge: string | null
	/** Font files are still in KV whose pages no longer list them: lists set aside in _meta say which (setFontsAside). */
	fonts: boolean
}
const COPIES_OWED = 'copies-owed'
/** Before a place in KV's list (Owed.purge) that KV refused the last time. No place KV gives starts with it. */
const PLACE_REFUSED = '!'
const NOTHING_OWED: Owed = { site: false, pages: [], after: null, purge: null, fonts: false }
const owesNothing = (owed: Owed) => !owed.site && !owed.pages.length && owed.after === null && owed.purge === null && !owed.fonts
function owedFrom(stored: unknown): Owed {
	if (!stored || typeof stored !== 'object') return NOTHING_OWED
	const { site, pages, after, purge, fonts } = stored as Partial<Record<keyof Owed, unknown>>
	return {
		site: site === true,
		pages: Array.isArray(pages) ? pages.filter((id): id is string => typeof id === 'string').sort() : [],
		after: typeof after === 'string' ? after : null,
		purge: typeof purge === 'string' ? purge : null,
		fonts: fonts === true,
	}
}

/** The settings, and whether a change to them still owes KV something a look at the site's state should send (see Owed). */
export async function settingsAndOwed(db: D1Database): Promise<{ settings: Settings; owed: boolean }> {
	const { settings, other } = await loadSettingsWith(db, COPIES_OWED)
	let noted: Owed = NOTHING_OWED
	try {
		noted = owedFrom(other === null ? null : JSON.parse(other))
	} catch {
		// A note that can't be read owes nothing, and the next settings call takes it out.
	}
	// What leaves something public that shouldn't be is sent at every look: old copies after a backup was brought in,
	// and pages' copies after pages were switched off. Past that, the "site" record and the home pages' copies, but
	// not while a large site's pages are being dropped for new languages or fonts, which is left to settings calls
	// and their owner's pace, and not a page's copy while pages are off, which can't be sent.
	const urgent = noted.purge !== null || (noted.after !== null && !settings.bio)
	return { settings, owed: urgent || (noted.after === null && (noted.site || (settings.bio && noted.pages.length > 0))) }
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
async function relist(env: Env): Promise<void> {
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
async function takeBackIfOld(later: Later | undefined, old: () => Promise<boolean>, takeBack: () => Promise<unknown>): Promise<void> {
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

function storeSite(env: Env, site: SiteRecord): Promise<void> {
	rememberSite(env, site)
	return putSite(env, site)
}

/** The pages the "site" record is made from: the home page and the first few published ones, whatever the site's size. */
async function sitePages(db: D1Database, settings: Settings): Promise<PageRow[]> {
	const [home, published] = await Promise.all([settings.home ? getPage(db, settings.home) : null, firstPublishedPages(db, SITE_RECORD_PAGES)])
	return home && !published.some((page) => page.id === home.id) ? [...published, home] : published
}

/** How many published pages "/" offers when no page is home. */
const SITE_RECORD_PAGES = 10

async function siteRecord(db: D1Database, settings: Settings, pages: PageRow[]): Promise<SiteRecord> {
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

// ---------------------------------------------------------------- pages

/** The draft isn't the one the caller read: the owner in the dashboard, or another AI, changed it. */
export const draftChanged = (): ApiError => new ApiError(409, 'draft-changed', msg('這個頁面的草稿在別的地方改過了，請重新讀取後再改'))

/**
 * Makes a page's draft public: every link with a URL becomes (or stays) a
 * short link, links that left the page are archived, and the snapshot that
 * visitors read from KV is replaced. `seen` is the draft version the caller
 * read, if it says; `by` goes in the page's list of published versions.
 */
export async function publishPage(env: Env, pageId: string, { by = null, seen }: { by?: string | null; seen?: number } = {}): Promise<PublishResponse> {
	const db = env.DB
	const [page, settings, ownRows] = await Promise.all([getPage(db, pageId), loadSettings(db), listOwnLinks(db, pageId)])
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	if (seen !== undefined && seen !== page.draftUpdatedAt) throw draftChanged()
	const content = structuredClone(page.draft)

	const problems = publishProblems(content, page.handle)
	if (problems.length) throw new ApiError(400, 'invalid', problemMessage(problems[0]!), problems)

	const links = linkItems(content)
	const own = new Set(ownRows.map((row) => row.id))
	const others = await getLinksByIds(db, links.map((link) => link.id).filter((id) => !own.has(id)))
	const byId = new Map([...ownRows, ...others].map((row) => [row.id, row]))
	// An id that belongs to another page's link (say, pasted through the API) gets a fresh one,
	// so publishing never takes over a link that isn't this page's.
	for (const link of links) {
		const owner = byId.get(link.id)
		if (owner && (owner.kind === 'solo' || owner.pageId !== pageId)) link.id = newId()
	}

	// Names this page can't take: page handles and every other link's slug. Only the names it might use are looked up.
	const blocked = new Map<string, string>()
	const block = async (names: string[]) => {
		for (const owner of await ownersOf(db, names.filter(Boolean))) {
			if (!owner.linkId) blocked.set(normalizeSlug(owner.name), owner.pageId === pageId ? msg('這個頁面的網址代稱') : msg('其他頁面的網址代稱'))
			else if (owner.kind === 'solo') blocked.set(owner.name, msg('[owner]獨立短網址'))
			else if (owner.pageId !== pageId) blocked.set(owner.name, msg('其他頁面的連結'))
		}
	}
	const baseOf = (link: { title: string; url: string }) => slugFromText(link.title.trim()) || slugFromUrl(link.url.trim())
	const unnamed = links.filter((link) => link.url.trim() && !normalizeSlug(link.slug))
	await block([
		normalizeSlug(page.handle),
		...links.map((link) => normalizeSlug(link.slug)),
		...unnamed.map((link) => byId.get(link.id)?.slug ?? '').filter((slug) => !slug.startsWith('~')),
		...unnamed.map(baseOf),
	])

	const used = new Set(blocked.keys())
	const conflicts: Problem[] = []
	content.items.forEach((item, i) => {
		if (item.kind !== 'link') return
		item.url = item.url.trim()
		item.title = item.title.trim()
		item.subtitle = item.subtitle.trim()
		item.slug = normalizeSlug(item.slug)
		if (!item.url || !item.slug) return
		const owner = blocked.get(item.slug)
		if (owner) {
			const key = msg('第 {n} 項連結的代稱「{slug}」已經是{owner}')
			const params = { n: i + 1, slug: item.slug, owner: { key: owner } }
			conflicts.push({ path: `items.${i}.slug`, message: fill(key, params), key, params })
		}
		used.add(item.slug)
	})
	if (conflicts.length) throw new ApiError(409, 'slug-taken', problemMessage(conflicts[0]!), conflicts)

	// Links without a slug keep the one they were published with, or get a new one.
	const generated: typeof links = []
	const busyBases = unnamed.map(baseOf).filter((base) => used.has(base))
	if (busyBases.length) {
		await block(busyBases.flatMap(numberedSlugs))
		for (const name of blocked.keys()) used.add(name)
	}
	for (const link of links) {
		if (!link.url || link.slug) continue
		const previous = byId.get(link.id)
		if (previous?.kind === 'bio' && previous.pageId === pageId && !previous.slug.startsWith('~') && !used.has(previous.slug)) {
			link.slug = previous.slug
		} else {
			link.slug = uniqueSlug(baseOf(link), used)
			generated.push(link)
		}
		used.add(link.slug)
	}
	// uniqueSlug's random last resort knows only the names looked up so far.
	for (let clash = generated; clash.length; ) {
		await block(clash.map((link) => link.slug))
		clash = clash.filter((link) => blocked.has(link.slug))
		for (const link of clash) {
			used.add(link.slug)
			link.slug = uniqueSlug('', used)
			used.add(link.slug)
		}
	}

	const live = new Map(links.filter((link) => link.url).map((link) => [link.id, link]))

	const translations = usedTranslations(content)
	if (translations) content.translations = translations
	else delete content.translations
	// What is about to be stored, twice, as the draft and as what is published: a draft saved before there was a
	// limit may be larger than that, and one whose translations were of texts no longer on the page no longer is.
	refuseTooLarge(content)

	// Before anything changes, so the page's new font files are in KV by the time its copy points at them.
	const fonts = await hostFonts(env, { id: pageId, handle: page.handle, published: content, fonts: page.fonts }, settings)

	const now = Date.now()
	const statements: D1PreparedStatement[] = []
	const freshLinks: LinkRow[] = []
	const unchanged = new Set<string>()

	// Move renamed or removed links out of the way first, so swapping two
	// slugs never trips the UNIQUE constraint. "~id" can't be typed as a slug.
	for (const row of ownRows) {
		if (live.get(row.id)?.slug === row.slug || row.slug.startsWith('~')) continue
		statements.push(db.prepare('UPDATE links SET slug = ?1 WHERE id = ?2').bind(`~${row.id}`, row.id))
	}
	for (const link of live.values()) {
		const previous = byId.get(link.id)
		const row: LinkRow = {
			...blankLink(now),
			...previous,
			id: link.id,
			slug: link.slug,
			url: link.url,
			title: link.title || link.slug,
			kind: 'bio',
			pageId,
			status: 'active',
			startsAt: link.startsAt,
			expiresAt: link.endsAt,
			updatedAt: now,
		}
		statements.push(upsertLinkStatement(db, row))
		const changed =
			!previous ||
			previous.slug !== row.slug ||
			previous.url !== row.url ||
			previous.status !== 'active' ||
			previous.startsAt !== row.startsAt ||
			previous.expiresAt !== row.expiresAt
		if (changed) freshLinks.push(row)
		else unchanged.add(row.slug)
	}
	for (const row of ownRows) {
		if (row.status === 'active' && !live.has(row.id)) {
			statements.push(db.prepare("UPDATE links SET status = 'archived', updated_at = ?1 WHERE id = ?2").bind(now, row.id))
		}
	}
	statements.push(...pageVersionStatements(db, pageId, content, now, by, VERSIONS_KEPT))
	// Fonts can take seconds to copy. A draft saved meanwhile stays: it is newer than what is going live.
	const draftUpdatedAt = Math.max(now, page.draftUpdatedAt + 1)
	statements.push(
		db
			.prepare(
				`UPDATE pages SET published = ?1, published_at = ?2, fonts = ?4,
				draft = CASE WHEN draft_updated_at = ?5 THEN ?1 ELSE draft END,
				draft_updated_at = CASE WHEN draft_updated_at = ?5 THEN ?6 ELSE draft_updated_at END
				WHERE id = ?3`,
			)
			.bind(JSON.stringify(content), now, pageId, fonts ? JSON.stringify(fonts) : null, page.draftUpdatedAt, draftUpdatedAt),
	)
	// Links that were live and now change or leave lose their KV copy first, and so does the page.
	const replaced = ownRows.filter((row) => row.status === 'active' && !row.slug.startsWith('~') && !unchanged.has(row.slug))
	await dropCopies(env, [page.handle], replaced.map((row) => row.slug), { home: settings.home === pageId })
	await db.batch(statements)
	forgetPublicNames()
	// The slugs that left the page or changed are written nowhere below.
	const written = new Set(freshLinks.map((row) => row.slug))
	await dropAgain(env, replaced.map((row) => row.slug).filter((slug) => !written.has(slug)))

	// With pages off, the published version waits in D1 until they are on again.
	const snapshot = await snapshotOf(db, { ...page, published: content, publishedAt: now, draft: content, fonts }, settings)
	await putCopies([
		snapshot ? putSnapshot(env, snapshot) : null,
		...freshLinks.map((row) => putLinkRecord(env, row.slug, toLinkRecord(row))),
		settings.home === pageId ? writeSite(env, settings) : null,
	])
	if (!page.published && settings.home !== pageId) await relist(env)
	await deleteFontFiles(env, unusedFontFiles(page.fonts, fonts))
	return { publishedAt: now, content, draftUpdatedAt, untranslated: untranslated(content, settings.languages) }
}

export interface NewPage {
	handle: string
	name: string
	theme?: ThemeId
	/** Start from a ready-made page. */
	starter?: StarterId
	/** The language of its text, else the site's page language. */
	locale?: Locale
	/** Copy another page's draft instead. */
	copyFrom?: string
}

export async function createPage(env: Env, input: NewPage): Promise<PageRow> {
	const db = env.DB
	const last = await lastPosition(db)
	const handle = normalizeSlug(input.handle)
	assertNameFree(handle, await takenAmong(db, [handle]), msg('網址代稱'))

	const name = input.name.trim().slice(0, 60)
	let draft: PageContent
	let qrLogo: string | null = null
	if (input.copyFrom) {
		const source = await getPage(db, input.copyFrom)
		if (!source) throw new ApiError(404, 'not-found', msg('找不到要複製的頁面'))
		draft = duplicateContent(source.draft)
		qrLogo = source.qrLogo
		if (name) draft.profile.name = name
	} else {
		draft = input.starter ? starterContent(input.starter, name, starterWords(input.locale ?? (await loadSettings(db)).locale)) : emptyContent(name)
	}
	if (input.theme) draft.appearance = { ...draft.appearance, theme: input.theme, accent: '', bg: '', fg: '', font: 'auto', headFont: '', bodyFont: '', button: 'auto' }

	const now = Date.now()
	const page: PageRow = {
		id: newId(),
		handle,
		position: (last ?? -1) + 1,
		draft,
		published: null,
		draftUpdatedAt: now,
		publishedAt: null,
		createdAt: now,
		fonts: null,
		qrLogo,
	}
	const statements = [insertPageStatement(db, page)]
	// The first page is also the home page.
	const settings = await loadSettings(db)
	const first = last === null
	if (first) statements.push(homeIfNoneStatement(db, settings, page.id))
	await db.batch(statements)
	if (first) await putCopies([writeSite(env, await loadSettings(db), [page])])
	return page
}

export async function renamePage(env: Env, id: string, input: string): Promise<PageRow> {
	const db = env.DB
	const page = await getPage(db, id)
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	const handle = normalizeSlug(input)
	if (handle === page.handle) return page
	assertNameFree(handle, await takenAmong(db, [handle], { pageId: id }), msg('網址代稱'))
	for (const link of linkItems(page.draft)) {
		if (normalizeSlug(link.slug) === handle) throw new ApiError(409, 'slug-taken', { key: msg('「{handle}」是這一頁某個連結的代稱，請換一個'), params: { handle } })
	}
	const settings = await loadSettings(db)
	await dropCopies(env, [page.handle, handle], [], { home: settings.home === id })
	await db.prepare('UPDATE pages SET handle = ?1 WHERE id = ?2').bind(handle, id).run()
	forgetPublicNames()
	await dropAgain(env, [page.handle])
	const renamed = { ...page, handle }
	const snapshot = await snapshotOf(env.DB, renamed, settings)
	await putCopies([snapshot ? putSnapshot(env, snapshot) : null, settings.home === id ? writeSite(env, settings) : null])
	if (page.published && settings.home !== id) await relist(env)
	return renamed
}

/** The picture for QR codes that follow this page's default. They are drawn in the dashboard, so visitors read none of this. */
export async function setPageQrLogo(env: Env, id: string, qrLogo: string | null | undefined): Promise<PageRow> {
	const page = await getPage(env.DB, id)
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	if (qrLogo === undefined) return page
	await env.DB.prepare('UPDATE pages SET qr_logo = ?1 WHERE id = ?2').bind(qrLogo, id).run()
	return { ...page, qrLogo }
}

export async function deletePage(env: Env, id: string): Promise<void> {
	const db = env.DB
	const [page, another, own, settings] = await Promise.all([getPage(db, id), hasOtherPage(db, id), listOwnLinks(db, id), loadSettings(db)])
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	if (!another) throw new ApiError(409, 'last-page', msg('至少要留一個頁面'))
	const names = [page.handle, ...own.filter((row) => row.status === 'active' && !row.slug.startsWith('~')).map((row) => row.slug)]
	await dropCopies(env, [page.handle], names.slice(1), { home: settings.home === id })
	const done = await db.batch([
		// Only the home page, and only that field: the settings as they were read above may be older than what
		// someone else has saved since.
		noLongerHomeStatement(db, id),
		db
			.prepare("UPDATE links SET status = 'archived', slug = '~' || id, updated_at = ?1 WHERE kind = 'bio' AND page_id = ?2")
			.bind(Date.now(), id),
		db.prepare('DELETE FROM page_versions WHERE page_id = ?1').bind(id),
		db.prepare('DELETE FROM pages WHERE id = ?1').bind(id),
	])
	forgetPublicNames()
	await dropAgain(env, names)
	// Whether it was the home page is what D1 just said, not what was read before: it may have been made the home
	// page since, and "/" would go on showing it.
	const wasHome = settings.home === id || (done[0]?.meta.changes ?? 0) > 0
	await putCopies([wasHome ? writeSite(env, await loadSettings(db)) : null])
	if (page.published && !wasHome) await relist(env)
	await deleteFontFiles(env, unusedFontFiles(page.fonts, null))
}

// ---------------------------------------------------------------- settings

/** "https://Links.Example.com/x" → "links.example.com"; "" stays "". */
export function normalizeDomain(value: string): string {
	const trimmed = value.trim().toLowerCase()
	if (!trimmed) return ''
	try {
		return new URL(/^[a-z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).hostname
	} catch {
		throw new ApiError(400, 'invalid', msg('網域格式不正確'))
	}
}

/** What a request asks to change in the settings. Whatever it leaves out stays as it is now, not as it was when the request began. */
export type SettingsPatch = Partial<Settings>

export async function updateSettings(env: Env, patch: SettingsPatch): Promise<{ settings: Settings; copiesLeft: boolean }> {
	const db = env.DB
	if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) throw new ApiError(400, 'invalid', msg('時區格式不正確'))
	if (patch.home && !(await pageExists(db, patch.home))) throw new ApiError(400, 'invalid', msg('找不到要放在首頁的頁面'))
	const domain = patch.domain === undefined ? undefined : normalizeDomain(patch.domain)
	const homeUrl = patch.homeUrl === undefined ? undefined : (optionalUrl(patch.homeUrl, msg('首頁轉址')) ?? '')
	const change = (current: Settings): Settings => {
		const asked = { ...current, ...(Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as SettingsPatch) }
		return { ...asked, languages: otherLanguages(asked.locale, patch.languages ?? current.languages), domain: domain ?? current.domain, homeUrl: homeUrl ?? current.homeUrl }
	}

	// What the change will owe KV is noted before D1 has the change, from the settings as they are read now: if
	// anything stops this request after D1 has it, the note is there, and the same request sent again finishes it.
	// Another request saving in between only makes the note say too much, which costs a write or two and no more.
	const { settings: seen, other: noted } = await loadSettingsWith(db, COPIES_OWED)
	const note = owedNote(db, noted)
	const before = note.owed()
	let owed = await note.keep(owedTogether(before, owedBy(seen, change(seen))))

	// From the settings as they are at this moment: another request may have saved since this one started.
	const { previous, next } = await changeSettings(db, change)
	forgetPublicNames()
	owed = await note.keep(owedTogether(owed, owedBy(previous, next)))
	const bioChanged = previous.bio !== next.bio
	// Every snapshot carries the languages and whether fonts are copied, so each has to go. Dropping one takes no
	// parsing and no D1 read per page, and the page's next visit rebuilds it from D1, so pages nobody visits never
	// cost a write.
	const everyPage = previous.locale !== next.locale || previous.languages.join() !== next.languages.join() || previous.hostFonts !== next.hostFonts
	// One request may start so many KV operations (KV_OPS_AT_ONCE), whatever it has to do: what doesn't fit stays owed.
	let budget = KV_OPS_AT_ONCE
	if (bioChanged) {
		const switched = await switchBio(env, previous, next, budget).catch(async (error: unknown) => {
			// Refused, and put back. KV may hold half of it, which the note has to go on saying, looked at afresh:
			// another request may have taken the same note out. Pages are on again, so their copies are owed only
			// what they were before this.
			await note.keep({ ...owed, after: before.after }, true).catch((failed: unknown) => console.error('Could not note what KV is owed', failed))
			throw error
		})
		budget -= switched.used
		// Going off: the "site" record says so, and the pages past this slice are owed, from where it stopped. Coming
		// back: copies an unfinished switch left are from before whatever changed while pages were off, so all go.
		owed = { ...owed, site: false, pages: [], after: next.bio ? (owed.after !== null ? '' : null) : switched.after }
	}
	// Another language with its own built-in text, or copying fonts turned on or off: published pages' fonts change.
	const fonts = everyPage ? await refreshFonts(env, previous, next) : { unused: [], written: 0 }
	budget = Math.max(0, budget - fonts.written)

	let copiesLeft = false
	let refused: unknown
	try {
		;({ owed, copiesLeft, refused, budget } = await tellKv(env, owed, budget))
	} finally {
		// If this can't be saved, what was noted before KV was told still stands, and says at least as much.
		await note.keep(owed, true).catch((error: unknown) => console.error('Could not note what KV is owed', error))
	}
	await deleteFontFiles(env, fonts.unused.slice(0, Math.max(0, budget)))
	if (refused) {
		// D1 has the change and KV doesn't. Said as an error, so that whoever saved it, the dashboard too, is told
		// that visitors don't see it yet; what is owed is noted, and saving again sends it.
		console.error('KV kept a copy after a settings change', refused)
		throw new ApiError(503, 'kv', msg('已經儲存，但 Cloudflare KV 暫時寫不進去，訪客還看不到這次的修改。請稍後再儲存一次。'))
	}
	return { settings: next, copiesLeft }
}

/**
 * Tells KV what it is owed, from the settings as they are now, within `budget` KV operations, and answers with what
 * is still owed after that: more than one request may do (`copiesLeft`), or all that KV refused (`refused`).
 */
async function tellKv(env: Env, owed: Owed, budget = KV_OPS_AT_ONCE): Promise<{ owed: Owed; copiesLeft: boolean; refused: unknown; budget: number }> {
	const db = env.DB
	let refused: unknown
	const rejected = (results: PromiseSettledResult<unknown>[]) => results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
	// Twice at most: once for what is owed, and once more if someone else saved while KV was being told, since
	// what this request wrote may then have landed on top of theirs. Past that it stays noted.
	for (let pass = 0; pass < 2 && !owesNothing(owed) && !refused; pass++) {
		// From the settings as they are by now, which another request may have changed again.
		const current = await loadSettings(db)
		// The few things first, so that the many take what is left of this request's operations and no more.
		// With pages off KV holds no page, so there is no copy to write for one. It stays noted all the same:
		// the switch may be someone else's that is yet to be refused and put back, and one that holds settles it.
		if (current.bio && owed.pages.length && budget >= owed.pages.length) {
			const pages = await getPagesByIds(db, owed.pages)
			const snapshots = await Promise.all(pages.map((page) => snapshotOf(db, page, current)))
			budget -= snapshots.length
			const failed = rejected(await Promise.allSettled(snapshots.map((snapshot) => snapshot && putSnapshot(env, snapshot))))
			if (failed) refused = failed.reason
			else owed = { ...owed, pages: [] }
		}
		if (owed.site && budget >= 1 && !refused) {
			const site = await siteRecord(db, current, await sitePages(db, current))
			budget -= 1
			await storeSite(env, site).then(
				() => (owed = { ...owed, site: false }),
				(error: unknown) => (refused = error),
			)
		}
		if (owed.purge !== null && budget >= 2 && !refused) {
			// Every name KV has, by KV's own list: the names a backup replaced are in no table any more.
			// A place that was refused once is marked (PLACE_REFUSED) and tried once more.
			const again = owed.purge.startsWith(PLACE_REFUSED)
			const place = again ? owed.purge.slice(PLACE_REFUSED.length) : owed.purge
			try {
				const listed = await env.KV.list({ prefix: NAME_PREFIX, cursor: place || undefined, limit: Math.min(1000, budget - 1) })
				budget -= 1 + listed.keys.length
				const failed = rejected(await Promise.allSettled(listed.keys.map((key) => env.KV.delete(key.name))))
				// One refused: from the same place again next time.
				if (failed) refused = failed.reason
				else owed = { ...owed, purge: listed.list_complete ? null : listed.cursor }
			} catch (error) {
				// KV refusing for a moment is no reason to go back to the start and delete what visits have
				// rebuilt since. A place KV no longer takes is refused every time, and would have every save
				// answer 503 from then on: so the same place once more, and after that from the start.
				refused = error
				owed = { ...owed, purge: !place || again ? '' : `${PLACE_REFUSED}${place}` }
			}
		}
		// Pages' copies are dropped whether pages are on or off: off, they are what is still public (switchBio).
		// Not while every name is being deleted, which takes them too.
		if (owed.purge === null && owed.after !== null && budget >= 1 && !refused) {
			const handles = await publishedHandlesAfter(db, owed.after, budget + 1)
			const now = handles.slice(0, budget)
			budget -= now.length
			const failed = rejected(await Promise.allSettled(now.map((handle) => deleteNamed(env, handle))))
			// One refused: the same slice again next time. More than a slice: on from the last one dropped.
			if (failed) refused = failed.reason
			else owed = { ...owed, after: handles.length > now.length ? now[now.length - 1]! : null }
		}
		if (owed.fonts && !refused) {
			const done = await dropFontFiles(env, budget)
			budget -= done.used
			if (done.refused) refused = done.refused
			else if (!done.left) owed = { ...owed, fonts: false }
		}
		// What a save since that read owes is owed again by now, whoever told KV last.
		const since = owedBy(current, await loadSettings(db))
		if (owesNothing(since)) break
		owed = owedTogether(owed, since)
	}
	// More than this request could do, which the next one goes on with. A page's copy that can't be written while
	// pages are off is not that: nothing is to be done about it until they are on.
	const copiesLeft = !refused && (owed.site || owed.after !== null || owed.purge !== null || owed.fonts)
	return { owed, copiesLeft, refused, budget }
}

/** How many pages' font files one slice looks at: their keys go in one statement, which takes 100 values. */
const FONT_ROWS_AT_ONCE = 90

/** Where a page's list of font files waits for its files to be deleted: a row of _meta, `fonts-old:<page id>`. */
const FONTS_ASIDE = 'fonts-old:'

/**
 * Sets every page's list of font files aside and leaves the pages with none, in one batch: when copying is turned
 * off, or a backup is about to replace the pages. A list left on its page would be read again as soon as copying is
 * on, and by then some of its files are gone. Set aside, nothing reads it but dropFontFiles. A page that already
 * has a list waiting keeps both: the files of the two are one set.
 */
export function setFontsAside(db: D1Database): D1PreparedStatement[] {
	return [
		db.prepare(
			`INSERT INTO _meta (key, value) SELECT '${FONTS_ASIDE}' || id, json_array(json(fonts)) FROM pages WHERE fonts IS NOT NULL AND json_valid(fonts)
			 ON CONFLICT (key) DO UPDATE SET value = json_insert(_meta.value, '$[#]', json(json_extract(excluded.value, '$[0]')))`,
		),
		db.prepare('UPDATE pages SET fonts = NULL WHERE fonts IS NOT NULL'),
	]
}

/** Whether any list of font files is set aside, waiting for its files to be deleted. */
export async function fontsAside(db: D1Database): Promise<boolean> {
	return Boolean(await db.prepare('SELECT 1 FROM _meta WHERE key >= ?1 AND key < ?2 LIMIT 1').bind(FONTS_ASIDE, `${FONTS_ASIDE.slice(0, -1)};`).first())
}

/** Every file the lists set aside for one page name: a list of lists (setFontsAside). */
function filesListed(json: string): string[] {
	try {
		const lists: unknown = JSON.parse(json)
		return Array.isArray(lists) ? [...new Set(lists.flatMap((list) => unusedFontFiles(parseHostedFonts(JSON.stringify(list)), null)))] : []
	} catch {
		return []
	}
}

/**
 * Deletes the font files of lists set aside, as many pages' as `budget` KV operations take, and forgets a list only
 * when its files are gone: what KV refuses stays listed, and is tried again. A file its page lists again by now,
 * copying having been turned back on, is that page's and stays.
 */
async function dropFontFiles(env: Env, budget: number): Promise<{ used: number; left: boolean; refused?: unknown }> {
	const { results } = await env.DB
		.prepare(
			`SELECT m.key AS key, m.value AS listed, p.fonts AS now FROM _meta m LEFT JOIN pages p ON p.id = substr(m.key, ${FONTS_ASIDE.length + 1})
			 WHERE m.key >= ?1 AND m.key < ?2 ORDER BY m.key LIMIT ?3`,
		)
		.bind(FONTS_ASIDE, `${FONTS_ASIDE.slice(0, -1)};`, FONT_ROWS_AT_ONCE)
		.all<{ key: string; listed: string; now: string | null }>()
	const gone: string[] = []
	let used = 0
	let refused: unknown
	for (const row of results) {
		const kept = new Set(unusedFontFiles(parseHostedFonts(row.now), null))
		const files = filesListed(row.listed).filter((file) => !kept.has(file))
		if (used + files.length > budget) break
		used += files.length
		const failed = (await Promise.allSettled(files.map((file) => env.KV.delete(fontKey(file))))).find((result): result is PromiseRejectedResult => result.status === 'rejected')
		if (failed) {
			refused = failed.reason
			break
		}
		gone.push(row.key)
	}
	if (gone.length) await env.DB.prepare(`DELETE FROM _meta WHERE key IN (${gone.map((_, n) => `?${n + 1}`).join(', ')})`).bind(...gone).run()
	return { used, left: gone.length < results.length || results.length === FONT_ROWS_AT_ONCE, refused }
}

/**
 * Sends what is still owed to KV without changing the settings: for a look at the site's state, so that opening the
 * dashboard finishes a change KV refused, and goes on with what leaves something public (settingsAndOwed); and for
 * a backup just brought in. Answers whether there is more.
 */
export async function sendOwed(env: Env, budget = KV_OPS_AT_ONCE): Promise<{ copiesLeft: boolean }> {
	const row = await env.DB.prepare('SELECT value FROM _meta WHERE key = ?1').bind(COPIES_OWED).first<{ value: string }>()
	const note = owedNote(env.DB, row?.value ?? null)
	const owed = note.owed()
	if (owesNothing(owed)) return { copiesLeft: false }
	const told = await tellKv(env, owed, budget)
	await note.keep(told.owed, true)
	if (told.refused) console.error('KV kept a copy it is owed the change of', told.refused)
	return { copiesLeft: told.copiesLeft || Boolean(told.refused) }
}

/**
 * Notes, before a backup replaces what D1 holds, that every name's copy in KV is to be deleted (`everyCopy`,
 * Owed.purge) and that font files are set aside to delete (`fonts`). Anything noted about pages' copies goes with
 * the first: the pages are other pages after that. Answers with a way to take the note back, for when D1 then
 * refuses the backup and nothing has changed.
 */
export async function noteBeforeImport(db: D1Database, { everyCopy, fonts }: { everyCopy: boolean; fonts: boolean }): Promise<() => Promise<void>> {
	const row = await db.prepare('SELECT value FROM _meta WHERE key = ?1').bind(COPIES_OWED).first<{ value: string }>()
	const note = owedNote(db, row?.value ?? null)
	const was = note.owed()
	await note.keep({ ...was, ...(everyCopy ? { pages: [], after: null, purge: '' } : {}), fonts: was.fonts || fonts }, true)
	return async () => void (await note.keep(was))
}

/** What one change to the settings owes KV. */
function owedBy(previous: Settings, next: Settings): Owed {
	// Turned off: the pages' lists are set aside, and the files deleted by them a slice a call.
	const fonts = previous.hostFonts && !next.hostFonts
	// The "site" record is what says pages are on or off. Going off, every page's copy is owed too, from the start:
	// noted before D1 has the switch, so that whatever stops the request after that, the pages are still gone on
	// with. switchBio then makes it the place it got to.
	if (previous.bio !== next.bio) return { site: true, pages: [], after: next.bio ? null : '', purge: null, fonts }
	const everyPage = previous.locale !== next.locale || previous.languages.join() !== next.languages.join() || previous.hostFonts !== next.hostFonts
	const homeChanged = previous.home !== next.home
	return {
		// The home page's copy is in the "site" record, so that is also what brings "/" up to date. The time zone is
		// in that record and nowhere else in KV; visits elsewhere ask for it (siteTimeZone).
		site: everyPage || homeChanged || previous.timezone !== next.timezone || previous.homeUrl !== next.homeUrl,
		// Only the two pages that stop or start being the home page say so in their snapshot.
		pages: homeChanged && next.bio ? [previous.home, next.home].filter(Boolean) : [],
		after: everyPage && next.bio ? '' : null,
		purge: null,
		fonts,
	}
}

/** Both of two things owed: never less than either. */
function owedTogether(a: Owed, b: Owed): Owed {
	return {
		site: a.site || b.site,
		pages: [...new Set([...a.pages, ...b.pages])].sort(),
		// Two different places: from the start again, which is right whatever order the handles are in.
		after: a.after === null ? b.after : b.after === null || b.after === a.after ? a.after : '',
		purge: a.purge === null ? b.purge : b.purge === null || b.purge === a.purge ? a.purge : '',
		fonts: a.fonts || b.fonts,
	}
}

/**
 * The note of what KV is owed, kept so that two requests can't lose each other's: it is saved only over what this
 * request last saw there. Where another request has written meanwhile, what that one noted stays, with this one's,
 * and the caller is handed both to do. That can leave noted something already done, which the next call does again.
 */
function owedNote(db: D1Database, text: string | null) {
	const parse = (value: string | null): Owed => {
		try {
			return owedFrom(value === null ? null : JSON.parse(value))
		} catch {
			return NOTHING_OWED
		}
	}
	return {
		owed: () => parse(text),
		/** `sure` looks at the row before taking it to say what it last said: for when what is owed must not go unsaid. */
		async keep(want: Owed, sure = false): Promise<Owed> {
			const read = async () => (await db.prepare('SELECT value FROM _meta WHERE key = ?1').bind(COPIES_OWED).first<{ value: string }>())?.value ?? null
			if (sure && !owesNothing(want)) {
				const there = await read()
				if (there !== text) {
					text = there
					want = owedTogether(parse(text), want)
				}
			}
			for (let attempt = 0; ; attempt++) {
				const next = owesNothing(want) ? null : JSON.stringify(want)
				if (next === text) return want
				const saved =
					text === null
						? await db.prepare('INSERT OR IGNORE INTO _meta (key, value) VALUES (?1, ?2)').bind(COPIES_OWED, next).run()
						: next === null
							? await db.prepare('DELETE FROM _meta WHERE key = ?1 AND value = ?2').bind(COPIES_OWED, text).run()
							: await db.prepare('UPDATE _meta SET value = ?3 WHERE key = ?1 AND value = ?2').bind(COPIES_OWED, text, next).run()
				if (saved.meta.changes > 0) {
					text = next
					return want
				}
				if (attempt >= 5) throw new Error('What KV is owed kept changing while it was being noted.')
				text = await read()
				want = owedTogether(parse(text), want)
			}
		},
	}
}

/**
 * Tells KV that pages went off or came back. Their snapshots are deleted when going off, and a visit
 * rebuilds each when they come back. Unlike other changes (see dropCopies) D1 has to go first when pages go off:
 * until it says so, a visit that misses KV would put a deleted snapshot back, and the page would stay public. If
 * KV refuses, the setting goes back too, so the owner can try again and nothing is half done.
 *
 * One request deletes as many as it may. On a site with more pages than that the rest stay public until they are
 * dropped, from `after` on, by the calls that follow (Owed.after): the answer says `copiesLeft`, and every look at
 * the site's state goes on with it.
 */
async function switchBio(env: Env, previous: Settings, next: Settings, budget: number): Promise<{ used: number; after: string | null }> {
	const handles = next.bio ? [] : await publishedHandlesAfter(env.DB, '', budget)
	const stale = handles.slice(0, budget - 1)
	try {
		await Promise.all([storeSite(env, await siteRecord(env.DB, next, await sitePages(env.DB, next))), ...stale.map((handle) => deleteNamed(env, handle))])
		return { used: 1 + stale.length, after: handles.length > stale.length ? stale[stale.length - 1]! : null }
	} catch (error) {
		console.error('KV refused the bio switch', error)
		// What this request changed goes back, as the answer says nothing was saved: the switch, and a time zone or a
		// language sent along with it. Only where it is still what this request made it: anything saved meanwhile is
		// someone else's, and stays.
		const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
		const { next: back } = await changeSettings(env.DB, (current) => {
			const restored = { ...current }
			for (const key of Object.keys(next) as (keyof Settings)[]) {
				if (!same(previous[key], next[key]) && same(current[key], next[key])) Object.assign(restored, { [key]: previous[key] })
			}
			// The page language is never among the others, whichever of the two went back.
			restored.languages = otherLanguages(restored.locale, restored.languages)
			return restored
		})
		await putCopies([storeSite(env, await siteRecord(env.DB, back, await sitePages(env.DB, back)))])
		throw new ApiError(503, 'kv', msg('Cloudflare KV 暫時寫不進去，這次的修改沒有儲存，請稍後再試。'))
	}
}

/**
 * Brings copied fonts in line with new settings, and answers with the files no longer used and how many it wrote.
 * With copying on, the most recent pages are copied now; the others use the visitor's own fonts, as any page whose
 * fonts aren't copied does, until they are next published.
 */
async function refreshFonts(env: Env, previous: Settings, next: Settings): Promise<{ unused: string[]; written: number }> {
	if (!next.hostFonts) {
		// Turned off: the pages' lists are set aside for the files to be deleted by, a slice a call (dropFontFiles).
		if (previous.hostFonts) await env.DB.batch(setFontsAside(env.DB))
		return { unused: [], written: 0 }
	}
	const pages = await recentlyPublishedPages(env.DB, FONT_PAGES_AT_ONCE)
	const refreshed = await Promise.all(pages.map(async (page) => ({ ...page, fonts: page.published ? await hostFonts(env, { ...page, published: page.published }, next) : page.fonts })))
	const changed = refreshed.filter((page, i) => page.fonts !== pages[i]?.fonts)
	if (changed.length) {
		await env.DB.batch(changed.map((page) => env.DB.prepare('UPDATE pages SET fonts = ?1 WHERE id = ?2').bind(page.fonts ? JSON.stringify(page.fonts) : null, page.id)))
	}
	const unused = pages.flatMap((page, i) => unusedFontFiles(page.fonts, refreshed[i]?.fonts ?? null))
	// A file a page had already is not written again; the others each took a KV operation of this request's.
	return { unused, written: refreshed.flatMap((page, i) => unusedFontFiles(page.fonts, pages[i]?.fonts ?? null)).length }
}

// ---------------------------------------------------------------- short links

export interface NewLink {
	url: string
	slug?: string
	title?: string
	utm?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null }
	expiresAt?: number | null
}

const cleanUtm = (value: string | null | undefined) => value?.trim().slice(0, 100) || null

function soloRow(input: NewLink, slug: string, now: number): LinkRow {
	return {
		...blankLink(now),
		id: newId(),
		slug,
		url: input.url.trim(),
		title: input.title?.trim().slice(0, 80) ?? '',
		kind: 'solo',
		pageId: null,
		expiresAt: input.expiresAt ?? null,
		utmSource: cleanUtm(input.utm?.source),
		utmMedium: cleanUtm(input.utm?.medium),
		utmCampaign: cleanUtm(input.utm?.campaign),
		utmContent: cleanUtm(input.utm?.content),
	}
}

export async function createSoloLink(env: Env, input: NewLink): Promise<LinkRow> {
	const { created, errors } = await createSoloLinks(env, [input])
	if (errors[0]) throw errors[0].error
	return created[0]!
}

/** Creates several standalone links at once; bad rows are reported and skipped. */
export async function createSoloLinks(
	env: Env,
	inputs: NewLink[],
): Promise<{ created: LinkRow[]; errors: { index: number; error: ApiError }[] }> {
	const db = env.DB
	const wanted = inputs.map((input) => normalizeSlug(input.slug ?? ''))
	const bases = inputs.map((input, i) => (wanted[i] || !isHttpUrl(input.url.trim()) ? '' : slugFromUrl(input.url.trim())))
	const named = await takenAmong(db, wanted)
	const taken = new Set([...named, ...(await takenForBases(db, bases))])
	const now = Date.now()
	const created: LinkRow[] = []
	const generated: LinkRow[] = []
	const errors: { index: number; error: ApiError }[] = []
	inputs.forEach((input, index) => {
		try {
			if (!isHttpUrl(input.url.trim())) throw new ApiError(400, 'invalid', msg('網址要以 http:// 或 https:// 開頭'))
			let slug = wanted[index]!
			if (slug) assertNameFree(slug, taken, msg('代稱'))
			else slug = uniqueSlug(bases[index]!, taken)
			taken.add(slug)
			const row = soloRow(input, slug, now)
			created.push(row)
			if (!wanted[index]) generated.push(row)
		} catch (error) {
			errors.push({ index, error: error instanceof ApiError ? error : new ApiError(400, 'invalid', msg('這一筆資料有問題，已略過')) })
		}
	})
	if (created.length) {
		await settleSlugs(db, generated, taken)
		await db.batch(created.map((row) => upsertLinkStatement(db, row)))
		await putCopies(created.map((row) => putLinkRecord(env, row.slug, toLinkRecord(row))))
	}
	return { created, errors }
}

export interface LinkPatch {
	url?: string
	slug?: string
	title?: string
	startsAt?: number | null
	expiresAt?: number | null
	/** A new password, or null to remove it. */
	password?: string | null
	utm?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null }
	status?: 'active' | 'archived'
	iosUrl?: string | null
	androidUrl?: string | null
	lineExternal?: boolean
	inAppPrompt?: boolean
	qr?: unknown
}

function optionalUrl(value: string | null, label: string): string | null {
	const url = value?.trim() ?? ''
	if (!url) return null
	if (!isHttpUrl(url)) throw new ApiError(400, 'invalid', { key: msg('{label}要以 http:// 或 https:// 開頭'), params: { label: { key: label } } })
	return url
}

/**
 * Gives a link on a page its short link now, or a new slug, without waiting for a publish, the way a page's own address
 * changes at once. The slug also goes in the draft and in what's published, so a later publish keeps it.
 */
export async function setPageLinkSlug(
	env: Env,
	pageId: string,
	itemId: string,
	{ slug: wanted, seen }: { slug?: string; seen?: number },
): Promise<{ row: LinkRow; draftUpdatedAt: number }> {
	const db = env.DB
	const [page, settings, row] = await Promise.all([getPage(db, pageId), loadSettings(db), getLink(db, itemId)])
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	if (seen !== undefined && seen !== page.draftUpdatedAt) throw draftChanged()
	const inDraft = linkItems(page.draft).find((link) => link.id === itemId)
	const inPublished = page.published ? linkItems(page.published).find((link) => link.id === itemId) : undefined
	if ((row && (row.kind !== 'bio' || row.pageId !== pageId)) || (!row && !inDraft)) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
	const active = row?.status === 'active' ? row : undefined
	if (active && wanted === undefined) return { row: active, draftUpdatedAt: page.draftUpdatedAt }

	const url = active ? active.url : (inDraft?.url.trim() ?? '')
	if (!isHttpUrl(url)) throw new ApiError(400, 'invalid', msg('網址要以 http:// 或 https:// 開頭'))
	const title = inDraft?.title.trim() ?? ''
	const except = { linkId: itemId }
	let slug = normalizeSlug(wanted ?? inDraft?.slug ?? '')
	if (slug) {
		if (active?.slug !== slug) assertNameFree(slug, await takenAmong(db, [slug], except), msg('代稱'))
	} else {
		const base = slugFromText(title) || slugFromUrl(url)
		const taken = await takenForBases(db, [base], except)
		const pick = { slug: uniqueSlug(base, taken) }
		await settleSlugs(db, [pick], taken, except)
		slug = pick.slug
	}
	const unchanged = active?.slug === slug
	const everywhere = [inDraft, inPublished].every((link) => !link || link.slug === slug)
	if (active && unchanged && everywhere) return { row: active, draftUpdatedAt: page.draftUpdatedAt }

	const now = Date.now()
	const next: LinkRow = row
		? { ...row, slug, url, status: 'active', updatedAt: now }
		: { ...blankLink(now), id: itemId, slug, url, title: title || slug, kind: 'bio', pageId, startsAt: inDraft?.startsAt ?? null, expiresAt: inDraft?.endsAt ?? null, updatedAt: now }
	const withSlug = (content: PageContent): PageContent => {
		const copy = structuredClone(content)
		for (const link of linkItems(copy)) if (link.id === itemId) link.slug = slug
		return copy
	}
	const draft = withSlug(page.draft)
	const published = page.published && withSlug(page.published)
	// A longer slug must not take a draft past what can be saved again.
	if (JSON.stringify(draft).length > JSON.stringify(page.draft).length) refuseTooLarge(draft)
	const draftUpdatedAt = Math.max(now, page.draftUpdatedAt + 1)

	// A button that hides its address points at the old slug until the page's copy is rewritten.
	const home = Boolean(inPublished) && settings.home === pageId
	await dropCopies(env, inPublished ? [page.handle] : [], active && !unchanged ? [active.slug] : [], { home })
	const saved = await db
		.prepare('UPDATE pages SET draft = ?1, published = ?2, draft_updated_at = ?3 WHERE id = ?4 AND draft_updated_at = ?5')
		.bind(JSON.stringify(draft), published && JSON.stringify(published), draftUpdatedAt, pageId, page.draftUpdatedAt)
		.run()
	if (!saved.meta.changes) throw draftChanged()
	await upsertLinkStatement(db, next).run()
	forgetPublicNames()
	// The slug it moved away from gets no copy below.
	if (active && !unchanged) await dropAgain(env, [active.slug])
	const snapshot = inPublished ? await snapshotOf(db, { ...page, draft, published, draftUpdatedAt }, settings) : null
	await putCopies([putLinkRecord(env, slug, toLinkRecord(next)), snapshot ? putSnapshot(env, snapshot) : null, home ? writeSite(env, settings) : null])
	return { row: next, draftUpdatedAt }
}

export async function updateLink(env: Env, id: string, patch: LinkPatch): Promise<LinkRow> {
	const db = env.DB
	let row = await getLink(db, id)
	if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
	const ownedByPage = (['url', 'title', 'status', 'startsAt', 'expiresAt'] as const).some((key) => patch[key] !== undefined)
	if (row.kind === 'bio' && ownedByPage) {
		throw new ApiError(400, 'bio-link', msg('頁面連結的網址、標題、開放時間和到期日，請到「內容」修改後發布'))
	}
	if (row.kind === 'bio' && row.pageId && patch.slug !== undefined) {
		row = (await setPageLinkSlug(env, row.pageId, id, { slug: patch.slug })).row
		patch = { ...patch, slug: undefined }
	}

	const settings = await loadSettings(db)
	const next: LinkRow = { ...row, updatedAt: Date.now() }
	if (patch.url !== undefined) {
		const url = patch.url.trim()
		if (!isHttpUrl(url)) throw new ApiError(400, 'invalid', msg('網址要以 http:// 或 https:// 開頭'))
		next.url = url
	}
	if (patch.title !== undefined) next.title = patch.title.trim().slice(0, 80)
	if (patch.slug !== undefined) {
		const slug = normalizeSlug(patch.slug)
		if (slug !== row.slug) {
			assertNameFree(slug, await takenAmong(db, [slug], { linkId: id }), msg('代稱'))
			next.slug = slug
		}
	}
	if (patch.startsAt !== undefined) next.startsAt = patch.startsAt
	if (patch.expiresAt !== undefined) next.expiresAt = patch.expiresAt
	if (next.startsAt && next.expiresAt && next.expiresAt <= next.startsAt) {
		throw new ApiError(400, 'invalid', msg('到期日要晚於開放時間'))
	}
	if (patch.password !== undefined) next.passwordHash = patch.password ? await hashLinkPassword(patch.password) : null
	if (patch.utm) {
		if (patch.utm.source !== undefined) next.utmSource = cleanUtm(patch.utm.source)
		if (patch.utm.medium !== undefined) next.utmMedium = cleanUtm(patch.utm.medium)
		if (patch.utm.campaign !== undefined) next.utmCampaign = cleanUtm(patch.utm.campaign)
		if (patch.utm.content !== undefined) next.utmContent = cleanUtm(patch.utm.content)
	}
	if (patch.status !== undefined) next.status = patch.status
	if (patch.iosUrl !== undefined) next.iosUrl = optionalUrl(patch.iosUrl, msg('iPhone／iPad 的導向網址'))
	if (patch.androidUrl !== undefined) next.androidUrl = optionalUrl(patch.androidUrl, msg('Android 的導向網址'))
	if (patch.lineExternal !== undefined) next.lineExternal = patch.lineExternal
	if (patch.inAppPrompt !== undefined) next.inAppPrompt = patch.inAppPrompt
	if (patch.qr !== undefined) next.qr = patch.qr

	const routingChanged = JSON.stringify(toLinkRecord(row)) !== JSON.stringify(toLinkRecord(next))
	const moved = row.slug !== next.slug
	// A new password or an archived link must never be left to an old KV copy.
	// A password can't wait for the page's copy either: its button must stop showing the address at once.
	const page = row.pageId && linkNeedsWorker(row) !== linkNeedsWorker(next) ? await getPage(db, row.pageId) : null
	const home = page?.id === settings.home
	if (row.status === 'active' && (routingChanged || moved || next.status !== 'active')) {
		await dropCopies(env, page ? [page.handle] : [], moved ? [row.slug, next.slug] : [row.slug], { home })
	}
	await db.batch([upsertLinkStatement(db, next), ...(patch.password !== undefined ? [clearPasswordTriesStatement(db, id)] : [])])
	// An archived link's slug, and the slug a link moved away from, get no copy below.
	if (row.status === 'active') await dropAgain(env, [...(moved ? [row.slug] : []), ...(next.status !== 'active' ? [row.slug, next.slug] : [])])
	const snapshot = page ? await snapshotOf(db, page, settings) : null
	await putCopies([
		next.status === 'active' && (routingChanged || moved || row.status !== 'active') ? putLinkRecord(env, next.slug, toLinkRecord(next)) : null,
		snapshot ? putSnapshot(env, snapshot) : null,
		snapshot && home ? writeSite(env, settings) : null,
	])
	return next
}

// ---------------------------------------------------------------- reads that repair KV

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
