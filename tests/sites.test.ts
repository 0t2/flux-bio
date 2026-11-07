import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { StateResponse } from '../src/shared/api'
import { emptyContent, emptyLink } from '../src/shared/content'
import { dayIn } from '../src/shared/time'
import app from '../src/worker/index'
import { bindingSuffix, sitesOf } from '../src/worker/lib/sites'
import { IPHONE, PASSWORD } from './helpers'

// One Worker can hold more than one site (sites.json): each has a database and a KV namespace of its own and is
// reached through its own hostnames. vitest.config.ts makes two: the main one at bio.example and "link" at
// link.example. Nothing is shared between them but the code and the admin password.

const MAIN = 'https://bio.example'
const LINK = 'https://link.example'
const other = env as unknown as { DB_LINK: D1Database; KV_LINK: KVNamespace }

async function at(origin: string, path: string, init: RequestInit = {}, bindings: object = env): Promise<Response> {
	const ctx = createExecutionContext()
	const response = await app.fetch(new Request(`${origin}${path}`, { redirect: 'manual', ...init }), bindings, ctx)
	await waitOnExecutionContext(ctx)
	return response
}

const owner = { authorization: `Bearer ${PASSWORD}`, 'content-type': 'application/json' }
const visitor = { 'user-agent': IPHONE }

async function api<T>(origin: string, path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
	const { json, ...rest } = init
	const response = await at(origin, `/api${path}`, { ...rest, headers: { ...owner, ...rest.headers }, body: json === undefined ? rest.body : JSON.stringify(json) })
	if (!response.ok) throw new Error(`${origin} ${init.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`)
	return (await response.json()) as T
}

/** A published page with one link, at the site of that origin. */
async function publish(origin: string, handle: string, name: string): Promise<string> {
	const { page } = await api<{ page: { id: string; draftUpdatedAt: number } }>(origin, '/pages', { method: 'POST', json: { handle, name } })
	const content = emptyContent(name)
	content.items = [{ ...emptyLink(), id: `${handle}-link`, title: 'Menu', url: 'https://example.com/menu', slug: `${handle}-menu` }]
	const { draftUpdatedAt } = await api<{ draftUpdatedAt: number }>(origin, `/pages/${page.id}/draft`, { method: 'PUT', json: content, headers: { 'if-match': String(page.draftUpdatedAt) } })
	await api(origin, `/pages/${page.id}/publish`, { method: 'POST', headers: { 'if-match': String(draftUpdatedAt) } })
	return page.id
}

const settingsOf = async (origin: string) => (await api<StateResponse>(origin, '/state')).settings

describe('two sites in one Worker', () => {
	let pageId = ''

	it('serves each hostname its own bundled image and keeps the raw KV bytes available to deployment tools', async () => {
		const id = 'shared.png'
		const bytes = async (response: Response) => new TextDecoder().decode(await response.arrayBuffer())
		await env.KV.put(`media:${id}`, 'main KV', { metadata: { type: 'image/png' } })
		await other.KV_LINK.put(`media:${id}`, 'link KV', { metadata: { type: 'image/png' } })
		const assets = new Map([
			['/_site-media/sites/main/shared.png', 'main asset'],
			['/_site-media/sites/link/shared.png', 'link asset'],
			['/_site-media/sites/main/main-only.png', 'main asset only'],
		])
		const bindings = {
			...env,
			ASSETS: {
				fetch: (url: URL) => assets.has(url.pathname)
					? new Response(assets.get(url.pathname), { headers: { 'content-type': 'image/png' } })
					: new Response(null, { status: 404 }),
			},
		}
		expect(await bytes(await at(MAIN, `/media/${id}`, {}, bindings))).toBe('main asset')
		const bundled = await at(LINK, `/media/${id}`, {}, bindings)
		expect(await bytes(bundled)).toBe('link asset')
		expect(bundled.headers.get('x-content-type-options')).toBe('nosniff')
		expect((await at(LINK, '/media/main-only.png', {}, bindings)).status).toBe(404)
		expect((await at(LINK, '/_site-media/sites/main/shared.png', {}, bindings)).status).toBe(404)

		expect((await at(LINK, `/api/media/${id}`, {}, bindings)).status).toBe(401)
		const raw = await at(LINK, `/api/media/${id}`, { headers: owner }, bindings)
		expect(await bytes(raw)).toBe('link KV')
		expect(raw.headers.get('cache-control')).toBe('no-store')

		assets.delete('/_site-media/sites/link/shared.png')
		expect(await bytes(await at(LINK, `/media/${id}`, {}, bindings))).toBe('link KV')
	})

	it('keeps a name for each: a page at one, a short link at the other', async () => {
		pageId = await publish(MAIN, 'hello', 'Corner Shop')
		// The same name, which one site would refuse as taken.
		const made = await at(LINK, '/api/links', { method: 'POST', headers: owner, body: JSON.stringify({ url: 'https://example.com/elsewhere', slug: 'hello' }) })
		expect(made.status).toBe(201)

		const page = await at(MAIN, '/hello', { headers: visitor })
		expect(page.status).toBe(200)
		expect(await page.text()).toContain('Corner Shop')
		const redirect = await at(LINK, '/hello', { headers: visitor })
		expect(redirect.status).toBe(302)
		expect(redirect.headers.get('location')).toBe('https://example.com/elsewhere')
	})

	it('shows each dashboard its own pages and short links, and nothing of the other', async () => {
		const main = await api<StateResponse>(MAIN, '/state')
		const link = await api<StateResponse>(LINK, '/state')
		expect(main.pages.map((page) => page.handle)).toEqual(['hello'])
		expect(link.pages).toEqual([])
		const slugs = async (origin: string) => (await api<{ links: { slug: string }[] }>(origin, '/links')).links.map((entry) => entry.slug).sort()
		expect(await slugs(MAIN)).toEqual(['hello-menu'])
		expect(await slugs(LINK)).toEqual(['hello'])
		// And in what a backup of each holds.
		const backup = async (origin: string) => api<{ pages: unknown[]; shortLinks: { slug: string }[] }>(origin, '/export')
		expect((await backup(LINK)).pages).toEqual([])
		expect((await backup(LINK)).shortLinks.map((entry) => entry.slug)).toEqual(['hello'])
		expect((await backup(MAIN)).shortLinks.map((entry) => entry.slug)).toEqual(['hello-menu'])
	})

	it('tells a dashboard which sites there are, and which one it is at', async () => {
		expect((await api<StateResponse>(MAIN, '/state')).sites).toEqual([
			{ id: 'main', host: 'bio.example', current: true },
			{ id: 'link', host: 'link.example', current: false },
		])
		expect((await api<StateResponse>(LINK, '/state')).sites).toEqual([
			{ id: 'main', host: 'bio.example', current: false },
			{ id: 'link', host: 'link.example', current: true },
		])
	})

	it('lets one be only short links, with its home page sent to the other, which goes on showing its page', async () => {
		await api(LINK, '/settings', { method: 'PUT', json: { ...(await settingsOf(LINK)), bio: false, homeUrl: 'https://bio.example' } })
		const home = await at(LINK, '/', { headers: visitor })
		expect(home.status).toBe(302)
		expect(home.headers.get('location')).toBe('https://bio.example')
		expect((await settingsOf(MAIN)).bio).toBe(true)
		const shown = await at(MAIN, '/', { headers: visitor })
		expect(shown.status).toBe(200)
		expect(await shown.text()).toContain('Corner Shop')
	})

	it('counts each one\'s visits in its own database, by its own time zone', async () => {
		// 25 hours apart, so the two never agree on the day.
		const [east, west] = ['Pacific/Kiritimati', 'Pacific/Pago_Pago']
		await api(MAIN, '/settings', { method: 'PUT', json: { ...(await settingsOf(MAIN)), timezone: east } })
		await api(LINK, '/settings', { method: 'PUT', json: { ...(await settingsOf(LINK)), timezone: west } })
		await env.DB.prepare('DELETE FROM stats').run()
		await other.DB_LINK.prepare('DELETE FROM stats').run()
		await at(MAIN, '/hello', { headers: visitor })
		await at(LINK, '/hello', { headers: visitor })
		const counted = async (db: D1Database) => (await db.prepare('SELECT day, kind FROM stats').all<{ day: string; kind: string }>()).results
		const now = Date.now()
		expect(await counted(env.DB)).toEqual([{ day: dayIn(east, now), kind: 'view' }])
		expect(await counted(other.DB_LINK)).toEqual([{ day: dayIn(west, now), kind: 'click' }])
	})

	it('reads only its own KV for a visit: one read there, none at the other', async () => {
		const reads = { main: 0, link: 0 }
		const counting = (kv: KVNamespace, site: 'main' | 'link') =>
			new Proxy(kv, {
				get(target, name) {
					const value = Reflect.get(target, name) as unknown
					if (typeof value !== 'function') return value
					return (...args: unknown[]) => {
						if (name === 'get' || name === 'getWithMetadata') reads[site]++
						return (value as (...args: unknown[]) => unknown).apply(target, args)
					}
				},
			})
		const bindings = { ...env, KV: counting(env.KV, 'main'), KV_LINK: counting(other.KV_LINK, 'link') }
		expect((await at(LINK, '/hello', { headers: visitor }, bindings)).status).toBe(302)
		expect(reads).toEqual({ main: 0, link: 1 })
		expect((await at(MAIN, '/hello', { headers: visitor }, bindings)).status).toBe(200)
		expect(reads).toEqual({ main: 1, link: 1 })
	})

	it('has one password for all of them, and a token only for the site that made it', async () => {
		const { token } = await api<{ token: string }>(MAIN, '/tokens', { method: 'POST', json: { name: 'main only', scope: 'full' } })
		const me = (origin: string, authorization: string) => at(origin, '/api/auth/me', { headers: { authorization } })
		expect((await me(MAIN, `Bearer ${token}`)).status).toBe(200)
		expect((await me(LINK, `Bearer ${token}`)).status).toBe(401)
		expect((await me(LINK, `Bearer ${PASSWORD}`)).status).toBe(200)
	})

	it('signs someone in to one site at a time: a session from one is nothing to the other', async () => {
		const signIn = async (origin: string) => {
			const response = await at(origin, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) })
			return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
		}
		const cookie = await signIn(MAIN)
		expect(cookie).toContain('=')
		expect((await at(MAIN, '/api/auth/me', { headers: { cookie } })).status).toBe(200)
		expect((await at(LINK, '/api/auth/me', { headers: { cookie } })).status).toBe(401)
		expect((await at(LINK, '/api/auth/me', { headers: { cookie: await signIn(LINK) } })).status).toBe(200)
	})

	it('gives each its own guide: its own token to look for, its own name as a skill, and where the others are', async () => {
		const text = async (origin: string, path: string) => (await at(origin, path)).text()
		expect(await text(MAIN, '/llms.txt')).toContain('`FLUXBIO_TOKEN` environment variable')
		expect(await text(LINK, '/llms.txt')).toContain('`FLUXBIO_TOKEN_LINK` environment variable')
		expect(await text(MAIN, '/skill.md')).toMatch(/^---\nname: fluxbio\n/)
		expect(await text(LINK, '/skill.md')).toMatch(/^---\nname: fluxbio-link\n/)
		expect(await text(MAIN, '/api/guide/domain')).toContain('beside bio.example: link.example.')
		expect(await text(LINK, '/api/guide/domain')).toContain('beside link.example: bio.example.')
	})

	it('wipes one without touching the other', async () => {
		const wiped = await at(LINK, '/api/data', { method: 'DELETE', headers: owner, body: JSON.stringify({ confirm: 'DELETE' }) })
		expect(wiped.status).toBe(200)
		expect((await at(LINK, '/hello', { headers: visitor })).status).toBe(404)
		expect((await at(MAIN, '/hello', { headers: visitor })).status).toBe(200)
		expect((await api<StateResponse>(MAIN, '/state')).pages.map((page) => page.id)).toEqual([pageId])
	})
})

describe('which site a hostname reaches', () => {
	it('is the main one for every hostname no other site lists, as with the workers.dev address', async () => {
		const page = await at('https://flux-bio.someone.workers.dev', '/hello', { headers: visitor })
		expect(page.status).toBe(200)
		expect(await page.text()).toContain('Corner Shop')
	})

	it('is never another site when its own database is missing: the hostname says so and shows nothing', async () => {
		const { DB_LINK: _db, ...withoutItsDatabase } = env as unknown as Record<string, unknown>
		const response = await at(LINK, '/hello', { headers: visitor }, withoutItsDatabase)
		expect(response.status).toBe(503)
		expect(await response.text()).not.toContain('Corner Shop')
	})

	it('is the only one when no others are listed, and then the dashboard is told of none', async () => {
		const alone = { ...env, SITES: '{}' }
		// link.example is then just another hostname of the one site.
		expect((await at(LINK, '/hello', { headers: visitor }, alone)).status).toBe(200)
		const response = await at(LINK, '/api/state', { headers: owner }, alone)
		expect(((await response.json()) as StateResponse).sites).toEqual([])
	})

	it('goes by a list it can read, and by none it can\'t', () => {
		const listed = (text: string) => sitesOf({ SITES: text } as unknown as Env)
		expect(listed('{"main":["A.example"],"my-shop":["Shop.Example","shop.example.net"]}')).toEqual([
			{ id: 'main', hosts: ['a.example'] },
			{ id: 'my-shop', hosts: ['shop.example', 'shop.example.net'] },
		])
		expect(bindingSuffix('my-shop')).toBe('MY_SHOP')
		// The main site is there whether or not it is listed, and first.
		expect(listed('{"link":["l.example"]}').map((site) => site.id)).toEqual(['main', 'link'])
		for (const unreadable of ['', 'not json', '[]', '{"Bad Id":["x.example"]}', '{"link":"l.example"}']) expect(listed(unreadable), unreadable).toEqual([{ id: 'main', hosts: [] }])
	})
})
