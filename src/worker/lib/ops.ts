import {
	DEFAULT_SETTINGS,
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
import { otherLanguages, pageLanguages } from '../../shared/locale'
import { normalizeSlug, SLUG_PROBLEM_TEXT, slugFromText, slugFromUrl, slugProblem, uniqueSlug } from '../../shared/slug'
import { duplicateContent, starterContent, starterWords, type StarterId } from '../../shared/starters'
import { isValidTimeZone } from '../../shared/time'
import { untranslated, usedTranslations } from '../../shared/translations'
import { problemMessage, publishProblems, type Problem } from '../../shared/validate'
import { fill, msg } from '../../templates/msg'
import { ApiError } from '../types'
import { deleteFontFiles, hostFonts, parseHostedFonts, unusedFontFiles } from './fonts'
import {
	deleteLinkRecord,
	deleteSnapshot,
	getLinkRecord,
	getSite,
	putLinkRecord,
	putSite,
	putSnapshot,
	toLinkRecord,
	type LinkRecord,
	type SiteRecord,
	type Snapshot,
} from './cache'
import {
	ensureSchema,
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
	loadSettings,
	ownersOf,
	pageExists,
	publishedHandles,
	recentlyPublishedPages,
	saveSettingsStatement,
	upsertLinkStatement,
	type LinkRow,
	type PageRow,
	pageVersionStatements,
} from './db'
import { FONT_PAGES_AT_ONCE, KV_OPS_AT_ONCE, VERSIONS_KEPT } from './mode'
import { hashLinkPassword } from './password'

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
function linkNeedsWorker(link: LinkRow): boolean {
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
		v: 3,
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
 */
export async function dropCopies(env: Env, handles: string[], slugs: string[]): Promise<void> {
	try {
		await Promise.all([...handles.map((handle) => deleteSnapshot(env, handle)), ...slugs.map((slug) => deleteLinkRecord(env, slug))])
	} catch (error) {
		console.error('KV refused a delete', error)
		throw new ApiError(503, 'kv', msg('Cloudflare KV 暫時寫不進去，這次的修改沒有儲存，請稍後再試。'))
	}
}

/** Writes fresh KV copies; see dropCopies for why a failure here only costs speed. */
export async function putCopies(writes: (Promise<unknown> | null)[]): Promise<void> {
	for (const result of await Promise.allSettled(writes)) {
		if (result.status === 'rejected') console.error('KV refused a write', result.reason)
	}
}

/** Rewrites the "site" record: which page is at "/" and how system pages look. */
export async function writeSite(env: Env, settings: Settings, pages?: PageRow[]): Promise<SiteRecord> {
	const site = siteRecord(settings, pages ?? (await sitePages(env.DB, settings)))
	rememberTimeZone(settings.timezone)
	await putSite(env, site)
	return site
}

/** The pages the "site" record is made from: the home page and the first few published ones, whatever the site's size. */
async function sitePages(db: D1Database, settings: Settings): Promise<PageRow[]> {
	const [home, published] = await Promise.all([settings.home ? getPage(db, settings.home) : null, firstPublishedPages(db, SITE_RECORD_PAGES)])
	return home && !published.some((page) => page.id === home.id) ? [...published, home] : published
}

/** How many published pages "/" offers when no page is home. */
const SITE_RECORD_PAGES = 10

function siteRecord(settings: Settings, pages: PageRow[]): SiteRecord {
	const home = pages.find((page) => page.id === settings.home)
	const look = (home?.published ?? home?.draft ?? pages.find((page) => page.published)?.published)?.appearance ?? null
	return {
		v: 2,
		// With pages off, nothing that reads this record can name one.
		home: settings.bio ? (home?.handle ?? '') : '',
		locale: settings.locale,
		languages: settings.languages,
		look,
		published: settings.bio ? pages.filter((page) => page.published).map((page) => page.handle).slice(0, SITE_RECORD_PAGES) : [],
		bio: settings.bio,
		homeUrl: settings.homeUrl,
		timezone: settings.timezone,
	}
}

/** Builds the "site" record from D1 when KV doesn't have it yet, e.g. right after upgrading from v0.1. */
export async function siteFromDb(env: Env): Promise<SiteRecord> {
	await ensureSchema(env.DB)
	const settings = await loadSettings(env.DB)
	const site = siteRecord(settings, await sitePages(env.DB, settings))
	rememberTimeZone(settings.timezone)
	await putCopies([putSite(env, site)])
	return site
}

/** The "site" record: KV first, then D1. A copy from before it carried the time zone is rebuilt. */
export async function findSite(env: Env): Promise<SiteRecord> {
	const site = await getSite(env)
	if (!site?.timezone) return siteFromDb(env)
	rememberTimeZone(site.timezone)
	return site
}

let timeZoneMemo: { timeZone: string; until: number } | null = null

function rememberTimeZone(timeZone: string): void {
	timeZoneMemo = { timeZone, until: Date.now() + 5 * 60 * 1000 }
}

/**
 * The site's time zone for a visit. Short links and page copies don't carry it, so changing it rewrites
 * none of them: a copy of the Worker reads the "site" record at most once in 5 minutes for it, and only
 * when a visit comes in. The copy that saved the change knows at once; the others catch up within 5 minutes.
 */
export async function siteTimeZone(env: Env): Promise<string> {
	if (timeZoneMemo && timeZoneMemo.until > Date.now()) return timeZoneMemo.timeZone
	return (await findSite(env)).timezone ?? DEFAULT_SETTINGS.timezone
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
	await dropCopies(env, [page.handle], replaced.map((row) => row.slug))
	await db.batch(statements)
	forgetPublicNames()

	// With pages off, the published version waits in D1 until they are on again.
	const snapshot = await snapshotOf(db, { ...page, published: content, publishedAt: now, draft: content, fonts }, settings)
	await putCopies([
		snapshot ? putSnapshot(env, snapshot) : null,
		...freshLinks.map((row) => putLinkRecord(env, row.slug, toLinkRecord(row))),
		settings.home === pageId ? writeSite(env, settings) : null,
	])
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
		draft = input.starter ? starterContent(input.starter, name, starterWords(input.locale ?? pageLanguages((await loadSettings(db)).locale).locale)) : emptyContent(name)
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
	// The first page is also the home page, as in v0.1.
	const settings = await loadSettings(db)
	const first = last === null
	if (first) statements.push(saveSettingsStatement(db, { ...settings, home: page.id }))
	await db.batch(statements)
	if (first) await putCopies([writeSite(env, { ...settings, home: page.id }, [page])])
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
	await dropCopies(env, [page.handle, handle], [])
	await db.prepare('UPDATE pages SET handle = ?1 WHERE id = ?2').bind(handle, id).run()
	forgetPublicNames()
	const renamed = { ...page, handle }
	const settings = await loadSettings(db)
	const snapshot = await snapshotOf(env.DB, renamed, settings)
	await putCopies([snapshot ? putSnapshot(env, snapshot) : null, settings.home === id ? writeSite(env, settings) : null])
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
	const nextSettings = settings.home === id ? { ...settings, home: '' } : settings
	await dropCopies(
		env,
		[page.handle],
		own.filter((row) => row.status === 'active' && !row.slug.startsWith('~')).map((row) => row.slug),
	)
	await db.batch([
		db
			.prepare("UPDATE links SET status = 'archived', slug = '~' || id, updated_at = ?1 WHERE kind = 'bio' AND page_id = ?2")
			.bind(Date.now(), id),
		db.prepare('DELETE FROM page_versions WHERE page_id = ?1').bind(id),
		db.prepare('DELETE FROM pages WHERE id = ?1').bind(id),
		saveSettingsStatement(db, nextSettings),
	])
	forgetPublicNames()
	await putCopies([settings.home === id ? writeSite(env, nextSettings) : null])
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

/** Settings to save; a list of languages, a font switch, the bio switch or its redirect left out keeps the current one. */
export type SettingsInput = Omit<Settings, 'languages' | 'hostFonts' | 'bio' | 'homeUrl' | 'qrLogo' | 'plan'> & {
	qrLogo?: string
	plan?: Settings['plan']
	languages?: Settings['languages']
	hostFonts?: boolean
	bio?: boolean
	homeUrl?: string
}

export async function updateSettings(env: Env, input: SettingsInput): Promise<{ settings: Settings; copiesLeft: boolean }> {
	const db = env.DB
	if (!isValidTimeZone(input.timezone)) throw new ApiError(400, 'invalid', msg('時區格式不正確'))
	if (input.home && !(await pageExists(db, input.home))) throw new ApiError(400, 'invalid', msg('找不到要放在首頁的頁面'))

	const previous = await loadSettings(db)
	const next: Settings = {
		...input,
		languages: otherLanguages(input.locale, input.languages ?? previous.languages),
		domain: normalizeDomain(input.domain),
		hostFonts: input.hostFonts ?? previous.hostFonts,
		bio: input.bio ?? previous.bio,
		homeUrl: input.homeUrl === undefined ? previous.homeUrl : (optionalUrl(input.homeUrl, msg('首頁轉址')) ?? ''),
		qrLogo: input.qrLogo ?? previous.qrLogo,
		plan: input.plan ?? previous.plan,
	}
	await saveSettingsStatement(db, next).run()
	forgetPublicNames()
	const bioChanged = previous.bio !== next.bio
	if (bioChanged) await switchBio(env, previous, next)

	const languagesChanged = previous.locale !== next.locale || previous.languages.join() !== next.languages.join()
	const hostingChanged = previous.hostFonts !== next.hostFonts
	const timezoneChanged = previous.timezone !== next.timezone
	// Copying fonts turned on or off, or another language with its own built-in text: published pages' fonts change.
	const unusedFonts = languagesChanged || hostingChanged ? await refreshFonts(env, previous, next) : []
	const homeChanged = previous.home !== next.home

	// Every snapshot carries these, so each has to go. Dropping one takes no parsing and no D1 read per page, and
	// the page's next visit rebuilds it from D1, so pages nobody visits never cost a write. Going on or off has dealt with them.
	const everyPage = languagesChanged || hostingChanged
	let copiesLeft = false
	const drop = async (keys: string[], dropOne: (key: string) => Promise<void>) => {
		for (const result of await Promise.allSettled(keys.map(dropOne))) {
			if (result.status === 'rejected') {
				copiesLeft = true
				console.error('KV kept a copy after a settings change', result.reason)
			}
		}
	}
	let budget = KV_OPS_AT_ONCE
	if (next.bio && !bioChanged && everyPage) {
		const handles = await publishedHandles(db)
		if (handles.length > budget) copiesLeft = true
		const dropped = handles.slice(0, budget)
		budget -= dropped.length
		await drop(dropped, (handle) => deleteSnapshot(env, handle))
	} else if (next.bio && !bioChanged && homeChanged) {
		// Only the two pages that stop or start being the home page say so in their snapshot.
		const pages = await getPagesByIds(db, [previous.home, next.home].filter(Boolean))
		const snapshots = await Promise.all(pages.map((page) => snapshotOf(db, page, next)))
		await putCopies(snapshots.map((snapshot) => (snapshot ? putSnapshot(env, snapshot) : null)))
	}
	// The time zone is in the "site" record only; visits pick it up from there (siteTimeZone).
	if (!bioChanged && (everyPage || homeChanged || timezoneChanged || previous.homeUrl !== next.homeUrl)) await writeSite(env, next)
	await deleteFontFiles(env, unusedFonts.slice(0, KV_OPS_AT_ONCE))
	return { settings: next, copiesLeft }
}

/**
 * Tells KV that pages went off or came back. Their snapshots are deleted when going off, and a visit
 * rebuilds each when they come back. Unlike other changes (see dropCopies) D1 has to go first when pages go off:
 * until it says so, a visit that misses KV would put a deleted snapshot back, and the page would stay public. If
 * KV refuses, the setting goes back too, so the owner can try again and nothing is half done.
 */
async function switchBio(env: Env, previous: Settings, next: Settings): Promise<void> {
	const stale = next.bio ? [] : await publishedHandles(env.DB)
	try {
		await Promise.all([putSite(env, siteRecord(next, await sitePages(env.DB, next))), ...stale.map((handle) => deleteSnapshot(env, handle))])
	} catch (error) {
		console.error('KV refused the bio switch', error)
		await saveSettingsStatement(env.DB, previous).run()
		await putCopies([putSite(env, siteRecord(previous, await sitePages(env.DB, previous)))])
		throw new ApiError(503, 'kv', msg('Cloudflare KV 暫時寫不進去，這次的修改沒有儲存，請稍後再試。'))
	}
}

/**
 * Brings copied fonts in line with new settings, and returns the files no longer used. Turning hosting off needs no
 * page read. With it on, the most recent pages are copied now; the others use the visitor's own fonts, as any page
 * whose fonts aren't copied does, until they are next published.
 */
async function refreshFonts(env: Env, previous: Settings, next: Settings): Promise<string[]> {
	if (!next.hostFonts) {
		if (!previous.hostFonts) return []
		const { results } = await env.DB.prepare('SELECT fonts FROM pages WHERE fonts IS NOT NULL').all<{ fonts: string }>()
		await env.DB.prepare('UPDATE pages SET fonts = NULL WHERE fonts IS NOT NULL').run()
		return results.flatMap((row) => unusedFontFiles(parseHostedFonts(row.fonts), null))
	}
	const pages = await recentlyPublishedPages(env.DB, FONT_PAGES_AT_ONCE)
	const refreshed = await Promise.all(pages.map(async (page) => ({ ...page, fonts: page.published ? await hostFonts(env, { ...page, published: page.published }, next) : page.fonts })))
	const changed = refreshed.filter((page, i) => page.fonts !== pages[i]?.fonts)
	if (changed.length) {
		await env.DB.batch(changed.map((page) => env.DB.prepare('UPDATE pages SET fonts = ?1 WHERE id = ?2').bind(page.fonts ? JSON.stringify(page.fonts) : null, page.id)))
	}
	return pages.flatMap((page, i) => unusedFontFiles(page.fonts, refreshed[i]?.fonts ?? null))
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
	const draftUpdatedAt = Math.max(now, page.draftUpdatedAt + 1)

	// A button that hides its address points at the old slug until the page's copy is rewritten.
	await dropCopies(env, inPublished ? [page.handle] : [], active && !unchanged ? [active.slug] : [])
	const saved = await db
		.prepare('UPDATE pages SET draft = ?1, published = ?2, draft_updated_at = ?3 WHERE id = ?4 AND draft_updated_at = ?5')
		.bind(JSON.stringify(draft), published && JSON.stringify(published), draftUpdatedAt, pageId, page.draftUpdatedAt)
		.run()
	if (!saved.meta.changes) throw draftChanged()
	await upsertLinkStatement(db, next).run()
	forgetPublicNames()
	const snapshot = inPublished ? await snapshotOf(db, { ...page, draft, published, draftUpdatedAt }, settings) : null
	await putCopies([putLinkRecord(env, slug, toLinkRecord(next)), snapshot ? putSnapshot(env, snapshot) : null])
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
	if (row.status === 'active' && (routingChanged || moved || next.status !== 'active')) {
		await dropCopies(env, page ? [page.handle] : [], moved ? [row.slug, next.slug] : [row.slug])
	}
	await upsertLinkStatement(db, next).run()
	const snapshot = page ? await snapshotOf(db, page, settings) : null
	await putCopies([
		next.status === 'active' && (routingChanged || moved || row.status !== 'active') ? putLinkRecord(env, next.slug, toLinkRecord(next)) : null,
		snapshot ? putSnapshot(env, snapshot) : null,
	])
	return next
}

// ---------------------------------------------------------------- reads that repair KV

/** Falls back to D1 when KV has no record for a slug, and repairs KV. */
export async function linkRecordFromDb(env: Env, slug: string): Promise<LinkRecord | null> {
	await ensureSchema(env.DB)
	const row = await getLinkBySlug(env.DB, slug)
	if (!row || row.status !== 'active') return null
	const record = toLinkRecord(row)
	await putCopies([putLinkRecord(env, slug, record)])
	return record
}

/** Falls back to D1 when KV has no snapshot for a handle, and repairs KV. */
export async function snapshotFromDb(env: Env, handle: string): Promise<Snapshot | null> {
	await ensureSchema(env.DB)
	const [page, settings] = await Promise.all([getPageByHandle(env.DB, handle), loadSettings(env.DB)])
	const snapshot = page ? await snapshotOf(env.DB, page, settings) : null
	if (snapshot) await putCopies([putSnapshot(env, snapshot)])
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
