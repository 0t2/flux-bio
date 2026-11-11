import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, expect, it } from 'vitest'
import type { CreateTokenResponse, PageJson, StateResponse, WipeResponse } from '../src/shared/api'
import app from '../src/worker/index'
import { SCHEMA_VERSION } from '../src/worker/lib/db'
import { KV_OPS_AT_ONCE } from '../src/worker/lib/mode'
import { api, apiJson, ORIGIN, PASSWORD, visit } from './helpers'

// 清除所有資料 puts a deployment back to a fresh install, whatever else is
// in the database, tables this version doesn't know included.
let token = ''

beforeAll(async () => {
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'gone', name: 'Gone' } })
	await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
	await apiJson('/links', { method: 'POST', json: { url: 'https://example.com', slug: 'old-link' } })
	token = (await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'old', scope: 'full' } })).token
	await env.DB.batch([
		env.DB.prepare('CREATE TABLE leftover (id TEXT PRIMARY KEY)'),
		env.DB.prepare("INSERT INTO leftover VALUES ('x')"),
		env.DB.prepare("UPDATE _meta SET value = '99' WHERE key = 'schema_version'"),
	])
	expect((await api('/data', { method: 'DELETE', json: { confirm: 'DELETE' } })).status).toBe(200)
})

it('drops every table, leftovers included, and creates the current ones again', async () => {
	const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%'").all<{ name: string }>()
	expect(tables.results.map((row) => row.name).sort()).toEqual(['_meta', 'api_tokens', 'links', 'page_versions', 'pages', 'stats'])
	const version = await env.DB.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").first<{ value: string }>()
	expect(Number(version?.value)).toBe(SCHEMA_VERSION)
})

it('leaves nothing for visitors or old tokens', async () => {
	expect((await apiJson<StateResponse>('/state')).pages).toEqual([])
	expect((await visit('/gone')).status).toBe(404)
	expect((await visit('/old-link')).status).toBe(404)
	expect((await api('/state', { bearer: token })).status).toBe(401)
})

it('works like a new install afterwards', async () => {
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'again', name: 'Again' } })
	expect((await api(`/pages/${page.id}/publish`, { method: 'POST' })).status).toBe(200)
	expect((await visit('/')).status).toBe(200)
})

// One request may only start so many KV operations, and the free plan allows 1,000 deletes a day.
async function wipe(kv: KVNamespace = env.KV): Promise<WipeResponse> {
	const ctx = createExecutionContext()
	const request = new Request(`${ORIGIN}/api/data`, {
		method: 'DELETE',
		headers: { authorization: `Bearer ${PASSWORD}`, 'content-type': 'application/json' },
		body: JSON.stringify({ confirm: 'DELETE' }),
	})
	const response = await app.fetch(request, { ...env, KV: kv } as unknown as Env, ctx)
	await waitOnExecutionContext(ctx)
	expect(response.status).toBe(200)
	return response.json()
}

const tablesNow = async () =>
	(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%'").all<{ name: string }>()).results.map((row) => row.name).sort()
const keysNow = async (prefix?: string) => (await env.KV.list({ prefix, limit: 1000 })).keys.map((key) => key.name)

it('takes what visitors are answered from first, and says when KV holds more than one call may delete', async () => {
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'crowded', name: 'Crowded' } })
	await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
	await apiJson('/links', { method: 'POST', json: { url: 'https://example.com', slug: 'crowded-link' } })
	await Promise.all(Array.from({ length: KV_OPS_AT_ONCE + 100 }, (_, n) => env.KV.put(`media:pic-${n}.webp`, 'x')))
	expect(await keysNow('name:')).toEqual(expect.arrayContaining(['name:crowded', 'name:crowded-link']))

	const first = await wipe()
	expect(first.keysLeft).toBe(true)
	expect(first.keys).toBeGreaterThan(0)
	expect(first.keys).toBeLessThan(KV_OPS_AT_ONCE)
	// The database is done whatever KV is left with, and so is everything a visitor could still be shown.
	expect((await apiJson<StateResponse>('/state')).pages).toEqual([])
	expect(await keysNow('name:')).toEqual([])
	expect(await env.KV.get('site')).toBeNull()
	expect((await keysNow('media:')).length).toBeGreaterThan(0)

	const second = await wipe()
	expect(second).toMatchObject({ keysLeft: false })
	expect(await keysNow()).toEqual([])
})

it('brings the tables back even when KV refuses, and says KV still has keys', async () => {
	await apiJson('/links', { method: 'POST', json: { url: 'https://example.com', slug: 'kept-copy' } })
	const refusing = new Proxy(env.KV, {
		get(target, property) {
			if (property === 'delete') return () => Promise.reject(new Error('KV is down'))
			const value = Reflect.get(target, property) as unknown
			return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
		},
	})
	expect(await wipe(refusing)).toEqual({ keys: 0, keysLeft: true })
	// A copy of the Worker that has checked its schema doesn't check again: without its tables every request would fail.
	expect(await tablesNow()).toEqual(['_meta', 'api_tokens', 'links', 'page_versions', 'pages', 'stats'])
	expect((await apiJson<StateResponse>('/state')).pages).toEqual([])
	// The call again, once KV takes deletes, finishes it.
	expect(await wipe()).toMatchObject({ keysLeft: false })
	expect(await keysNow()).toEqual([])
})
