import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateLinkResponse, LinkJson, LinksResponse, PageJson } from '../src/shared/api'
import type { Backup } from '../src/shared/backup'
import { emptyContent, emptyLink } from '../src/shared/content'
import { createSession, sessionKey, verifySession } from '../src/worker/lib/auth'
import { SOURCE_LIMIT } from '../src/worker/lib/stats'
import app from '../src/worker/index'
import { api, apiJson, ORIGIN, PASSWORD, visit } from './helpers'

// Fixes from the v0.2 security review: nothing public is signed with
// ADMIN_PASSWORD, KV never outlives a revocation, and visitor input can't
// grow the stats or reach a spreadsheet as a formula.

/** Calls the Worker with some bindings swapped: another ADMIN_PASSWORD, or a KV that fails. */
async function callWith(overrides: Record<string, unknown>, path: string, init: RequestInit = {}): Promise<Response> {
	const ctx = createExecutionContext()
	const response = await app.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init }), { ...env, ...overrides } as Env, ctx)
	await waitOnExecutionContext(ctx)
	return response
}

/** KV that refuses one kind of write, like a free plan past its daily limit. */
function failingKv(method: 'put' | 'delete'): KVNamespace {
	return new Proxy(env.KV, {
		get(target, prop) {
			if (prop === method) return () => Promise.reject(new Error('KV write limit exceeded'))
			const value: unknown = Reflect.get(target, prop)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
}

async function hmac(key: string, message: string, encoding: 'hex' | 'base64url'): Promise<string> {
	const encoder = new TextEncoder()
	const imported = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
	const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(message)))
	if (encoding === 'hex') return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const patchLink = (overrides: Record<string, unknown>, id: string, json: unknown) =>
	callWith(overrides, `/api/links/${id}`, {
		method: 'PATCH',
		headers: { authorization: `Bearer ${PASSWORD}`, 'content-type': 'application/json' },
		body: JSON.stringify(json),
	})

const newLink = async (slug: string) =>
	(await apiJson<CreateLinkResponse>('/links', { method: 'POST', json: { url: `https://example.com/${slug}`, slug } })).link

let pageId = ''

beforeAll(async () => {
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'sec', name: 'Security' } })
	pageId = page.id
	const content = emptyContent('Security')
	content.items = [
		{ ...emptyLink(), id: 'sec-link', title: 'Docs', url: 'https://example.com/docs', slug: 'docs' },
	]
	expect((await api(`/pages/${pageId}/draft`, { method: 'PUT', json: content })).status).toBe(200)
	expect((await api(`/pages/${pageId}/publish`, { method: 'POST' })).status).toBe(200)
})

describe('sessions', () => {
	it('only accept cookies made for this deployment and this password', async () => {
		const cookie = await createSession(await sessionKey('deployment-a', PASSWORD))
		expect(await verifySession(await sessionKey('deployment-a', PASSWORD), cookie)).toBe(true)
		expect(await verifySession(await sessionKey('deployment-b', PASSWORD), cookie)).toBe(false)
		expect(await verifySession(await sessionKey('deployment-a', 'another-password-0123'), cookie)).toBe(false)
	})

	it('are not signed with ADMIN_PASSWORD itself', async () => {
		// Anyone holding a cookie signed with the password could test guesses at it offline.
		const payload = `v2.admin.${Math.floor(Date.now() / 1000) + 3600}`
		const cookie = `fluxbio_session=${payload}.${await hmac(PASSWORD, payload, 'base64url')}`
		expect((await callWith({}, '/api/state', { headers: { cookie } })).status).toBe(401)
	})
})

describe('custom domain ping', () => {
	it('signs the nonce with the deployment secret, not ADMIN_PASSWORD', async () => {
		const nonce = 'nonce-0123456789abcdef'
		const response = await visit(`/_fluxbio/ping?n=${nonce}`)
		expect(response.status).toBe(200)
		const body = await response.text()
		expect(body).toMatch(/^[0-9a-f]{64}$/)
		expect(body).not.toBe(await hmac(PASSWORD, `fluxbio-ping:${nonce}`, 'hex'))
		expect(await (await visit(`/_fluxbio/ping?n=${nonce}`)).text()).toBe(body)
	})
})

describe('API tokens', () => {
	it('stop working once ADMIN_PASSWORD changes', async () => {
		const { token } = await apiJson<{ token: string }>('/tokens', { method: 'POST', json: { name: 'shortcut', scope: 'full' } })
		const bearer = { authorization: `Bearer ${token}` }
		expect((await callWith({}, '/api/auth/me', { headers: bearer })).status).toBe(200)
		const rotated = { ADMIN_PASSWORD: 'rotated-password-0123' }
		expect((await callWith(rotated, '/api/auth/me', { headers: bearer })).status).toBe(401)
		const list = await callWith(rotated, '/api/tokens', { headers: { authorization: 'Bearer rotated-password-0123' } })
		expect(((await list.json()) as { tokens: unknown[] }).tokens).toEqual([])
	})
})

describe('KV copies', () => {
	it('change nothing when KV refuses to drop the old copy', async () => {
		const link = await newLink('kv-drop')
		expect((await visit('/kv-drop')).status).toBe(302)
		expect((await patchLink({ KV: failingKv('delete') }, link.id, { password: 'hush-2026' })).status).toBe(503)
		// D1 and KV still agree: no password anywhere.
		expect((await apiJson<{ link: LinkJson }>(`/links/${link.id}`)).link.hasPassword).toBe(false)
		expect((await visit('/kv-drop')).status).toBe(302)
	})

	it('still protect a link when KV refuses the fresh copy', async () => {
		const link = await newLink('kv-put')
		expect((await visit('/kv-put')).status).toBe(302)
		expect((await patchLink({ KV: failingKv('put') }, link.id, { password: 'hush-2026' })).status).toBe(200)
		// The old copy went first, so visitors get D1's version: the password page.
		expect((await visit('/kv-put')).status).toBe(401)
		expect((await patchLink({ KV: failingKv('put') }, link.id, { status: 'archived' })).status).toBe(200)
		expect((await visit('/kv-put')).status).toBe(404)
	})

	it('take a removed link down with the publish that removed it', async () => {
		const extra = emptyContent('Security')
		extra.items = [{ ...emptyLink(), id: 'sec-gone', title: 'Gone', url: 'https://example.com/gone', slug: 'gone-soon' }]
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'sec-two', name: 'Two' } })
		await api(`/pages/${page.id}/draft`, { method: 'PUT', json: extra })
		await api(`/pages/${page.id}/publish`, { method: 'POST' })
		expect((await visit('/gone-soon')).status).toBe(302)
		extra.items = []
		await api(`/pages/${page.id}/draft`, { method: 'PUT', json: extra })
		const publish = await callWith({ KV: failingKv('put') }, `/api/pages/${page.id}/publish`, {
			method: 'POST',
			headers: { authorization: `Bearer ${PASSWORD}` },
		})
		expect(publish.status).toBe(200)
		expect((await visit('/gone-soon')).status).toBe(404)
	})
})

describe('stats', () => {
	it(`keep at most ${SOURCE_LIMIT} sources per link and day, then count the rest as other`, async () => {
		const docs = (await apiJson<LinksResponse>('/links')).links.find((row) => row.slug === 'docs')!
		for (let i = 0; i < SOURCE_LIMIT + 10; i++) await visit(`/docs?s=made-up-${i}`)
		const { results } = await env.DB.prepare("SELECT value, count FROM stats WHERE kind = 'click' AND target = ?1")
			.bind(docs.id)
			.all<{ value: string; count: number }>()
		expect(results.length).toBe(SOURCE_LIMIT + 1)
		expect(results.find((row) => row.value === 'other')?.count).toBe(10)
	})
})

// Last: it unpublishes the page the other tests use.
describe('import', () => {
	it('refuses addresses that are not web addresses, and unknown time zones', async () => {
		const backup = await apiJson<Backup>('/export')
		const script = structuredClone(backup)
		script.shortLinks[0]!.url = 'javascript:alert(1)'
		const refused = await api('/import', { method: 'POST', json: script })
		expect(refused.status).toBe(400)
		expect(await refused.text()).toContain('http://')
		const zone = structuredClone(backup)
		zone.settings.timezone = 'Mars/Olympus'
		expect((await api('/import', { method: 'POST', json: zone })).status).toBe(400)
	})

	it('stops serving a page the file has unpublished', async () => {
		expect((await visit('/sec')).status).toBe(200)
		const backup = await apiJson<Backup>('/export')
		for (const page of backup.pages) {
			if (page.handle !== 'sec') continue
			page.published = null
			page.publishedAt = null
		}
		expect((await api('/import', { method: 'POST', json: backup })).status).toBe(200)
		expect((await visit('/sec')).status).toBe(404)
	})
})
