import type { Settings } from '../../../shared/content'
import type { HostedFont } from '../../../shared/fonts'
import { otherLanguages } from '../../../shared/locale'
import { msg } from '../../../templates/msg'
import { ApiError } from '../../types'
import { deleteNamed, NAME_PREFIX, putSnapshot } from '../cache'
import { changeSettings, getPagesByIds, loadSettings, loadSettingsWith, publishedHandlesAfter, recentlyPublishedPages } from '../db'
import { fontKey, hostFonts, parseHostedFonts, unusedFontFiles } from '../fonts'
import { FONT_PAGES_AT_ONCE, KV_OPS_AT_ONCE } from '../mode'
import { putCopies, sitePages, siteRecord, snapshotOf, storeSite } from './kv'

/**
 * What KV still has to be told after a settings change. It is written to _meta before KV is told and taken out when
 * KV has been, so a change that reached D1 and not KV (the day's writes used up, a request cut short) is finished
 * by the next settings call, whatever that one asks for.
 */
export interface Owed {
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

export const COPIES_OWED = 'copies-owed'
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

/**
 * Tells KV what it is owed, from the settings as they are now, within `budget` KV operations, and answers with what
 * is still owed after that: more than one request may do (`copiesLeft`), or all that KV refused (`refused`).
 */
export async function tellKv(env: Env, owed: Owed, budget = KV_OPS_AT_ONCE, { fontsLater = false } = {}): Promise<{ owed: Owed; copiesLeft: boolean; refused: unknown; budget: number }> {
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
		if (owed.fonts && !fontsLater && !refused) {
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
	const copiesLeft = !refused && (owed.site || owed.after !== null || owed.purge !== null || (owed.fonts && !fontsLater))
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

/** Sets lists of one page's font files aside, with any that are waiting already (setFontsAside). */
function fontsAsideStatements(db: D1Database, pageId: string, lists: (HostedFont[] | null)[]): D1PreparedStatement[] {
	const some = lists.filter((list): list is HostedFont[] => Boolean(list?.length))
	if (!some.length) return []
	return [
		db
			.prepare(
				`INSERT INTO _meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value =
				 (SELECT json_group_array(json(value)) FROM (SELECT value FROM json_each(_meta.value) UNION ALL SELECT value FROM json_each(excluded.value)))`,
			)
			.bind(`${FONTS_ASIDE}${pageId}`, JSON.stringify(some)),
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
	const gone: { key: string; listed: string }[] = []
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
		gone.push(row)
	}
	// Each as it was read: a list set aside for the page since then is not forgotten with it.
	if (gone.length) await env.DB.batch(gone.map((row) => env.DB.prepare('DELETE FROM _meta WHERE key = ?1 AND value = ?2').bind(row.key, row.listed)))
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
export function owedBy(previous: Settings, next: Settings): Owed {
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
export function owedTogether(a: Owed, b: Owed): Owed {
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
export function owedNote(db: D1Database, text: string | null) {
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
export async function switchBio(env: Env, previous: Settings, next: Settings, budget: number): Promise<{ used: number; after: string | null }> {
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
 * Brings copied fonts in line with new settings, and answers with how many files it wrote and whether it set lists
 * aside whose files a later call is to delete.
 * With copying on, the most recent pages are copied now; the others use the visitor's own fonts, as any page whose
 * fonts aren't copied does, until they are next published.
 */
export async function refreshFonts(env: Env, previous: Settings, next: Settings): Promise<{ written: number; aside: boolean }> {
	if (!next.hostFonts) {
		// Turned off: the pages' lists are set aside for the files to be deleted by, a slice a call (dropFontFiles).
		if (previous.hostFonts) await env.DB.batch(setFontsAside(env.DB))
		return { written: 0, aside: false }
	}
	const pages = await recentlyPublishedPages(env.DB, FONT_PAGES_AT_ONCE)
	const refreshed = await Promise.all(pages.map(async (page) => ({ ...page, fonts: page.published ? await hostFonts(env, { ...page, published: page.published }, next) : page.fonts })))
	const changed = refreshed.map((page, i) => ({ page, before: pages[i]! })).filter(({ page, before }) => JSON.stringify(page.fonts) !== JSON.stringify(before.fonts))
	if (changed.length) {
		await env.DB.batch(
			changed.flatMap(({ page, before }) => [
				// A page published since it was read has that publish's fonts, made from what it shows now: these
				// were made from what it showed before, and are not written over them.
				env.DB.prepare('UPDATE pages SET fonts = ?1 WHERE id = ?2 AND published_at IS ?3').bind(page.fonts ? JSON.stringify(page.fonts) : null, page.id, before.publishedAt),
				// Neither list's files are deleted here. A publish that read the page before this, and lands after
				// it, writes the old list back, and its files have to be there; one that landed first leaves the
				// new list's with nothing to name them. So both lists are set aside, and a later call deletes the
				// files of whichever the page doesn't list by then (dropFontFiles).
				...fontsAsideStatements(env.DB, page.id, [before.fonts, page.fonts]),
			]),
		)
	}
	// A file a page had already is not written again; the others each took a KV operation of this request's.
	return { written: refreshed.flatMap((page, i) => unusedFontFiles(page.fonts, pages[i]?.fonts ?? null)).length, aside: changed.length > 0 }
}
