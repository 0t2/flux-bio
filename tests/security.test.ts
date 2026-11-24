import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CreateLinkResponse, LinkJson, LinksResponse, PageJson } from '../src/shared/api'
import type { Backup } from '../src/shared/backup'
import { emptyContent, emptyLink } from '../src/shared/content'
import { createSession, sessionKey, verifySession } from '../src/worker/lib/auth'
import { PASSWORD_TRIES, PASSWORD_TRIES_LINK } from '../src/worker/lib/db'
import { matchesImageType } from '../src/worker/lib/media'
import { SOURCE_LIMIT } from '../src/worker/lib/stats'
import { readCappedText } from '../src/worker/routes/api'
import app from '../src/worker/index'
import communityThemes from '../themes/community.json'
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

describe('admin password rate limiting', () => {
	it('locks out an IP after too many wrong login attempts without locking another IP', async () => {
		const attacker = '198.51.100.11'
		const owner = '198.51.100.22'
		const attempt = (password: string, ip: string) =>
			callWith({}, '/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
				body: JSON.stringify({ password }),
			})
		const results = await Promise.all(Array.from({ length: PASSWORD_TRIES + 4 }, () => attempt('wrong-guess-00', attacker)))
		expect(results.filter((res) => res.status === 401)).toHaveLength(PASSWORD_TRIES)
		expect(results.filter((res) => res.status === 429)).toHaveLength(4)
		// Even the right password is refused from the locked IP.
		expect((await attempt(PASSWORD, attacker)).status).toBe(429)
		// Another IP can still sign in normally.
		expect((await attempt(PASSWORD, owner)).status).toBe(200)
	})

	it('locks out an IP after too many wrong Bearer password attempts', async () => {
		const attacker = '198.51.100.33'
		const attempt = (bearer: string) =>
			callWith({}, '/api/auth/me', {
				headers: { authorization: `Bearer ${bearer}`, 'cf-connecting-ip': attacker },
			})
		const results = await Promise.all(Array.from({ length: PASSWORD_TRIES }, () => attempt('wrong-bearer-00')))
		expect(results.every((res) => res.status === 401)).toBe(true)
		expect((await attempt(PASSWORD)).status).toBe(429)
	})
})

describe('admin password rate limiting, which nobody can turn on the owner', () => {
	const signIn = (password: string, ip: string, overrides: Record<string, unknown> = {}) =>
		callWith(overrides, '/api/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
			body: JSON.stringify({ password }),
		})
	const withBearer = (bearer: string, ip: string, overrides: Record<string, unknown> = {}) =>
		callWith(overrides, '/api/auth/me', { headers: { authorization: `Bearer ${bearer}`, 'cf-connecting-ip': ip } })

	it('keeps no count from everyone together: wrong tries from many addresses lock none but their own', async () => {
		// More than a link's password would take from everyone before it stopped reading any (PASSWORD_TRIES_LINK).
		const crowd = Array.from({ length: PASSWORD_TRIES_LINK + 6 }, (_, n) => `203.0.113.${n + 1}`)
		const atTheForm = await Promise.all(crowd.map((ip) => signIn('wrong-guess-00', ip)))
		expect(atTheForm.every((res) => res.status === 401)).toBe(true)
		const atTheApi = await Promise.all(crowd.map((ip) => withBearer('wrong-bearer-00', ip)))
		expect(atTheApi.every((res) => res.status === 401)).toBe(true)
		const owner = '198.51.100.44'
		expect((await signIn(PASSWORD, owner)).status).toBe(200)
		expect((await withBearer(PASSWORD, owner)).status).toBe(200)
		// Nothing is kept under a name that isn't one visitor's.
		const { results } = await env.DB.prepare("SELECT key FROM _meta WHERE key LIKE 'tries:/admin%'").all<{ key: string }>()
		expect(results.length).toBeGreaterThan(0)
		expect(results.every((row) => /^tries:\/admin:[0-9a-f]{4}$/.test(row.key))).toBe(true)
	})

	it('starts a new password with no wrong tries, so whoever was locked out guessing signs in with it at once', async () => {
		const ip = '198.51.100.55'
		const results = await Promise.all(Array.from({ length: PASSWORD_TRIES }, () => signIn('wrong-guess-00', ip)))
		expect(results.every((res) => res.status === 401)).toBe(true)
		expect((await signIn(PASSWORD, ip)).status).toBe(429)
		expect((await withBearer(PASSWORD, ip)).status).toBe(429)
		// The owner sets another password (pnpm reset-password), from the same address.
		const changed = { ADMIN_PASSWORD: 'another-admin-token-4567' }
		expect((await withBearer(changed.ADMIN_PASSWORD, ip, changed)).status).toBe(200)
		expect((await signIn(changed.ADMIN_PASSWORD, ip, changed)).status).toBe(200)
		// The old one is still counted against whoever goes on trying it.
		expect((await signIn(PASSWORD, ip)).status).toBe(429)
	})
})

describe('reading a theme file from GitHub', () => {
	const theme = { ...communityThemes.themes[0]!, name: 'Harbor' }

	/** GitHub, answering with what a test gives it. The request is made as the Worker makes it, so options the runtime refuses fail here too. */
	function github(answer: () => Response) {
		const network = vi.mocked(globalThis.fetch).getMockImplementation()!
		const asked: Request[] = []
		vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
			if (new URL(input instanceof Request ? input.url : String(input)).host !== 'raw.githubusercontent.com') return network(input, init)
			asked.push(new Request(input, init))
			return Promise.resolve(answer())
		})
		return { asked, restore: () => vi.mocked(globalThis.fetch).mockImplementation(network) }
	}

	it('reads a public file, asking for it in a way the Workers runtime takes', async () => {
		const mock = github(() => new Response(JSON.stringify(theme), { headers: { 'content-type': 'text/plain' } }))
		try {
			const res = await api('/themes/fetch', { method: 'POST', json: { url: 'https://github.com/someone/themes/blob/main/harbor.json' } })
			expect(res.status).toBe(200)
			expect(((await res.json()) as { themes: { name: string }[] }).themes.map((entry) => entry.name)).toEqual(['Harbor'])
			expect(mock.asked.map((request) => request.url)).toEqual(['https://raw.githubusercontent.com/someone/themes/main/harbor.json'])
			// Not followed anywhere else: workerd takes "follow" or "manual", and throws on "error".
			expect(mock.asked[0]?.redirect).toBe('manual')
		} finally {
			mock.restore()
		}
	})

	it('refuses a file that sends the Worker somewhere else', async () => {
		const mock = github(() => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }))
		try {
			const res = await api('/themes/fetch', { method: 'POST', json: { url: 'https://raw.githubusercontent.com/someone/themes/main/harbor.json' } })
			expect(res.status).toBe(400)
			expect(((await res.json()) as { error: string }).error).toBe('fetch')
			expect(mock.asked).toHaveLength(1)
		} finally {
			mock.restore()
		}
	})
})

describe('image magic-byte validation', () => {
	it('accepts valid headers and rejects spoofed or truncated payloads', async () => {
		const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
		const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
		const gif = new TextEncoder().encode('GIF89a\x01\x00')
		const webp = new TextEncoder().encode('RIFF\x00\x00\x00\x00WEBP')
		const avif = new TextEncoder().encode('\x00\x00\x00\x1cftypavif\x00\x00\x00\x00')
		const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')

		expect(matchesImageType(png, 'image/png')).toBe(true)
		expect(matchesImageType(jpeg, 'image/jpeg')).toBe(true)
		expect(matchesImageType(gif, 'image/gif')).toBe(true)
		expect(matchesImageType(webp, 'image/webp')).toBe(true)
		expect(matchesImageType(avif, 'image/avif')).toBe(true)
		expect(matchesImageType(html, 'image/png')).toBe(false)
		expect(matchesImageType(png, 'image/jpeg')).toBe(false)

		const spoofed = await api('/media', { method: 'POST', body: html, headers: { 'content-type': 'image/png' } })
		expect(spoofed.status).toBe(415)
		expect((await api('/media/sec-not-image.png', { method: 'PUT', body: html, headers: { 'content-type': 'image/png' } })).status).toBe(415)
	})

	it('keeps a picture that was sent under another image type, as what it is: a backup of an older site still goes back in', async () => {
		// A JPEG called a PNG, which an upload was free to be before uploads were looked at.
		const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
		const restored = await api('/media/sec-mislabeled.png', { method: 'PUT', body: jpeg, headers: { 'content-type': 'image/png' } })
		expect(restored.status).toBe(200)
		const served = await visit('/media/sec-mislabeled.png')
		expect(served.status).toBe(200)
		expect(served.headers.get('content-type')).toBe('image/jpeg')
		expect(new Uint8Array(await served.arrayBuffer())).toEqual(jpeg)
		// A new upload gets the ending of what it is.
		const { id } = await apiJson<{ id: string }>('/media', { method: 'POST', body: jpeg, headers: { 'content-type': 'image/png' } })
		expect(id).toMatch(/\.jpg$/)
		expect((await visit(`/media/${id}`)).headers.get('content-type')).toBe('image/jpeg')
		// What it is called still has to be a picture.
		expect((await api('/media', { method: 'POST', body: jpeg, headers: { 'content-type': 'text/html' } })).status).toBe(415)
	})
})

describe('capped external response reading', () => {
	it('reads responses within the limit and rejects larger bodies', async () => {
		expect(await readCappedText(new Response('{"ok":true}'), 64)).toBe('{"ok":true}')
		await expect(readCappedText(new Response('x'.repeat(100), { headers: { 'content-length': '100' } }), 64)).rejects.toThrow(/too large/i)
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(40))
				controller.enqueue(new Uint8Array(40))
				controller.close()
			},
		})
		await expect(readCappedText(new Response(stream), 64)).rejects.toThrow(/too large/i)
	})
})
