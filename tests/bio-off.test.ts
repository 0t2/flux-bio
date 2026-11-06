import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateLinkResponse, LinksResponse, PageJson, PreviewLinkResponse, StateResponse, StatsResponse } from '../src/shared/api'
import { emptyContent, emptyLink, newItem, type LinkItem, type PageContent, type Settings } from '../src/shared/content'
import app from '../src/worker/index'
import { api, apiJson, IPHONE, ORIGIN, PASSWORD, visit } from './helpers'

// Switching bio pages off on a site that has them: pages leave, short links stay, and nothing is lost.

let shop = ''
let club = ''
let tokenPath = ''
let mediaId = ''

const link = (patch: Partial<LinkItem>): LinkItem => ({ ...emptyLink(), ...patch })

function shopPage(title = 'Buy now'): PageContent {
	const content = emptyContent('The Shop')
	content.items = [
		link({ id: 'buy-link', title, url: 'https://example.com/buy', slug: 'buy' }),
		link({ id: 'over-link', title: 'Over', url: 'https://example.com/over', slug: 'over', startsAt: Date.now() - 172_800_000, endsAt: Date.now() - 86_400_000 }),
		{ ...newItem('video'), id: 'video-one', title: 'Watch', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
	]
	return content
}

const settingsNow = async () => (await apiJson<StateResponse>('/state')).settings

async function save(patch: Partial<Settings>): Promise<Settings> {
	const { settings } = await apiJson<{ settings: Settings }>('/settings', { method: 'PUT', json: { ...(await settingsNow()), ...patch } })
	return settings
}

const switchTo = (bio: boolean) => save({ bio })

beforeAll(async () => {
	shop = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'shop', name: 'The Shop' } })).page.id
	await apiJson(`/pages/${shop}/draft`, { method: 'PUT', json: shopPage() })
	await apiJson(`/pages/${shop}/publish`, { method: 'POST' })
	club = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'club', name: 'The Club' } })).page.id
	await apiJson(`/pages/${club}/publish`, { method: 'POST' })
	await apiJson<CreateLinkResponse>('/links', { method: 'POST', json: { url: 'https://example.com/solo', slug: 'solo' } })
	// Published from the same draft, so a preview link can only show the draft while pages are on.
	const preview = await apiJson<PreviewLinkResponse>(`/pages/${shop}/preview-link`, { method: 'POST', json: { minutes: 60 } })
	tokenPath = new URL(preview.url).pathname
	const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))
	mediaId = (await apiJson<{ id: string }>('/media', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })).id
})

/** Calls the Worker with its KV wrapped, to see what a request reads or what happens when KV refuses. */
async function callWith(kv: KVNamespace, path: string, init: RequestInit = {}): Promise<Response> {
	const ctx = createExecutionContext()
	const request = new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init, headers: { 'user-agent': IPHONE, ...init.headers } })
	const response = await app.fetch(request, { ...env, KV: kv } as unknown as Env, ctx)
	await waitOnExecutionContext(ctx)
	return response
}

function countingKv(): { kv: KVNamespace; reads: string[] } {
	const reads: string[] = []
	const kv = new Proxy(env.KV, {
		get(target, property) {
			const value = Reflect.get(target, property) as unknown
			if (typeof value !== 'function') return value
			return (...args: unknown[]) => {
				if (property === 'get' || property === 'getWithMetadata') reads.push(String(args[0]))
				return (value as (...inner: unknown[]) => unknown).apply(target, args)
			}
		},
	})
	return { kv, reads }
}

describe('with pages on', () => {
	it('serves pages, suggestions and the sitemap, as before', async () => {
		expect(await settingsNow()).toMatchObject({ bio: true })
		expect((await visit('/shop')).status).toBe(200)
		expect((await visit('/')).status).toBe(200)
		expect(await (await visit('/shoq')).text()).toContain('Did you mean')
		expect(await (await visit('/robots.txt')).text()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`)
		expect(await (await visit('/sitemap.xml')).text()).toContain(`<loc>${ORIGIN}/club</loc>`)
		expect(await (await visit(tokenPath)).text()).toContain('class="draft-note"')
		const expired = await (await visit('/over')).text()
		expect(expired).toContain('href="/"')
		expect(expired).toContain('The Shop')
	})

	it('takes no notice of homeUrl', async () => {
		await save({ homeUrl: 'https://example.com/home' })
		const response = await visit('/')
		expect(response.status).toBe(200)
		expect(response.headers.get('location')).toBeNull()
		await save({ homeUrl: '' })
	})

	it('treats a site record from before the setting as on', async () => {
		const record = (await env.KV.get<Record<string, unknown>>('site', 'json'))!
		const { bio: _bio, homeUrl: _homeUrl, ...older } = record
		await env.KV.put('site', JSON.stringify(older))
		expect(await (await visit('/')).text()).toContain('The Shop')
		await env.KV.put('site', JSON.stringify(record))
	})

	it('redirects with one KV read', async () => {
		const { kv, reads } = countingKv()
		const response = await callWith(kv, '/solo')
		expect(response.status).toBe(302)
		expect(reads).toEqual(['name:solo'])
	})
})

describe('with pages off', () => {
	beforeAll(async () => {
		await switchTo(false)
	})

	it('treats a page handle as not found, with no suggestions', async () => {
		for (const path of ['/shop', '/club', '/Shop']) {
			const response = await visit(path)
			expect(response.status, path).toBe(404)
			const html = await response.text()
			expect(html, path).not.toContain('Did you mean')
			expect(html, path).not.toContain('The Shop')
			expect(html, path).toContain('Link not found')
		}
		const typo = await (await visit('/shoq')).text()
		expect(typo).not.toContain('Did you mean')
		expect(typo).not.toContain('/shop')
	})

	it('deletes the snapshots, and a visit does not bring them back', async () => {
		expect(await env.KV.get('name:shop')).toBeNull()
		expect(await env.KV.get('name:club')).toBeNull()
		await visit('/shop')
		await visit('/_c/shop/video-one/play')
		expect(await env.KV.get('name:shop')).toBeNull()
	})

	it('keeps every page, draft and short link in D1', async () => {
		const state = await apiJson<StateResponse>('/state')
		expect(state.pages.map((page) => page.handle)).toEqual(['shop', 'club'])
		expect(state.settings.home).toBe(shop)
		const { page } = await apiJson<{ page: PageJson }>(`/pages/${shop}`)
		expect(page.published?.profile.name).toBe('The Shop')
		expect(page.draft.items).toHaveLength(3)
		expect((await apiJson<LinksResponse>('/links')).links.map((entry) => entry.slug)).toEqual(expect.arrayContaining(['buy', 'over', 'solo']))
	})

	it('keeps redirecting and counting, a page\'s short links included', async () => {
		const before = (await apiJson<LinksResponse>('/links')).links.find((entry) => entry.slug === 'buy')?.stats?.total ?? 0
		const response = await visit('/buy?s=ig')
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://example.com/buy')
		expect((await visit('/solo')).headers.get('location')).toBe('https://example.com/solo')
		const links = (await apiJson<LinksResponse>('/links')).links
		expect(links.find((entry) => entry.slug === 'buy')?.stats?.total).toBe(before + 1)
		const stats = await apiJson<StatsResponse>(`/stats?page=${shop}&days=7`)
		expect(stats.totals.clicks).toBeGreaterThanOrEqual(1)
	})

	it('still rebuilds a short link missing from KV, a page\'s too', async () => {
		await env.KV.delete('name:buy')
		expect((await visit('/buy')).headers.get('location')).toBe('https://example.com/buy')
		expect(await env.KV.get('name:buy')).not.toBeNull()
	})

	it('does not spend a KV read more on a redirect', async () => {
		const { kv, reads } = countingKv()
		expect((await callWith(kv, '/solo')).status).toBe(302)
		expect(reads).toEqual(['name:solo'])
	})

	it('does not point back to the page from a link\'s own pages', async () => {
		const expired = await visit('/over')
		expect(expired.status).toBe(410)
		const html = await expired.text()
		expect(html).toContain('This link has expired')
		expect(html).not.toContain('The Shop')
		expect(html).not.toContain('href="/shop"')
		expect(html).not.toContain('class="cta" href="/"')

		const { links } = await apiJson<LinksResponse>('/links')
		const buy = links.find((entry) => entry.slug === 'buy')!
		await apiJson(`/links/${buy.id}`, { method: 'PATCH', json: { password: 'open-sesame' } })
		const locked = await (await visit('/buy')).text()
		expect(locked).toContain('password')
		expect(locked).not.toContain('The Shop')
		await apiJson(`/links/${buy.id}`, { method: 'PATCH', json: { password: null } })
	})

	it('serves nothing through draft preview links or block clicks', async () => {
		const draft = await visit(tokenPath)
		expect(draft.status).toBe(404)
		expect(await draft.text()).not.toContain('Buy now')
		expect((await visit(`${tokenPath}/version`)).status).toBe(410)
		const block = await visit('/_c/shop/video-one/play')
		expect(block.status).toBe(404)
		expect(block.headers.get('location')).toBeNull()

		const refused = await api(`/pages/${shop}/preview-link`, { method: 'POST' })
		expect(refused.status).toBe(409)
		expect(await refused.json()).toMatchObject({ error: 'bio-off' })
	})

	it('lists no pages for search engines', async () => {
		const robots = await (await visit('/robots.txt')).text()
		expect(robots).not.toContain('Sitemap:')
		expect(robots).not.toContain('shop')
		const xml = await (await visit('/sitemap.xml')).text()
		expect(xml).not.toContain('<url>')
		expect(xml).not.toContain('shop')
	})

	it('keeps uploaded images public', async () => {
		const response = await visit(`/media/${mediaId}`)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe('image/png')
	})

	it('shows the short links page or the redirect at "/"', async () => {
		const page = await visit('/')
		expect(page.status).toBe(200)
		expect(await page.text()).toContain('This address is for short links')
		await save({ homeUrl: 'https://example.com/home' })
		const redirected = await visit('/')
		expect(redirected.status).toBe(302)
		expect(redirected.headers.get('location')).toBe('https://example.com/home')
		// The record behind "/" names no page while they are off.
		expect(await env.KV.get<Record<string, unknown>>('site', 'json')).toMatchObject({ bio: false, home: '', published: [], homeUrl: 'https://example.com/home' })
		await save({ homeUrl: '' })
	})

	it('writes no snapshot when publishing, renaming or changing settings', async () => {
		await apiJson(`/pages/${shop}/draft`, { method: 'PUT', json: shopPage('Buy today') })
		await apiJson(`/pages/${shop}/publish`, { method: 'POST' })
		expect(await env.KV.get('name:shop')).toBeNull()
		expect((await visit('/shop')).status).toBe(404)
		expect((await apiJson<{ page: PageJson }>(`/pages/${shop}`)).page.published?.items[0]).toMatchObject({ title: 'Buy today' })

		await apiJson(`/pages/${club}`, { method: 'PATCH', json: { handle: 'clubhouse' } })
		expect(await env.KV.get('name:clubhouse')).toBeNull()
		expect((await visit('/clubhouse')).status).toBe(404)

		await save({ timezone: 'Asia/Taipei', languages: ['ja'] })
		expect(await env.KV.get('name:shop')).toBeNull()
		expect(await env.KV.get('name:clubhouse')).toBeNull()
		await save({ timezone: 'UTC', languages: [] })
	})

	it('still will not let a short link take a page\'s address', async () => {
		const taken = await api('/links', { method: 'POST', json: { url: 'https://example.com/x', slug: 'shop' } })
		expect(taken.status).toBe(409)
	})

	it('rebuilding KV after an import leaves pages out', async () => {
		const backup = await apiJson('/export')
		await apiJson('/import', { method: 'POST', json: backup })
		expect(await settingsNow()).toMatchObject({ bio: false })
		expect(await env.KV.get('name:shop')).toBeNull()
		expect((await visit('/shop')).status).toBe(404)
		expect((await visit('/buy')).status).toBe(302)
	})
})

describe('switching back on', () => {
	beforeAll(async () => {
		await switchTo(true)
	})

	it('restores every published page at once, with what was published while off', async () => {
		// Nothing is written ahead: a visit rebuilds a page's copy, so pages nobody visits cost no KV writes.
		expect(await env.KV.get('name:clubhouse')).toBeNull()
		const page = await visit('/shop')
		expect(page.status).toBe(200)
		expect(await page.text()).toContain('Buy today')
		expect(await env.KV.get('name:shop')).not.toBeNull()
		expect((await visit('/clubhouse')).status).toBe(200)
		expect(await (await visit('/')).text()).toContain('The Shop')
		expect(await (await visit('/shoq')).text()).toContain('Did you mean')
		expect(await env.KV.get<Record<string, unknown>>('site', 'json')).toMatchObject({ bio: true, home: 'shop' })
	})

	it('restores the rest of the public site', async () => {
		expect(await (await visit('/robots.txt')).text()).toContain('Sitemap:')
		expect(await (await visit('/sitemap.xml')).text()).toContain(`<loc>${ORIGIN}/clubhouse</loc>`)
		expect((await visit(`${tokenPath}/version`)).status).toBe(200)
		expect((await visit(tokenPath)).status).toBe(200)
		expect((await visit('/_c/shop/video-one/play')).status).toBe(302)
		expect((await api(`/pages/${shop}/preview-link`, { method: 'POST' })).status).toBe(200)
		expect(await (await visit('/over')).text()).toContain('The Shop')
	})

	it('needs a token that can change settings, like any setting', async () => {
		const { token } = await apiJson<{ token: string }>('/tokens', { method: 'POST', json: { name: 'links only', scope: 'links' } })
		const refused = await api('/settings', { method: 'PUT', bearer: token, json: { ...(await settingsNow()), bio: false } })
		expect(refused.status).toBe(403)
		expect(await settingsNow()).toMatchObject({ bio: true })
	})
})

describe('when KV refuses', () => {
	const refusing = (method: 'delete' | 'put') =>
		new Proxy(env.KV, {
			get(target, property) {
				if (property === method) return () => Promise.reject(new Error('KV is down'))
				const value = Reflect.get(target, property) as unknown
				return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
			},
		})

	const putSettings = async (kv: KVNamespace, bio: boolean) =>
		callWith(kv, '/api/settings', {
			method: 'PUT',
			headers: { authorization: `Bearer ${PASSWORD}`, 'content-type': 'application/json' },
			body: JSON.stringify({ ...(await settingsNow()), bio }),
		})

	it('leaves pages on and says so, so the owner can try again', async () => {
		expect(await settingsNow()).toMatchObject({ bio: true })
		const response = await putSettings(refusing('delete'), false)
		expect(response.status).toBe(503)
		expect(await response.json()).toMatchObject({ error: 'kv' })
		expect(await settingsNow()).toMatchObject({ bio: true })
		expect((await visit('/shop')).status).toBe(200)
		expect(await env.KV.get<Record<string, unknown>>('site', 'json')).toMatchObject({ bio: true })

		await switchTo(false)
		expect((await visit('/shop')).status).toBe(404)
		await switchTo(true)
		expect((await visit('/shop')).status).toBe(200)
	})
})
