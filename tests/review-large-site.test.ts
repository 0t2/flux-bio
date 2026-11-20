import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Backup } from '../src/shared/backup'
import type { StateResponse } from '../src/shared/api'
import { emptyContent } from '../src/shared/content'
import { importData } from '../src/worker/lib/backup'
import { NAME_PREFIX, SITE_KEY } from '../src/worker/lib/cache'
import { ensureSchema } from '../src/worker/lib/db'
import { KV_OPS_AT_ONCE } from '../src/worker/lib/mode'
import { updateSettings } from '../src/worker/lib/ops'
import { api, apiJson, visit } from './helpers'

// A site with more published pages than one request may tell KV about: Cloudflare takes about a thousand KV
// operations from one request, and KV_OPS_AT_ONCE is what this code allows itself. Whatever a change has to do to
// every page is done a slice a request, and what is left has to be reached by the calls after it, each going on from
// where the last stopped: not by doing the same first slice again, and not by starting more than a request may.

const EXTRA = 10
const PAGES = KV_OPS_AT_ONCE + EXTRA
const handle = (n: number) => `large-${String(n).padStart(4, '0')}`

/** The same bindings, with every KV operation counted and, unless `refuse` says otherwise, done. */
function counting(refuse: (operation: 'put' | 'delete' | 'list', key: string) => boolean = () => false) {
	const seen = { puts: [] as string[], deletes: [] as string[], lists: 0 }
	const KV = new Proxy(env.KV, {
		get(target, key) {
			const real = Reflect.get(target, key) as unknown
			if (key === 'put' || key === 'delete' || key === 'list') {
				return (...args: unknown[]) => {
					const name = typeof args[0] === 'string' ? args[0] : ''
					if (key === 'list') seen.lists++
					else seen[key === 'put' ? 'puts' : 'deletes'].push(name)
					if (refuse(key, name)) return Promise.reject(new Error(`KV ${key} failed: 429 Too Many Requests`))
					return (real as (...all: unknown[]) => unknown).apply(target, args)
				}
			}
			return typeof real === 'function' ? (real as (...all: unknown[]) => unknown).bind(target) : real
		},
	})
	const operations = () => seen.puts.length + seen.deletes.length + seen.lists
	const reset = () => {
		seen.puts.length = 0
		seen.deletes.length = 0
		seen.lists = 0
	}
	return { env: { ...env, KV } as Env, seen, operations, reset }
}

const noted = async () => {
	const row = await env.DB.prepare("SELECT value FROM _meta WHERE key = 'copies-owed'").first<{ value: string }>()
	return row ? (JSON.parse(row.value) as { site: boolean; pages: string[]; after: string | null; purge: string | null; fonts: boolean }) : null
}
const status = async (path: string) => (await visit(path)).status
const names = async () => {
	const found: string[] = []
	let cursor: string | undefined
	do {
		const page = await env.KV.list({ prefix: NAME_PREFIX, cursor })
		found.push(...page.keys.map((key) => key.name.slice(NAME_PREFIX.length)))
		cursor = page.list_complete ? undefined : page.cursor
	} while (cursor)
	return found
}

beforeAll(async () => {
	await ensureSchema(env.DB)
	const now = Date.now()
	const insert = env.DB.prepare('INSERT INTO pages (id, handle, position, draft, published, draft_updated_at, published_at, created_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?5, ?5)')
	const content = JSON.stringify(emptyContent('Shop'))
	const pages = Array.from({ length: PAGES }, (_, n) => insert.bind(`large-${n}`, handle(n), n, content, now))
	for (let n = 0; n < pages.length; n += 90) await env.DB.batch(pages.slice(n, n + 90))
})

describe('a change to every page’s copy, as another language is', () => {
	it('drops them across calls, each going on from the last, and then stops', async () => {
		const kv = counting()
		const call = async (patch: Parameters<typeof updateSettings>[1]) => {
			kv.reset()
			const { copiesLeft } = await updateSettings(kv.env, patch)
			return { copiesLeft, dropped: kv.seen.deletes.length, written: kv.seen.puts.length }
		}
		// One request starts so many KV operations and no more: the "site" record, and pages' copies with the rest.
		expect(await call({ languages: ['ja'] })).toEqual({ copiesLeft: true, dropped: KV_OPS_AT_ONCE - 1, written: 1 })
		const first = new Set(kv.seen.deletes)
		// Whatever is changed next finishes it, with the pages the first call didn't reach and no others.
		expect(await call({ plan: 'paid' })).toEqual({ copiesLeft: false, dropped: EXTRA + 1, written: 0 })
		expect(kv.seen.deletes.some((name) => first.has(name))).toBe(false)
		expect(new Set([...first, ...kv.seen.deletes]).size).toBe(PAGES)
		// And then nothing is owed.
		expect(await call({ plan: 'free' })).toEqual({ copiesLeft: false, dropped: 0, written: 0 })
		expect(await noted()).toBeNull()
		await updateSettings(env, { languages: [] })
		await updateSettings(env, {})
	}, 60_000)
})

describe('copying fonts turned off', () => {
	const FILES = 4
	const WITH_FONTS = 250
	const fonts = (n: number) => JSON.stringify([{ family: 'Noto Sans', axis: 'wght', key: `k${n}`, faces: Array.from({ length: FILES }, (_, face) => ({ weight: String(400 + face * 100), file: `large-${n}-abc-${face}` })) }])
	const listed = async () => (await env.DB.prepare('SELECT count(*) AS n FROM pages WHERE fonts IS NOT NULL').first<{ n: number }>())!.n
	const give = async () => {
		const set = env.DB.prepare('UPDATE pages SET fonts = ?1 WHERE id = ?2')
		const rows = Array.from({ length: WITH_FONTS }, (_, n) => set.bind(fonts(n), `large-${n}`))
		for (let n = 0; n < rows.length; n += 90) await env.DB.batch(rows.slice(n, n + 90))
		await env.DB.prepare("UPDATE _meta SET value = json_set(value, '$.hostFonts', json('true')) WHERE key = 'settings'").run()
	}

	it('deletes every page’s font files, a request’s worth at a time, and forgets a page’s list only then', async () => {
		await give()
		const kv = counting()
		const files = new Set<string>()
		let calls = 0
		let left = true
		for (let patch: Parameters<typeof updateSettings>[1] = { hostFonts: false }; left; patch = {}) {
			kv.reset()
			left = (await updateSettings(kv.env, patch)).copiesLeft
			// Pages' copies and font files together, and still no more than one request may start.
			expect(kv.operations()).toBeLessThanOrEqual(KV_OPS_AT_ONCE)
			for (const name of kv.seen.deletes) if (name.startsWith('font:')) files.add(name)
			expect(++calls).toBeLessThan(12)
		}
		expect(calls).toBeGreaterThan(1)
		expect(files.size).toBe(WITH_FONTS * FILES)
		expect(await listed()).toBe(0)
		expect(await noted()).toBeNull()
	}, 60_000)

	it('keeps the list of a page whose files KV wouldn’t delete, and tries them again', async () => {
		await give()
		// Pages' copies first, so that what follows is the font files alone.
		const refusing = counting((operation, key) => operation === 'delete' && key.startsWith('font:'))
		await expect(updateSettings(refusing.env, { hostFonts: false })).resolves.toMatchObject({ copiesLeft: true })
		await expect(updateSettings(refusing.env, {})).rejects.toMatchObject({ status: 503 })
		expect(await listed()).toBe(WITH_FONTS)
		expect((await noted())?.fonts).toBe(true)
		let left = true
		for (let calls = 0; left && calls < 12; calls++) left = (await updateSettings(env, {})).copiesLeft
		expect(await listed()).toBe(0)
		expect(await noted()).toBeNull()
	}, 60_000)
})

describe('pages switched off', () => {
	it('takes offline as many as one request may, says there are more, and goes on at every look at the site’s state', async () => {
		// Two pages that visitors have been to, and so have copies: the first in order and the last.
		expect([await status(`/${handle(0)}`), await status(`/${handle(PAGES - 1)}`)]).toEqual([200, 200])
		const kv = counting()
		expect(await updateSettings(kv.env, { bio: false })).toMatchObject({ copiesLeft: true })
		expect(kv.operations()).toBeLessThanOrEqual(KV_OPS_AT_ONCE)
		expect(kv.seen.puts).toEqual([SITE_KEY])
		expect(JSON.parse((await env.KV.get(SITE_KEY))!).bio).toBe(false)
		// What was reached is offline. What wasn't is public until it is, which the note is there to see to.
		expect(await status(`/${handle(0)}`)).toBe(404)
		expect(await status(`/${handle(PAGES - 1)}`)).toBe(200)
		expect((await noted())?.after).toBe(handle(KV_OPS_AT_ONCE - 2))
		// The dashboard opens, or the owner's AI reads the state: no setting is saved, and the rest goes.
		expect((await apiJson<StateResponse>('/state')).settings.bio).toBe(false)
		expect(await status(`/${handle(PAGES - 1)}`)).toBe(404)
		expect(await noted()).toBeNull()
		// And no page comes back by being visited while pages are off.
		expect(await status(`/${handle(5)}`)).toBe(404)
		expect(await names()).toEqual([])
	}, 60_000)

	it('goes back when KV refuses the first of it, as on any site', async () => {
		expect((await updateSettings(env, { bio: true })).copiesLeft).toBe(false)
		const refusing = counting((operation) => operation !== 'list')
		await expect(updateSettings(refusing.env, { bio: false })).rejects.toMatchObject({ status: 503 })
		expect(refusing.operations()).toBeLessThanOrEqual(KV_OPS_AT_ONCE + 1)
		expect((await apiJson<StateResponse>('/state')).settings.bio).toBe(true)
		expect(await status(`/${handle(3)}`)).toBe(200)
	}, 60_000)

	it('drops the copies an unfinished switch left when pages come back, since they are from before', async () => {
		expect([await status(`/${handle(1)}`), await status(`/${handle(PAGES - 1)}`)]).toEqual([200, 200])
		expect(await updateSettings(env, { bio: false })).toMatchObject({ copiesLeft: true })
		// The last page's copy is still there, and the page is published again while pages are off.
		expect(await names()).toContain(handle(PAGES - 1))
		await env.DB.prepare('UPDATE pages SET published = ?1, published_at = published_at + 1 WHERE handle = ?2').bind(JSON.stringify(emptyContent('Shop, as it is now')), handle(PAGES - 1)).run()
		const kv = counting()
		const back = await updateSettings(kv.env, { bio: true })
		expect(kv.operations()).toBeLessThanOrEqual(KV_OPS_AT_ONCE)
		for (let calls = 0, left = back.copiesLeft; left && calls < 5; calls++) left = (await updateSettings(env, {})).copiesLeft
		expect(await (await visit(`/${handle(PAGES - 1)}`)).text()).toContain('Shop, as it is now')
		expect(await noted()).toBeNull()
	}, 60_000)
})

describe('a backup brought in', () => {
	it('deletes every old copy by KV’s own list, a request’s worth at a time, where there are too many to name', async () => {
		const backup = await apiJson<Backup>('/export')
		expect(backup.pages.length).toBeGreaterThanOrEqual(PAGES)
		// Copies that visitors left: a page the backup keeps, one it doesn't, and more names than one request deletes.
		const kept = backup.pages.find((page) => page.handle === handle(1))!
		expect([await status(`/${handle(1)}`), await status(`/${handle(700)}`)]).toEqual([200, 200])
		const many = Array.from({ length: KV_OPS_AT_ONCE + 100 }, (_, n) => `${NAME_PREFIX}old-name-${String(n).padStart(4, '0')}`)
		for (let n = 0; n < many.length; n += 100) await Promise.all(many.slice(n, n + 100).map((name) => env.KV.put(name, '{}')))
		backup.pages = [{ ...kept, published: { ...kept.published!, profile: { ...kept.published!.profile, name: 'Shop, from the backup' } } }]
		backup.settings.home = ''

		const kv = counting()
		const answer = await importData(kv.env, backup)
		expect(answer).toMatchObject({ pages: 1, copiesLeft: true })
		expect(kv.operations()).toBeLessThanOrEqual(KV_OPS_AT_ONCE)
		expect((await noted())?.purge).toBeTruthy()
		// Reading the state goes on with it, and then nothing old answers: not the page that is gone, and not the
		// one that stayed as it was before.
		for (let calls = 0; (await noted()) && calls < 5; calls++) await apiJson<StateResponse>('/state')
		expect(await noted()).toBeNull()
		expect((await names()).filter((name) => name.startsWith('old-name-'))).toEqual([])
		expect(await status(`/${handle(700)}`)).toBe(404)
		expect(await (await visit(`/${handle(1)}`)).text()).toContain('Shop, from the backup')
	}, 120_000)

	it('says so, and changes nothing, when KV is refusing before it starts', async () => {
		const before = (await apiJson<StateResponse>('/state')).pages.length
		const backup = await apiJson<Backup>('/export')
		// More names than can be named, by short links this time.
		const insert = env.DB.prepare("INSERT INTO links (id, slug, url, title, kind, page_id, status, created_at, updated_at) VALUES (?1, ?2, 'https://example.com/x', 'x', 'solo', NULL, 'active', 1, 1)")
		const rows = Array.from({ length: KV_OPS_AT_ONCE / 2 + 5 }, (_, n) => insert.bind(`many-${n}`, `many-${n}`))
		for (let n = 0; n < rows.length; n += 90) await env.DB.batch(rows.slice(n, n + 90))
		const refusing = counting((operation) => operation !== 'list')
		await expect(importData(refusing.env, { ...backup, pages: [] })).rejects.toMatchObject({ status: 503 })
		expect((await apiJson<StateResponse>('/state')).pages).toHaveLength(before)
		expect((await api('/links?limit=1')).status).toBe(200)
	}, 60_000)
})
