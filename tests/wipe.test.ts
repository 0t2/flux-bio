import { env } from 'cloudflare:test'
import { beforeAll, expect, it } from 'vitest'
import type { CreateTokenResponse, PageJson, StateResponse } from '../src/shared/api'
import { SCHEMA_VERSION } from '../src/worker/lib/db'
import { api, apiJson, visit } from './helpers'

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
