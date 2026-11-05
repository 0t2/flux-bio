import { describe, expect, it } from 'vitest'
import type { PageJson, PageSummary, PublishResponse } from '../src/shared/api'
import { mediaIdsOf } from '../src/shared/backup'
import { CUSTOM_HTML_LIMIT, emptyContent, emptyLink, type CustomPage, type PageContent, type Settings } from '../src/shared/content'
import { api, apiJson, IPHONE, visit } from './helpers'

// A page doesn't have to be a page of links: it can be the owner's own HTML, or send visitors elsewhere.

const HTML = '<!doctype html><title>Mine</title><script>document.title = "ran"</script><h1>My own page</h1>'
let count = 0

async function makePage(custom?: CustomPage, base?: Partial<PageContent>) {
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: `custom-${++count}`, name: 'Custom' } })
	await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Custom'), ...base, ...(custom ? { custom } : {}) } })
	return page
}
const publish = (id: string) => apiJson<PublishResponse>(`/pages/${id}/publish`, { method: 'POST' })
const viewsOf = async (id: string) => {
	const stats = await apiJson<{ totals: { views: number } }>(`/stats?page=${id}&days=7`)
	return stats.totals.views
}
const settingsNow = async () => (await apiJson<{ settings: Settings }>('/state')).settings

describe('a page of its own HTML', () => {
	it('is served exactly as written, and counts as a view', async () => {
		const page = await makePage({ kind: 'html', html: HTML })
		await publish(page.id)
		const response = await visit(`/${page.handle}`)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('text/html')
		expect(await response.text()).toBe(HTML)
		expect(await viewsOf(page.id)).toBe(1)
	})

	it('runs in a sandbox, so a script in it can never use the owner’s session', async () => {
		const page = await makePage({ kind: 'html', html: HTML })
		await publish(page.id)
		const csp = (await visit(`/${page.handle}`)).headers.get('content-security-policy') ?? ''
		expect(csp).toMatch(/^sandbox /)
		expect(csp).toContain('allow-scripts')
		expect(csp).not.toContain('allow-same-origin')
		expect(csp).not.toContain('allow-top-navigation')
	})

	it('keeps the sandbox in both previews', async () => {
		const page = await makePage({ kind: 'html', html: HTML })
		const preview = await api(`/pages/${page.id}/preview`)
		expect(await preview.text()).toBe(HTML)
		expect(preview.headers.get('content-security-policy')).toMatch(/^sandbox /)
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		const shared = await visit(new URL(url).pathname)
		expect(await shared.text()).toBe(HTML)
		expect(shared.headers.get('content-security-policy')).toMatch(/^sandbox /)
		expect(shared.headers.get('x-robots-tag')).toContain('noindex')
	})

	it('isn’t public until it is published, like any draft', async () => {
		const page = await makePage()
		await publish(page.id)
		const { page: read } = await apiJson<{ page: PageJson }>(`/pages/${page.id}`)
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...read.draft, custom: { kind: 'html', html: HTML } } })
		expect(await (await visit(`/${page.handle}`)).text()).not.toContain('My own page')
		await publish(page.id)
		expect(await (await visit(`/${page.handle}`)).text()).toBe(HTML)
	})

	it('can’t be published empty, or saved too long', async () => {
		const page = await makePage({ kind: 'html', html: '   ' })
		const empty = await api(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(empty.status).toBe(400)
		expect(((await empty.json()) as { problems: { path: string }[] }).problems[0]?.path).toBe('custom.html')
		const long = await api(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Long'), custom: { kind: 'html', html: 'x'.repeat(CUSTOM_HTML_LIMIT + 1) } } })
		expect(long.status).toBe(400)
	})

	it('fits in the database at its longest, in the widest characters', async () => {
		const page = await makePage({ kind: 'html', html: '字'.repeat(CUSTOM_HTML_LIMIT) })
		await publish(page.id)
		expect((await (await visit(`/${page.handle}`)).text()).length).toBe(CUSTOM_HTML_LIMIT)
	})

	it('doesn’t ask to be translated, and search engines hear of it in one language', async () => {
		const page = await makePage({ kind: 'html', html: HTML }, { profile: { name: 'Words', bio: 'More words', avatar: null } })
		const before = await settingsNow()
		await apiJson('/settings', { method: 'PUT', json: { languages: ['ja'] } })
		const published = await publish(page.id)
		expect(published.untranslated).toEqual({})
		const { pages } = await apiJson<{ pages: PageSummary[] }>('/state')
		expect(pages.find((entry) => entry.id === page.id)?.untranslated).toBe(0)
		const sitemap = await (await visit('/sitemap.xml')).text()
		expect(sitemap).toContain(`/${page.handle}<`)
		expect(sitemap).not.toContain(`/${page.handle}?lang=ja`)
		await apiJson('/settings', { method: 'PUT', json: { languages: before.languages } })
	})

	it('has its pictures in backups', () => {
		const content: PageContent = { ...emptyContent('Pics'), custom: { kind: 'html', html: '<img src="/media/abcdefghijkl.webp"><img src="https://bio.example/media/other.png">' } }
		expect(mediaIdsOf(content).sort()).toEqual(['abcdefghijkl.webp', 'other.png'])
	})
})

describe('a page that redirects', () => {
	const TARGET = 'https://example.com/elsewhere'

	it('sends visitors there, and counts as a view', async () => {
		const page = await makePage({ kind: 'redirect', url: TARGET })
		await publish(page.id)
		const response = await visit(`/${page.handle}`)
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe(TARGET)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(await viewsOf(page.id)).toBe(1)
	})

	it('needs a real address', async () => {
		for (const url of ['', 'javascript:alert(1)', 'example.com']) {
			const page = await makePage({ kind: 'redirect', url })
			const response = await api(`/pages/${page.id}/publish`, { method: 'POST' })
			expect(response.status).toBe(400)
			expect(((await response.json()) as { problems: { path: string }[] }).problems[0]?.path).toBe('custom.url')
		}
	})

	it('isn’t offered to search engines', async () => {
		const page = await makePage({ kind: 'redirect', url: TARGET })
		await publish(page.id)
		expect(await (await visit('/sitemap.xml')).text()).not.toContain(`/${page.handle}<`)
	})

	it('goes the same way from a preview', async () => {
		const page = await makePage({ kind: 'redirect', url: TARGET })
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		expect((await visit(new URL(url).pathname)).headers.get('location')).toBe(TARGET)
	})
})

describe('any of them', () => {
	it('can be the home page', async () => {
		const page = await makePage({ kind: 'redirect', url: 'https://example.com/home' })
		await publish(page.id)
		const before = await settingsNow()
		await apiJson('/settings', { method: 'PUT', json: { home: page.id } })
		expect((await visit('/')).headers.get('location')).toBe('https://example.com/home')
		await apiJson('/settings', { method: 'PUT', json: { home: before.home } })
	})

	it('says what it is in the list of pages', async () => {
		const html = await makePage({ kind: 'html', html: HTML })
		const links = await makePage()
		const { pages } = await apiJson<{ pages: PageSummary[] }>('/state')
		expect(pages.find((entry) => entry.id === html.id)?.kind).toBe('html')
		expect(pages.find((entry) => entry.id === links.id)?.kind).toBe('links')
	})

	it('leaves the page’s links alone, and taking it away brings the page back', async () => {
		const items = [{ ...emptyLink(), id: 'kept-link-1', title: 'Kept', url: 'https://example.com/kept', slug: 'kept-link' }]
		const page = await makePage(undefined, { items })
		await publish(page.id)
		const { page: read } = await apiJson<{ page: PageJson }>(`/pages/${page.id}`)
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...read.draft, custom: { kind: 'html', html: HTML } } })
		await publish(page.id)
		expect(await (await visit(`/${page.handle}`)).text()).toBe(HTML)
		expect((await visit('/kept-link')).status).toBe(302)

		const { page: again } = await apiJson<{ page: PageJson }>(`/pages/${page.id}`)
		const { custom: _custom, ...links } = again.draft
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: links })
		await publish(page.id)
		const back = await visit(`/${page.handle}`, IPHONE)
		expect(back.headers.get('content-security-policy')).not.toMatch(/^sandbox/)
		expect(await back.text()).toContain('Kept')
	})

	it('goes offline with every other page when pages are switched off', async () => {
		const page = await makePage({ kind: 'html', html: HTML })
		await publish(page.id)
		await apiJson('/settings', { method: 'PUT', json: { bio: false } })
		expect((await visit(`/${page.handle}`)).status).toBe(404)
		await apiJson('/settings', { method: 'PUT', json: { bio: true } })
		expect(await (await visit(`/${page.handle}`)).text()).toBe(HTML)
	})
})
