import type { PublishResponse } from '../../../shared/api'
import { emptyContent, linkItems, newId, type Locale, type PageContent, type ThemeId } from '../../../shared/content'
import { normalizeSlug, slugFromText, slugFromUrl, uniqueSlug } from '../../../shared/slug'
import { duplicateContent, starterContent, starterWords, type StarterId } from '../../../shared/starters'
import { untranslated, usedTranslations } from '../../../shared/translations'
import { problemMessage, publishProblems, type Problem } from '../../../shared/validate'
import { fill, msg } from '../../../templates/msg'
import { ApiError } from '../../types'
import { deleteNamed, putLinkRecord, putSnapshot, toLinkRecord } from '../cache'
import {
	forgetPublicNames,
	getLinksByIds,
	getPage,
	getPageByHandle,
	hasOtherPage,
	homeIfNoneStatement,
	insertPageStatement,
	lastPosition,
	listOwnLinks,
	loadSettings,
	noLongerHomeStatement,
	ownersOf,
	pageVersionStatements,
	upsertLinkStatement,
	type LinkRow,
	type PageRow,
} from '../db'
import { deleteFontFiles, hostFonts, unusedFontFiles } from '../fonts'
import { VERSIONS_KEPT } from '../mode'
import {
	assertNameFree,
	blankLink,
	draftChanged,
	dropAgain,
	dropCopies,
	numberedSlugs,
	putCopies,
	refuseTooLarge,
	relist,
	siteFromDb,
	snapshotOf,
	takeBackIfOld,
	takenAmong,
	writeSite,
} from './kv'

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
				WHERE id = ?3 RETURNING draft_updated_at AS version, handle, draft IS ?1 AS replaced`,
			)
			.bind(JSON.stringify(content), now, pageId, fonts ? JSON.stringify(fonts) : null, page.draftUpdatedAt, draftUpdatedAt),
	)
	// Links that were live and now change or leave lose their KV copy first, and so does the page.
	const replaced = ownRows.filter((row) => row.status === 'active' && !row.slug.startsWith('~') && !unchanged.has(row.slug))
	await dropCopies(env, [page.handle], replaced.map((row) => row.slug), { home: settings.home === pageId })
	// What D1 has by now, which is not always what was meant: the draft is kept where one was saved while fonts were
	// being copied, and the page may have been given another address.
	const stored = (await db.batch<{ version: number; handle: string; replaced: number }>(statements)).at(-1)?.results[0]
	// By what the draft is, not by its version: a save in the same millisecond has the number this one meant to write.
	forgetPublicNames()
	if (!stored) {
		// The page was deleted meanwhile. Its links and this version were written all the same: they go as the
		// page's own did, and no copy is written for a page D1 doesn't have.
		await db.batch([
			db.prepare("UPDATE links SET status = 'archived', slug = '~' || id, updated_at = ?1 WHERE kind = 'bio' AND page_id = ?2").bind(Date.now(), pageId),
			db.prepare('DELETE FROM page_versions WHERE page_id = ?1').bind(pageId),
		])
		// Every link the batch made live, the ones that didn't change too: a visit meanwhile may have put any back.
		await dropAgain(env, [page.handle, ...[...live.values()].map((link) => normalizeSlug(link.slug)), ...replaced.map((row) => row.slug)])
		await deleteFontFiles(env, unusedFontFiles(fonts, page.fonts))
		throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	}
	const draftKept = !stored.replaced
	const handle = stored.handle
	// The slugs that left the page or changed are written nowhere below.
	const written = new Set(freshLinks.map((row) => row.slug))
	const leftBehind = replaced.map((row) => row.slug).filter((slug) => !written.has(slug))
	if (draftKept) {
		// A link given another short address meanwhile has it in the draft that was kept, and in KV, while its
		// row is back at the address that went live: that copy would go on redirecting with nothing behind it.
		const kept = await getPage(db, pageId)
		const went = new Set(links.map((link) => normalizeSlug(link.slug)))
		leftBehind.push(...(kept ? linkItems(kept.draft).map((link) => normalizeSlug(link.slug)).filter((slug) => slug && !went.has(slug)) : []))
	}
	await dropAgain(env, leftBehind)

	// With pages off, the published version waits in D1 until they are on again.
	const snapshot = await snapshotOf(db, { ...page, handle, published: content, publishedAt: now, draft: content, fonts }, settings)
	await putCopies([
		snapshot ? putSnapshot(env, snapshot) : null,
		...freshLinks.map((row) => putLinkRecord(env, row.slug, toLinkRecord(row))),
		settings.home === pageId ? writeSite(env, settings) : null,
	])
	if (!page.published && settings.home !== pageId) await relist(env)
	await deleteFontFiles(env, unusedFontFiles(page.fonts, fonts))
	return { publishedAt: now, content, draftUpdatedAt: stored.version, untranslated: untranslated(content, settings.languages), ...(draftKept ? { draftKept: true as const } : {}) }
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
	// As D1 has the page after the move: it may have been published since it was read above, and the copy at its
	// new address must not be what it was before that. Checked once more when it is in KV, as a visit's rebuild is.
	const renamed = (await getPage(db, id)) ?? { ...page, handle }
	const snapshot = await snapshotOf(env.DB, renamed, settings)
	// The "site" record too, where this is the home page: made from D1 and checked against it (siteFromDb).
	await putCopies([snapshot ? putSnapshot(env, snapshot) : null, settings.home === id ? siteFromDb(env) : null])
	if (snapshot) {
		const copy = JSON.stringify(snapshot)
		await takeBackIfOld(
			undefined,
			async () => {
				const [now, current] = await Promise.all([getPageByHandle(db, handle), loadSettings(db)])
				return JSON.stringify(now ? await snapshotOf(db, now, current) : null) !== copy
			},
			() => deleteNamed(env, handle),
		)
	}
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
