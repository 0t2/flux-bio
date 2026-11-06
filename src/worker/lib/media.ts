import { MEDIA_ID } from '../../shared/content'
import { isShippableMediaId } from '../../shared/mediaAssets'
import { MEDIA_PREFIX, mediaKey } from './cache'
import { KV_OPS_AT_ONCE } from './mode'

/**
 * Pictures nothing uses any more. An upload is one KV entry that never changes, and nothing deletes it when a page
 * stops showing it: a replaced avatar, a picture taken out of a gallery, the share card from before the name changed.
 * They cost no daily quota, only room in KV, so nothing here runs by itself: the owner's AI asks what is unused
 * (GET /api/media/unused) and has it deleted (DELETE), after saying that it can't be undone.
 *
 * A picture counts as used when its id appears anywhere a page could bring it back from: a draft, what is published,
 * any published version still kept, a QR code's picture, the settings and the saved themes. D1 looks, not the Worker,
 * and it looks at every text in them, not at a list of fields: a field added later is covered without anyone
 * remembering this file, and so is an address inside someone's own HTML. That thoroughness is paid for in D1 rows
 * read: a few hundred for each page and each kept version that has a picture, so this is for now and then, on request.
 */

/** A picture uploaded this recently stays even with nothing using it: an AI uploads first and builds the page after, sometimes days later. */
export const UNUSED_AFTER = 7 * 24 * 60 * 60 * 1000

/** KV lists 1,000 keys a call, and the free plan allows 1,000 lists a day. Past this many a call says there is more. */
const LISTS_AT_ONCE = 5

const PICTURE_ENDINGS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']

/** Texts that could name a picture: short ones ending like a picture file, and any that hold an address under /media/. */
const namesPicture = `j.type = 'text' AND ((length(j.atom) <= 80 AND (${PICTURE_ENDINGS.map((ending) => `j.atom LIKE '%.${ending}'`).join(' OR ')})) OR instr(j.atom, '/media/') > 0)`

/**
 * Every such text in one JSON column. D1 counts each value json_tree walks through as a row read, a few hundred for a
 * page, so a row is only opened when its text holds something that looks like a picture at all. A value that isn't
 * JSON has none, and mustn't stop the rest from being read.
 */
function textsIn(table: string, column: string, where = ''): string {
	const value = `${table}.${column}`
	const mayName = `(${PICTURE_ENDINGS.map((ending) => `${value} LIKE '%.${ending}%'`).join(' OR ')} OR instr(${value}, '/media/') > 0)`
	return `SELECT DISTINCT j.atom AS text FROM ${table}, json_tree(CASE WHEN ${mayName} AND json_valid(${value}) THEN ${value} END) AS j WHERE ${namesPicture}${where}`
}

/** The ids of pictures something still uses, and of anything else that merely reads like one: too many is safe, too few is not. */
export async function usedMedia(db: D1Database): Promise<Set<string>> {
	const results = await db.batch<{ text: string | null }>([
		db.prepare(textsIn('pages', 'draft')),
		db.prepare(textsIn('pages', 'published')),
		db.prepare(textsIn('page_versions', 'content')),
		db.prepare(textsIn('links', 'qr')),
		// Only these two keys: the table also holds the deployment's secret.
		db.prepare(textsIn('_meta', 'value', " AND _meta.key IN ('settings', 'themes')")),
		db.prepare('SELECT qr_logo AS text FROM pages WHERE qr_logo IS NOT NULL'),
	])
	const used = new Set<string>()
	for (const { text } of results.flatMap((result) => result.results)) {
		if (!text) continue
		if (MEDIA_ID.test(text)) used.add(text)
		for (const match of text.matchAll(/\/media\/([\w.-]+)/g)) if (match[1]) used.add(match[1])
	}
	return used
}

/**
 * Pictures in KV that nothing uses and that weren't uploaded lately. An id that doesn't end like a picture file is
 * never among them: nothing here could tell whether something refers to it. `more` says KV has pictures this call
 * didn't get to.
 */
export async function unusedMedia(env: Env, now = Date.now()): Promise<{ ids: string[]; more: boolean }> {
	const used = await usedMedia(env.DB)
	const ids: string[] = []
	let cursor: string | undefined
	for (let lists = 0; lists < LISTS_AT_ONCE; lists++) {
		const page = await env.KV.list<{ at?: number }>({ prefix: MEDIA_PREFIX, cursor, limit: 1000 })
		for (const key of page.keys) {
			const id = key.name.slice(MEDIA_PREFIX.length)
			if (!isShippableMediaId(id) || used.has(id)) continue
			// Pictures from before uploads were dated have no date, and are old enough.
			if ((key.metadata?.at ?? 0) > now - UNUSED_AFTER) continue
			ids.push(id)
		}
		cursor = page.list_complete ? undefined : page.cursor
		if (!cursor) break
	}
	return { ids, more: Boolean(cursor) }
}

/** Deletes them, as many as one request may; `more` says to ask again. */
export async function deleteUnusedMedia(env: Env, now = Date.now()): Promise<{ deleted: number; more: boolean }> {
	const { ids, more } = await unusedMedia(env, now)
	const doomed = ids.slice(0, KV_OPS_AT_ONCE)
	const results = await Promise.allSettled(doomed.map((id) => env.KV.delete(mediaKey(id))))
	const failed = results.filter((result) => result.status === 'rejected')
	for (const result of failed) console.error('KV kept an unused picture', (result as PromiseRejectedResult).reason)
	return { deleted: doomed.length - failed.length, more: more || ids.length > doomed.length || failed.length > 0 }
}
