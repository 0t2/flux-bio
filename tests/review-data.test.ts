import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { StateResponse } from '../src/shared/api'
import { NAME_PREFIX, SITE_KEY } from '../src/worker/lib/cache'
import { migrate, SCHEMA_VERSION } from '../src/worker/lib/db'
import { deletePage, linkRecordFromDb, updateLink, updateSettings } from '../src/worker/lib/ops'
import { api, apiJson, visit } from './helpers'

// What a review of how data is kept found (2026-11-20): ways an owner's change could be undone, or never reach
// visitors, when two things happen at once or a write fails halfway.

type Statement = D1PreparedStatement
/**
 * The same bindings, with something made to happen at the moment D1 is first written to: where a visit, or another
 * request, falls between a change's first step and its last.
 */
function meanwhile(during: () => Promise<unknown>): Env {
	let armed = true
	const real = new WeakMap<object, Statement>()
	const fire = async () => {
		if (!armed) return
		armed = false
		await during()
	}
	const wrap = (statement: Statement): Statement => {
		const proxy = new Proxy(statement, {
			get(target, key) {
				if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
				if (key === 'run') return async () => (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql.get(target) ?? '') ? (await fire(), target.run()) : target.run())
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		real.set(proxy, statement)
		return proxy
	}
	const sql = new WeakMap<object, string>()
	const DB = new Proxy(env.DB, {
		get(target, key) {
			if (key === 'prepare') {
				return (text: string) => {
					const statement = target.prepare(text)
					sql.set(statement, text)
					const bound = statement.bind.bind(statement)
					// A bound statement is another object: it keeps its SQL too.
					statement.bind = (...values: unknown[]) => {
						const next = bound(...values)
						sql.set(next, text)
						return next
					}
					return wrap(statement)
				}
			}
			if (key === 'batch') {
				return async (statements: Statement[]) => {
					const plain = statements.map((statement) => real.get(statement) ?? statement)
					if (plain.some((statement) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql.get(statement) ?? ''))) await fire()
					return target.batch(plain)
				}
			}
			const value = Reflect.get(target, key)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	return { ...env, DB } as Env
}

const link = (id: string, slug: string, url: string) => ({ id, kind: 'link', title: id, subtitle: '', url, slug, icon: 'auto', featured: false, hidden: false, startsAt: null, endsAt: null })
async function page(handle: string, items: object[] = []) {
	const { page } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle, name: handle } })
	const { page: full } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${page.id}`)
	await api(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...full.draft, items } })
	const published = await api(`/pages/${page.id}/publish`, { method: 'POST' })
	expect(published.status, await published.clone().text()).toBe(200)
	return page.id
}
const status = async (path: string) => (await visit(path)).status

describe('a visit that falls in the middle of a change', () => {
	it('doesn’t bring an archived short link back', async () => {
		const { link: made } = await apiJson<{ link: { id: string } }>('/links', { method: 'POST', json: { url: 'https://example.com/campaign', slug: 'rd-campaign' } })
		expect(await status('/rd-campaign')).toBe(302)
		// The visitor arrives after the copy is gone and before D1 says archived: they are sent on, and put the copy back.
		let seen = 0
		await updateLink(meanwhile(async () => (seen = await status('/rd-campaign'))), made.id, { status: 'archived' })
		expect(seen).toBe(302)
		expect(await status('/rd-campaign')).toBe(404)
		expect(await env.KV.get(`${NAME_PREFIX}rd-campaign`)).toBeNull()
	})

	it('doesn’t leave a deleted page, or its links, public', async () => {
		await page('rd-keeps')
		const id = await page('rd-goes', [link('rd-menu-1', 'rd-menu', 'https://example.com/menu')])
		expect(await status('/rd-goes')).toBe(200)
		await deletePage(meanwhile(async () => Promise.all([status('/rd-goes'), status('/rd-menu')])), id)
		expect(await status('/rd-goes')).toBe(404)
		expect(await status('/rd-menu')).toBe(404)
	})

	it('doesn’t keep a copy that was already out of date when it was written', async () => {
		// The other half: a visit that read D1 before a change and writes its copy after the change's last delete.
		await apiJson('/links', { method: 'POST', json: { url: 'https://example.com/late', slug: 'rd-late' } })
		await env.KV.delete(`${NAME_PREFIX}rd-late`)
		const KV = new Proxy(env.KV, {
			get(target, key) {
				if (key === 'put') {
					return async (...args: Parameters<KVNamespace['put']>) => {
						await env.DB.prepare("UPDATE links SET status = 'archived', updated_at = updated_at + 1 WHERE slug = 'rd-late'").run()
						return target.put(...args)
					}
				}
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		await linkRecordFromDb({ ...env, KV } as Env, 'rd-late')
		expect(await env.KV.get(`${NAME_PREFIX}rd-late`)).toBeNull()
		expect(await status('/rd-late')).toBe(404)
	})
})

describe('a backup that has a link archived', () => {
	it('stops it redirecting when the backup is brought in', async () => {
		await apiJson('/links', { method: 'POST', json: { url: 'https://example.com/promo', slug: 'rd-promo' } })
		expect(await status('/rd-promo')).toBe(302)
		const backup = await apiJson<{ shortLinks: { slug: string; status: string }[] }>('/export')
		backup.shortLinks.find((row) => row.slug === 'rd-promo')!.status = 'archived'
		expect((await api('/import', { method: 'POST', json: backup })).status).toBe(200)
		expect(await status('/rd-promo')).toBe(404)
	})
})

describe('settings', () => {
	const settings = async () => (await apiJson<StateResponse>('/state')).settings

	it('keep a change someone else saved while a page was being deleted', async () => {
		await page('rd-stays')
		const id = await page('rd-leaves')
		await api('/settings', { method: 'PUT', json: { timezone: 'UTC' } })
		await deletePage(meanwhile(async () => expect((await api('/settings', { method: 'PUT', json: { timezone: 'Asia/Taipei' } })).status).toBe(200)), id)
		expect((await settings()).timezone).toBe('Asia/Taipei')
	})

	it('keep both of two changes to different fields sent at once', async () => {
		await api('/settings', { method: 'PUT', json: { timezone: 'UTC', plan: 'free' } })
		const answers = await Promise.all([api('/settings', { method: 'PUT', json: { timezone: 'Asia/Tokyo' } }), api('/settings', { method: 'PUT', json: { plan: 'paid' } })])
		expect(answers.map((answer) => answer.status)).toEqual([200, 200])
		expect(await settings()).toMatchObject({ timezone: 'Asia/Tokyo', plan: 'paid' })
		await api('/settings', { method: 'PUT', json: { plan: 'free' } })
	})

	it('reach visitors when the same change is sent again after KV refused the first time', async () => {
		const [first, second] = [await page('rd-home-a', [link('rd-a-1', 'rd-a', 'https://example.com/a')]), await page('rd-home-b', [link('rd-b-1', 'rd-b', 'https://example.com/b')])]
		expect((await api('/settings', { method: 'PUT', json: { home: first } })).status).toBe(200)
		expect(await (await visit('/')).text()).toContain('rd-a-1')
		// The day's KV writes are used up: D1 takes the new home page, and KV takes nothing.
		const KV = new Proxy(env.KV, {
			get(target, key) {
				if (key === 'put') return async () => Promise.reject(new Error('KV PUT failed: 429 Too Many Requests'))
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		await expect(updateSettings({ ...env, KV } as Env, { home: second })).rejects.toThrow()
		expect((await settings()).home).toBe(second)
		// The next day the owner's AI says the same thing again. D1 already has it, and KV still has to be told.
		expect((await api('/settings', { method: 'PUT', json: { home: second } })).status).toBe(200)
		const home = await (await visit('/')).text()
		expect(home).toContain('rd-b-1')
		expect(home).not.toContain('rd-a-1')
		expect(JSON.parse((await env.KV.get(SITE_KEY))!).home).toBe('rd-home-b')
	})
})

describe('two items with one id', () => {
	it('are not published: one of their short links would answer 404, and its clicks count as the other’s', async () => {
		const { page: made } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle: 'rd-twins', name: 'x' } })
		const { page: full } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${made.id}`)
		await api(`/pages/${made.id}/draft`, { method: 'PUT', json: { ...full.draft, items: [link('rd-same-1', 'rd-twin-a', 'https://example.com/a'), link('rd-same-1', 'rd-twin-b', 'https://example.com/b')] } })
		const refused = await api(`/pages/${made.id}/publish`, { method: 'POST' })
		expect(refused.status).toBe(400)
		const body = (await refused.json()) as { problems: { path: string; message: string }[] }
		expect(body.problems).toEqual([expect.objectContaining({ path: 'items.1.id', message: 'Items 1 and 2 have the same id: change one of them' })])
	})
})

describe('bringing a database up to date', () => {
	const next = [['CREATE TABLE IF NOT EXISTS rd_extra (n INTEGER NOT NULL)', 'INSERT INTO rd_extra (n) VALUES (1)']]
	const baseline = [['CREATE TABLE IF NOT EXISTS rd_base (n INTEGER)']]
	const reset = async (meta: Record<string, string>) => {
		await env.DB.batch([
			env.DB.prepare('DROP TABLE IF EXISTS rd_extra'),
			env.DB.prepare("DELETE FROM _meta WHERE key IN ('schema', 'schema_version')"),
			...Object.entries(meta).map(([key, value]) => env.DB.prepare('INSERT INTO _meta (key, value) VALUES (?1, ?2)').bind(key, value)),
		])
	}
	const schema = async () => (await env.DB.prepare("SELECT value FROM _meta WHERE key = 'schema'").first<{ value: string }>())?.value
	const rows = async () => (await env.DB.prepare('SELECT count(*) AS n FROM rd_extra').first<{ n: number }>())!.n
	const restore = () => reset({ schema: String(SCHEMA_VERSION) })

	it('runs what is new on a database from before the migrations were made into one, which says 10', async () => {
		try {
			await reset({ schema_version: '10' })
			await migrate(env.DB, [...baseline, ...next])
			expect(await rows()).toBe(1)
			expect(await schema()).toBe('2')
			// And on one made since, which says 1 for the same tables.
			await reset({ schema_version: '1' })
			await migrate(env.DB, [...baseline, ...next])
			expect(await rows()).toBe(1)
			// One that needs nothing run says where it is under the new name, once, and is then left alone.
			await reset({ schema_version: '10' })
			await migrate(env.DB, baseline)
			expect(await schema()).toBe('1')
		} finally {
			await restore()
		}
	})

	it('runs a migration once when two copies of the Worker both find it to run', async () => {
		try {
			await reset({ schema: '1' })
			await Promise.all([migrate(env.DB, [...baseline, ...next]), migrate(env.DB, [...baseline, ...next]), migrate(env.DB, [...baseline, ...next])])
			expect(await rows()).toBe(1)
			expect(await schema()).toBe('2')
		} finally {
			await restore()
		}
	})
})
