import { BACKUP_VERSION, mediaIdsOf, type Backup } from '../../shared/backup'
import { cssMediaIds } from '../../shared/css'
import { isHttpUrl, MEDIA_ID } from '../../shared/content'
import { otherLanguages } from '../../shared/locale'
import { normalizeSlug, slugProblem } from '../../shared/slug'
import { isValidTimeZone } from '../../shared/time'
import { problemMessage, publishProblems, SAME_ID } from '../../shared/validate'
import { msg } from '../../templates/msg'
import { ApiError } from '../types'
import {
	insertPageStatement,
	listLinks,
	listPages,
	publishedHandles,
	loadSettings,
	loadThemes,
	migrate,
	saveSettingsStatement,
	saveThemesStatement,
	upsertLinkStatement,
	type LinkRow,
} from './db'
import { NAME_PREFIX, SITE_KEY, toLinkRecord } from './cache'
import { KV_OPS_AT_ONCE } from './mode'
import { dropAgain, dropCopies, fontsAside, forgetSite, noteBeforeImport, rebuildCache, refuseTooLarge, sendOwed, setFontsAside } from './ops'

export async function exportData(env: Env): Promise<Backup> {
	const [pages, rows, settings, themes] = await Promise.all([
		listPages(env.DB),
		listLinks(env.DB),
		loadSettings(env.DB),
		loadThemes(env.DB),
	])
	const media = new Set<string>()
	if (settings.qrLogo) media.add(settings.qrLogo)
	for (const page of pages) {
		if (page.qrLogo) media.add(page.qrLogo)
		for (const id of mediaIdsOf(page.draft)) media.add(id)
		if (page.published) for (const id of mediaIdsOf(page.published)) media.add(id)
	}
	for (const theme of themes) {
		if (theme.coverImage) media.add(theme.coverImage)
		if (theme.bgImage) media.add(theme.bgImage)
		for (const id of cssMediaIds(theme.css ?? '')) media.add(id)
	}
	for (const row of rows) {
		const logo = (row.qr as { logoMedia?: unknown } | null)?.logoMedia
		if (typeof logo === 'string' && MEDIA_ID.test(logo)) media.add(logo)
	}
	return {
		app: 'fluxbio',
		version: BACKUP_VERSION,
		exportedAt: new Date().toISOString(),
		settings: {
			home: settings.home,
			timezone: settings.timezone,
			locale: settings.locale,
			languages: settings.languages,
			hostFonts: settings.hostFonts,
			bio: settings.bio,
			homeUrl: settings.homeUrl,
			qrLogo: settings.qrLogo,
		},
		pages: pages.map((page) => ({
			id: page.id,
			handle: page.handle,
			position: page.position,
			draft: page.draft,
			published: page.published,
			publishedAt: page.publishedAt,
			createdAt: page.createdAt,
			qrLogo: page.qrLogo,
		})),
		shortLinks: rows.map((row) => ({
			id: row.id,
			slug: row.slug,
			url: row.url,
			title: row.title,
			kind: row.kind,
			pageId: row.pageId,
			status: row.status,
			startsAt: row.startsAt,
			expiresAt: row.expiresAt,
			passwordHash: row.passwordHash,
			utm: { source: row.utmSource, medium: row.utmMedium, campaign: row.utmCampaign, content: row.utmContent },
			iosUrl: row.iosUrl,
			androidUrl: row.androidUrl,
			lineExternal: row.lineExternal,
			inAppPrompt: row.inAppPrompt,
			qr: row.qr ?? undefined,
			createdAt: row.createdAt,
		})),
		themes,
		media: [...media],
	}
}

/**
 * Replaces every page, short link and saved theme with the file's. Click
 * stats and API tokens stay as they are. Images must already be
 * uploaded (PUT /api/media/:id) under the ids the file uses.
 */
export async function importData(env: Env, backup: Backup): Promise<{ pages: number; shortLinks: number; copiesLeft?: true }> {
	const db = env.DB
	const names = new Set<string>()
	const claim = (name: string, label: string) => {
		if (names.has(name)) throw new ApiError(400, 'invalid', { key: msg('備份檔裡的「{name}」重複了（{label}）'), params: { name, label: { key: label } } })
		names.add(name)
	}
	const pageIds = new Set<string>()
	for (const page of backup.pages) {
		const handle = normalizeSlug(page.handle)
		if (slugProblem(handle)) throw new ApiError(400, 'invalid', { key: msg('備份檔裡的網址代稱「{handle}」格式不正確'), params: { handle: page.handle } })
		if (pageIds.has(page.id)) throw new ApiError(400, 'invalid', msg('備份檔裡有重複的頁面'))
		pageIds.add(page.id)
		claim(handle, msg('網址代稱'))
		refuseTooLarge(page.draft, page.published)
		// Published content goes straight to visitors, so it has to pass the same checks as the publish button.
		const problem = page.published ? publishProblems(page.published, handle).find((found) => found.key !== SAME_ID) : undefined
		if (problem) {
			throw new ApiError(400, 'invalid', { key: msg('備份檔裡「{handle}」已發布的內容有問題：{problem}'), params: { handle, problem: problemMessage(problem) } })
		}
	}
	if (!isValidTimeZone(backup.settings.timezone)) {
		throw new ApiError(400, 'invalid', { key: msg('備份檔裡的時區「{timezone}」格式不正確'), params: { timezone: backup.settings.timezone } })
	}
	const homeUrl = backup.settings.homeUrl.trim()
	if (homeUrl && !isHttpUrl(homeUrl)) throw new ApiError(400, 'invalid', { key: msg('{label}要以 http:// 或 https:// 開頭'), params: { label: { key: msg('首頁轉址') } } })
	const linkIds = new Set<string>()
	for (const link of backup.shortLinks) {
		if (linkIds.has(link.id)) throw new ApiError(400, 'invalid', msg('備份檔裡有重複的短網址'))
		linkIds.add(link.id)
		// Short links redirect to these addresses, so only web addresses get in, as everywhere else.
		if (!isHttpUrl(link.url) || [link.iosUrl, link.androidUrl].some((url) => url && !isHttpUrl(url))) {
			throw new ApiError(400, 'invalid', { key: msg('備份檔裡「{slug}」的網址要以 http:// 或 https:// 開頭'), params: { slug: link.slug } })
		}
		if (link.slug === `~${link.id}`) continue
		const slug = normalizeSlug(link.slug)
		if (slugProblem(slug)) throw new ApiError(400, 'invalid', { key: msg('備份檔裡的代稱「{slug}」格式不正確'), params: { slug: link.slug } })
		claim(slug, msg('短網址代稱'))
	}

	const [oldHandles, oldLinks, settings] = await Promise.all([publishedHandles(db), listLinks(db), loadSettings(db)])
	const now = Date.now()
	const rows: LinkRow[] = backup.shortLinks.map((link) => ({
		id: link.id,
		slug: link.slug.startsWith('~') ? link.slug : normalizeSlug(link.slug),
		url: link.url,
		title: link.title,
		kind: link.kind,
		pageId: link.kind === 'bio' && link.pageId && pageIds.has(link.pageId) ? link.pageId : null,
		status: link.kind === 'bio' && !(link.pageId && pageIds.has(link.pageId)) ? 'archived' : link.status,
		startsAt: link.startsAt,
		expiresAt: link.expiresAt,
		passwordHash: link.passwordHash,
		utmSource: link.utm.source,
		utmMedium: link.utm.medium,
		utmCampaign: link.utm.campaign,
		utmContent: link.utm.content,
		iosUrl: link.iosUrl,
		androidUrl: link.androidUrl,
		lineExternal: link.lineExternal,
		inAppPrompt: link.inAppPrompt,
		qr: link.qr ?? null,
		createdAt: link.createdAt,
		updatedAt: now,
	}))
	const home = pageIds.has(backup.settings.home) ? backup.settings.home : ''

	// Every old KV copy goes first, so nothing outdated is left for visitors if a later step fails.
	// A short link that comes back as it was keeps its copy: on the free plan a delete uses up the same 1,000 a day as a write.
	// Only one that comes back live: a link the backup has archived redirects nowhere, and a copy kept for it
	// would go on redirecting, with nothing in D1 left to change that would take it away.
	const incoming = new Map(rows.filter((row) => row.status === 'active' && !row.slug.startsWith('~')).map((row) => [row.slug, JSON.stringify(toLinkRecord(row))]))
	const dropped = [
		...oldHandles,
		...oldLinks
			.filter((row) => row.status === 'active' && !row.slug.startsWith('~') && incoming.get(row.slug) !== JSON.stringify(toLinkRecord(row)))
			.map((row) => row.slug),
	]
	// One request may start KV_OPS_AT_ONCE operations, and each name is deleted twice (below). Past that, nothing is
	// deleted name by name: KV is asked for one thing, so that nothing changes if it is refusing, it is noted that
	// every copy in KV is old (Owed.purge), and after D1 has the backup KV's own list of names is gone through from
	// the start, a slice here and the rest by the calls that follow. Until then a name not reached yet answers as before.
	const large = dropped.length > (KV_OPS_AT_ONCE - 2) / 2
	if (large) {
		// The one thing: the "site" record goes, which "/" then asks D1 for until it is written again below. Taking
		// the home page's copy out of it (dropCopies) asks KV for nothing when there is no such copy.
		try {
			await env.KV.delete(SITE_KEY)
			forgetSite()
		} catch (error) {
			console.error('KV refused a delete', error)
			throw new ApiError(503, 'kv', msg('Cloudflare KV 暫時寫不進去，這次的修改沒有儲存，請稍後再試。'))
		}
	} else await dropCopies(env, dropped, [], { home: true })
	// The pages' font files go with the pages. Their lists are set aside in the same batch that replaces the pages,
	// and the files deleted by them, here as far as this request goes and by the calls that follow.
	const fonts = Boolean(await db.prepare('SELECT 1 FROM pages WHERE fonts IS NOT NULL LIMIT 1').first())
	const takeBack = large || fonts ? await noteBeforeImport(db, { everyCopy: large, fonts }) : null
	const replace = (statements: D1PreparedStatement[]) =>
		db.batch(statements).catch(async (error: unknown) => {
			// D1 refused the backup, and holds what it held: nothing is owed for it.
			await takeBack?.().catch((failed: unknown) => console.error('Could not take back what was noted for an import', failed))
			throw error
		})
	await replace([
		...setFontsAside(db),
		db.prepare('DELETE FROM page_versions'),
		db.prepare('DELETE FROM pages'),
		db.prepare('DELETE FROM links'),
		...backup.pages.map((page) =>
			insertPageStatement(db, {
				id: page.id,
				handle: normalizeSlug(page.handle),
				position: page.position,
				draft: page.draft,
				published: page.published,
				draftUpdatedAt: now,
				publishedAt: page.published ? (page.publishedAt ?? now) : null,
				createdAt: page.createdAt,
				qrLogo: page.qrLogo,
			}),
		),
		...rows.map((row) => upsertLinkStatement(db, row)),
		saveSettingsStatement(db, {
			...settings,
			home,
			timezone: backup.settings.timezone,
			locale: backup.settings.locale,
			languages: otherLanguages(backup.settings.locale, backup.settings.languages),
			hostFonts: backup.settings.hostFonts,
			qrLogo: backup.settings.qrLogo,
			bio: backup.settings.bio,
			homeUrl,
		}),
		saveThemesStatement(db, backup.themes),
	])

	// The home copy taken out above and the "site" record written below are two of this request's operations.
	let budget = KV_OPS_AT_ONCE - 2
	if (!large) {
		// None of those names gets a fresh copy here, so each is deleted once more (dropAgain): a visit while the
		// copies were going read the old rows and may have put one back.
		await dropAgain(env, dropped)
		budget -= dropped.length * 2
	}
	await rebuildCache(env)
	// Noted again, by what D1 holds now: the note from before the batch may have been settled by another request
	// that found nothing set aside yet, and a page may have got its list after it was looked for.
	const aside = await fontsAside(db)
	if (large || aside) await noteBeforeImport(db, { everyCopy: large, fonts: aside })
	const { copiesLeft } = large || aside ? await sendOwed(env, Math.max(0, budget)) : { copiesLeft: false }
	return { pages: backup.pages.length, shortLinks: rows.length, ...(copiesLeft ? { copiesLeft: true as const } : {}) }
}

/**
 * Puts the deployment back to a fresh install: every table is dropped and
 * created again by the migrations, and KV is emptied. Only the deployment
 * secret stays, so the owner stays signed in.
 *
 * D1 is done in this one call, whatever KV does. KV is emptied as far as one request may (emptyKv), and `keysLeft`
 * says when there is more: calling again takes the rest, and finds the tables already empty.
 */
export async function clearAllData(env: Env): Promise<{ keys: number; keysLeft: boolean }> {
	const db = env.DB
	// D1 keeps its own tables under _cf_; SQLite's are sqlite_*.
	const { results } = await db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != '_meta' AND name NOT LIKE 'sqlite^_%' ESCAPE '^' AND name NOT LIKE '^_cf^_%' ESCAPE '^'")
		.all<{ name: string }>()
	await db.batch([
		...results.map(({ name }) => db.prepare(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`)),
		db.prepare("DELETE FROM _meta WHERE key != 'secret'"),
	])
	forgetSite()
	// The tables come straight back, before KV: a copy of the Worker that has checked its schema doesn't check again, so
	// tables left missing would fail every request it takes. Neither step waits on the other succeeding: if the migrations
	// fail (say, racing another isolate), KV is still emptied, so nothing old is left for visitors and a retry finishes.
	let failed: unknown
	try {
		await migrate(db)
	} catch (error) {
		failed = error
	}
	const { keys, left } = await emptyKv(env)
	if (failed) throw failed
	return { keys, keysLeft: left }
}

/**
 * Empties KV as far as one request may: KV_OPS_AT_ONCE operations, its lists counted in. What a visitor is answered from
 * goes first, the names and then the "site" record; pictures and fonts are only reached through those. A list or a delete
 * that KV refuses, as on a day whose quota is used up, stops it there. `left` says there is more for another call.
 */
export async function emptyKv(env: Env): Promise<{ keys: number; left: boolean }> {
	let budget = KV_OPS_AT_ONCE
	const gone = new Set<string>()
	for (const prefix of [NAME_PREFIX, SITE_KEY, undefined]) {
		let cursor: string | undefined
		do {
			// One for the list, one for a key it names.
			if (budget < 2) return { keys: gone.size, left: true }
			try {
				const page = await env.KV.list({ prefix, cursor, limit: Math.min(1000, budget - 1) })
				// A list can still name a key deleted a moment ago, and the last pass lists the first two again.
				const doomed = page.keys.map((key) => key.name).filter((name) => !gone.has(name))
				budget -= 1 + doomed.length
				const results = await Promise.allSettled(doomed.map((name) => env.KV.delete(name)))
				results.forEach((result, index) => {
					if (result.status === 'fulfilled') gone.add(doomed[index]!)
				})
				const refused = results.find((result) => result.status === 'rejected')
				if (refused) throw refused.reason
				cursor = page.list_complete ? undefined : page.cursor
			} catch (error) {
				console.error('KV kept keys during a wipe', error)
				return { keys: gone.size, left: true }
			}
		} while (cursor)
	}
	return { keys: gone.size, left: false }
}
