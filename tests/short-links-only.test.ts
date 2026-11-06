import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { CreateLinkResponse, LinksResponse, PageJson, StateResponse, StatsResponse } from '../src/shared/api'
import { DEFAULT_SETTINGS, LOCALES, upgradeSettings, type Settings } from '../src/shared/content'
import { renderSystemPage } from '../src/templates/system'
import { api, apiJson, call, ORIGIN, visit } from './helpers'

// Runs against an empty database: an owner who only wants short links and never makes a page.

const put = (patch: Partial<Settings>, settings: Settings) => api('/settings', { method: 'PUT', json: { ...settings, ...patch } })
const settingsNow = async () => (await apiJson<StateResponse>('/state')).settings

async function save(patch: Partial<Settings>): Promise<Settings> {
	const response = await put(patch, await settingsNow())
	expect(response.status).toBe(200)
	return ((await response.json()) as { settings: Settings }).settings
}

describe('the setting', () => {
	it('starts with pages on and no redirect', async () => {
		expect(await settingsNow()).toMatchObject({ bio: true, homeUrl: '' })
		expect(DEFAULT_SETTINGS).toMatchObject({ bio: true, homeUrl: '' })
	})

	it('reads as on for settings stored before it existed', () => {
		const stored = { home: 'main', timezone: 'UTC', locale: 'en', languages: [], domain: '', hostFonts: false }
		expect(upgradeSettings(stored, 'main')).toEqual({ ...stored, bio: true, homeUrl: '', qrLogo: '', plan: 'free' })
		expect(upgradeSettings({ handle: 'me', homepage: true, timezone: 'UTC', locale: 'en' }, 'main')).toMatchObject({ bio: true, homeUrl: '' })
		// What is stored already stays.
		expect(upgradeSettings({ ...stored, bio: false, homeUrl: 'https://example.com/' }, 'main')).toMatchObject({ bio: false, homeUrl: 'https://example.com/' })
	})

	it('round-trips through PUT /api/settings and GET /api/state, and keeps its value when left out', async () => {
		expect(await save({ bio: false, homeUrl: 'https://example.com/home' })).toMatchObject({ bio: false, homeUrl: 'https://example.com/home' })
		expect(await settingsNow()).toMatchObject({ bio: false, homeUrl: 'https://example.com/home' })

		const { home, timezone, locale, domain } = await settingsNow()
		const { settings } = await apiJson<{ settings: Settings }>('/settings', { method: 'PUT', json: { home, timezone, locale, domain } })
		expect(settings).toMatchObject({ bio: false, homeUrl: 'https://example.com/home' })

		expect(await save({ homeUrl: '  ' })).toMatchObject({ bio: false, homeUrl: '' })
		expect(await save({ bio: true })).toMatchObject({ bio: true, homeUrl: '' })
	})

	it('accepts only http and https addresses', async () => {
		const settings = await settingsNow()
		for (const homeUrl of ['ftp://example.com/', 'javascript:alert(1)', 'data:text/html,hi', 'example.com', 'not a url', 'mailto:me@example.com']) {
			const response = await put({ homeUrl }, settings)
			expect(response.status, homeUrl).toBe(400)
			expect(await response.json()).toMatchObject({ error: 'invalid', key: '{label}要以 http:// 或 https:// 開頭' })
		}
		expect((await put({ homeUrl: `https://example.com/${'x'.repeat(2048)}` }, settings)).status).toBe(400)
		expect(await settingsNow()).toEqual(settings)
		expect((await put({ homeUrl: 'http://example.com/' }, settings)).status).toBe(200)
		expect((await put({ homeUrl: '' }, settings)).status).toBe(200)
	})
})

describe('with pages off and no pages', () => {
	it('says at "/" that this address is for short links', async () => {
		await save({ bio: false, homeUrl: '' })
		const response = await visit('/')
		expect(response.status).toBe(200)
		const html = await response.text()
		expect(html).toContain('This address is for short links')
		expect(html).toContain('name="robots" content="noindex"')
		expect(html).not.toContain('/admin/')
	})

	it('redirects "/" to homeUrl when there is one', async () => {
		await save({ homeUrl: 'https://example.com/welcome' })
		const response = await visit('/')
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://example.com/welcome')
		expect(response.headers.get('cache-control')).toBe('no-store')

		await save({ homeUrl: '' })
		expect((await visit('/')).status).toBe(200)
	})

	it('creates and follows short links with no page anywhere', async () => {
		expect((await apiJson<StateResponse>('/state')).pages).toEqual([])
		const { link, short } = await apiJson<CreateLinkResponse>('/links', { method: 'POST', json: { url: 'https://example.com/a', slug: 'first' } })
		expect(short).toBe(`${ORIGIN}/first`)
		expect(link.pageId).toBeNull()

		const { created, errors } = await apiJson<{ created: unknown[]; errors: unknown[] }>('/links/bulk', {
			method: 'POST',
			json: { links: [{ url: 'https://example.com/b', slug: 'second' }, { url: 'https://example.com/c' }] },
		})
		expect(created).toHaveLength(2)
		expect(errors).toEqual([])

		const redirected = await visit('/first?s=ig')
		expect(redirected.status).toBe(302)
		expect(redirected.headers.get('location')).toBe('https://example.com/a')
		const { links } = await apiJson<LinksResponse>('/links')
		expect(links.find((entry) => entry.slug === 'first')?.stats?.total).toBe(1)
		expect((await apiJson<{ total: number }>(`/links/${link.id}/stats?days=7`)).total).toBe(1)
	})

	it('answers everything the dashboard reads without a page', async () => {
		const state = await apiJson<StateResponse>('/state')
		expect(state.settings.home).toBe('')
		const stats = await apiJson<StatsResponse>('/stats?days=7')
		expect(stats.page).toBeNull()
		expect(stats.totals).toEqual({ views: 0, clicks: 0 })
		expect((await visit('/nothing-here')).status).toBe(404)
	})

	it('lists no pages for search engines', async () => {
		const robots = await (await visit('/robots.txt')).text()
		expect(robots).toContain('Disallow: /admin/')
		expect(robots).not.toContain('Sitemap:')
		const sitemap = await visit('/sitemap.xml')
		expect(sitemap.status).toBe(200)
		const xml = await sitemap.text()
		expect(xml).toContain('<urlset')
		expect(xml).not.toContain('<url>')
	})

	it('backs up and restores a site with no pages, the switch included', async () => {
		await save({ homeUrl: 'https://example.com/home' })
		const backup = await apiJson<{ pages: unknown[]; settings: Settings; shortLinks: { slug: string }[] }>('/export')
		expect(backup.pages).toEqual([])
		expect(backup.settings).toMatchObject({ bio: false, homeUrl: 'https://example.com/home' })
		expect(backup.shortLinks.map((link) => link.slug)).toContain('first')

		await save({ bio: true, homeUrl: '' })
		expect(await apiJson('/import', { method: 'POST', json: backup })).toMatchObject({ pages: 0 })
		expect(await settingsNow()).toMatchObject({ bio: false, homeUrl: 'https://example.com/home' })
		expect((await visit('/')).headers.get('location')).toBe('https://example.com/home')
		expect((await visit('/first')).headers.get('location')).toBe('https://example.com/a')

		const bad = { ...backup, settings: { ...backup.settings, homeUrl: 'javascript:alert(1)' } }
		expect((await api('/import', { method: 'POST', json: bad })).status).toBe(400)
		// A backup from before this setting leaves it as it is.
		const { bio: _bio, homeUrl: _homeUrl, ...older } = backup.settings
		await apiJson('/import', { method: 'POST', json: { ...backup, settings: older } })
		expect(await settingsNow()).toMatchObject({ bio: false, homeUrl: 'https://example.com/home' })
		await save({ homeUrl: '' })
	})

	it('keeps a first page made through the API off the site, and shows it once pages are on', async () => {
		const { page, settings } = await apiJson<{ page: PageJson; settings: Settings }>('/pages', { method: 'POST', json: { handle: 'later', name: 'Later' } })
		expect(settings).toMatchObject({ bio: false, home: page.id })
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		expect((await visit('/')).status).toBe(200)
		expect(await (await visit('/')).text()).toContain('This address is for short links')
		expect((await visit('/later')).status).toBe(404)

		await save({ bio: true })
		expect(await (await visit('/')).text()).toContain('Later')
		expect((await visit('/later')).status).toBe(200)
	})
})

describe('switching pages on with no page', () => {
	it('brings "/" back to its fresh-install answer', async () => {
		// `later` from above is the only page; without it this is a new install turned on later.
		await env.DB.prepare('DELETE FROM pages').run()
		await env.KV.delete('name:later')
		const settings = await settingsNow()
		await save({ home: '', bio: false })
		await save({ ...settings, home: '', bio: true })
		const response = await visit('/')
		expect(response.status).toBe(200)
		expect(await response.text()).toContain('Open the dashboard')
	})
})

describe('the short links system page', () => {
	it('exists in every language, in that language', () => {
		const titles = new Set<string>()
		for (const locale of LOCALES) {
			const html = renderSystemPage({ kind: 'short-links', host: 'example.com', locale })
			const title = html.match(/<h1>(.+?)<\/h1>/)?.[1] ?? ''
			expect(title, locale).not.toBe('')
			expect(html, locale).toMatch(/<h1>.+<\/h1><p>.+<\/p>/)
			titles.add(title)
		}
		expect(titles.size).toBe(LOCALES.length)
	})

	it('follows the language setting and the browser, like other system pages', async () => {
		await save({ bio: false, locale: 'zh-TW', languages: ['ja'] })
		expect(await (await visit('/')).text()).toContain('這個網址專門放短網址')
		const japanese = await visit('/', undefined, { headers: { 'accept-language': 'ja' } })
		expect(await japanese.text()).toContain('このアドレスは短縮URL専用です')
		expect(japanese.headers.get('vary')).toContain('Accept-Language')
	})
})

describe('wiping the data', () => {
	it('goes back to a fresh install, pages on', async () => {
		await save({ bio: false, homeUrl: 'https://example.com/home' })
		expect((await api('/data', { method: 'DELETE', json: { confirm: 'DELETE' } })).status).toBe(200)
		expect(await settingsNow()).toMatchObject({ bio: true, homeUrl: '' })
		const root = await visit('/')
		expect(root.status).toBe(200)
		expect(await root.text()).toContain('Open the dashboard')
	})
})

describe('agents', () => {
	it('find the switch in the OpenAPI document and the guide', async () => {
		const doc = (await (await call('/api/openapi.json')).json()) as {
			paths: Record<string, Record<string, { requestBody: { content: { 'application/json': { schema: { properties: Record<string, { description?: string }>; required: string[] } } } } }>>
		}
		const schema = doc.paths['/api/settings']!.put!.requestBody.content['application/json'].schema
		expect(schema.properties.bio?.description).toContain('Left out keeps the current value')
		expect(schema.properties.homeUrl?.description).toContain('Left out keeps the current value')
		expect(schema.required ?? []).not.toContain('bio')
		expect(schema.required ?? []).not.toContain('homeUrl')

		const guide = await (await call('/llms.txt')).text()
		for (const part of ['`bio: false`', 'Switching pages off']) expect(guide).toContain(part)
		const topic = await (await call('/api/guide/short-links-only')).text()
		for (const part of ['**Short links only.**', '`bio: false`', '`homeUrl`']) expect(topic).toContain(part)
	})
})
