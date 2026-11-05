import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { LinkJson, PageJson, PublishResponse, ShortLinkResponse, StatsResponse } from '../src/shared/api'
import { emptyContent, emptyLink, socialHref, type LinkItem, type PageContent } from '../src/shared/content'
import { api, apiJson, call, IPHONE, visit } from './helpers'

// A link's short link can be made and renamed right away, the way a page's own address can.

const ADDRESS = 'https://shop.example/item'
let count = 0

async function makePage(changes: (n: number) => Partial<PageContent>, publish = true) {
	const n = ++count
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: `share-${n}`, name: 'Mei' } })
	await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), ...changes(n) } })
	if (publish) await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
	return { page, n, handle: page.handle }
}

const linkItem = (n: number, patch: Partial<LinkItem> = {}): LinkItem => ({ ...emptyLink(), id: `link-${n}`, title: 'My Shop', url: ADDRESS, slug: '', ...patch })
const short = (pageId: string, itemId: string, slug?: string) => api(`/pages/${pageId}/links/${itemId}/short`, { method: 'PUT', json: slug === undefined ? {} : { slug } })
const pageOf = async (id: string) => (await apiJson<{ page: PageJson }>(`/pages/${id}`)).page
const firstLink = (content: PageContent | null) => content?.items[0] as LinkItem | undefined

describe('a short link made from the Share button', () => {
	it('works straight away, on a page that isn’t public yet', async () => {
		const { page, n } = await makePage((i) => ({ items: [linkItem(i)] }), false)
		const response = await short(page.id, `link-${n}`)
		expect(response.status).toBe(200)
		const { link, draftUpdatedAt } = (await response.json()) as ShortLinkResponse
		expect(link.kind).toBe('bio')
		expect(link.slug).not.toBe('')
		expect((await visit(`/${link.slug}`)).headers.get('location')).toBe(ADDRESS)
		const saved = await pageOf(page.id)
		expect(firstLink(saved.draft)?.slug).toBe(link.slug)
		expect(saved.draftUpdatedAt).toBe(draftUpdatedAt)
		expect(saved.published).toBeNull()
	})

	it('takes the name asked for, and asking again changes nothing', async () => {
		const { page, n } = await makePage((i) => ({ items: [linkItem(i)] }), false)
		const first = (await (await short(page.id, `link-${n}`, `Mine-${n}`)).json()) as ShortLinkResponse
		expect(first.link.slug).toBe(`mine-${n}`)
		const again = (await (await short(page.id, `link-${n}`)).json()) as ShortLinkResponse
		expect(again.link.slug).toBe(`mine-${n}`)
		expect(again.draftUpdatedAt).toBe(first.draftUpdatedAt)
	})

	it('is kept by the publish that follows, with its clicks', async () => {
		const { page, n } = await makePage((i) => ({ items: [linkItem(i)] }), false)
		await short(page.id, `link-${n}`, `keep-${n}`)
		await visit(`/keep-${n}`, IPHONE)
		const published = await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(firstLink(published.content)?.slug).toBe(`keep-${n}`)
		expect((await visit(`/keep-${n}`)).status).toBe(302)
		const stats = await apiJson<StatsResponse>(`/stats?page=${page.id}&days=7`)
		expect(stats.totals.clicks).toBe(2)
	})

	it('asks for an address first, and doesn’t exist for a link that doesn’t', async () => {
		const { page, n } = await makePage((i) => ({ items: [linkItem(i, { url: '' })] }), false)
		expect((await short(page.id, `link-${n}`)).status).toBe(400)
		expect((await short(page.id, 'no-such-link')).status).toBe(404)
		const other = await makePage((i) => ({ items: [linkItem(i)] }))
		expect((await short(page.id, `link-${other.n}`)).status).toBe(404)
	})
})

describe('renaming a short link', () => {
	it('happens at once, without a publish: the old name stops and the new one goes', async () => {
		const { page, n } = await makePage((i) => ({ items: [linkItem(i, { slug: `old-${i}` })] }))
		expect((await short(page.id, `link-${n}`, `new-${n}`)).status).toBe(200)
		expect((await visit(`/new-${n}`)).headers.get('location')).toBe(ADDRESS)
		expect((await visit(`/old-${n}`)).status).toBe(404)
		const saved = await pageOf(page.id)
		expect(firstLink(saved.draft)?.slug).toBe(`new-${n}`)
		expect(firstLink(saved.published)?.slug).toBe(`new-${n}`)
	})

	it('moves a button that hides its address along with it', async () => {
		const { page, n, handle } = await makePage((i) => ({ items: [linkItem(i, { slug: `hid-${i}`, hideUrl: true })] }))
		expect(await (await visit(`/${handle}`)).text()).toContain(`href="/hid-${n}"`)
		await short(page.id, `link-${n}`, `hidden-${n}`)
		expect(await (await visit(`/${handle}`)).text()).toContain(`href="/hidden-${n}"`)
	})

	it('leaves an address changed in the draft for the publish', async () => {
		const { page, n } = await makePage((i) => ({ items: [linkItem(i, { slug: `draft-${i}` })] }))
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), items: [linkItem(n, { slug: `draft-${n}`, url: 'https://shop.example/next' })] } })
		await short(page.id, `link-${n}`, `moved-${n}`)
		expect((await visit(`/moved-${n}`)).headers.get('location')).toBe(ADDRESS)
		expect(firstLink((await pageOf(page.id)).draft)?.url).toBe('https://shop.example/next')
	})

	it('refuses a name that’s taken or reserved, and changes nothing', async () => {
		const { page, n, handle } = await makePage((i) => ({ items: [linkItem(i, { slug: `taken-${i}` }), linkItem(i + 5000, { slug: `other-${i}` })] }))
		expect((await short(page.id, `link-${n}`, `other-${n}`)).status).toBe(409)
		expect((await short(page.id, `link-${n}`, handle)).status).toBe(409)
		expect((await short(page.id, `link-${n}`, 'admin')).status).toBe(400)
		expect((await visit(`/taken-${n}`)).status).toBe(302)
	})

	it('doesn’t overwrite anybody: a draft that moved on is refused', async () => {
		const { page, n } = await makePage((i) => ({ items: [linkItem(i, { slug: `race-${i}` })] }))
		const stale = await api(`/pages/${page.id}/links/link-${n}/short`, { method: 'PUT', json: { slug: `late-${n}` }, headers: { 'if-match': '1' } })
		expect(stale.status).toBe(409)
		expect((await visit(`/late-${n}`)).status).toBe(404)
	})

	it('also works through PATCH, which still leaves the rest to the draft', async () => {
		const { n } = await makePage((i) => ({ items: [linkItem(i, { slug: `patch-${i}` })] }))
		const { link } = await apiJson<{ link: LinkJson }>(`/links/link-${n}`, { method: 'PATCH', json: { slug: `patched-${n}`, lineExternal: true } })
		expect(link.slug).toBe(`patched-${n}`)
		expect(link.lineExternal).toBe(true)
		expect((await visit(`/patched-${n}`)).status).toBe(302)
		expect((await api(`/links/link-${n}`, { method: 'PATCH', json: { url: 'https://elsewhere.example' } })).status).toBe(400)
	})

	it('keeps the copy of the page in KV in step', async () => {
		const { page, n, handle } = await makePage((i) => ({ items: [linkItem(i, { slug: `kv-${i}` })] }))
		await short(page.id, `link-${n}`, `kv-new-${n}`)
		const copy = (await env.KV.get(`page:${handle}`, 'json')) as { content: PageContent }
		expect(firstLink(copy.content)?.slug).toBe(`kv-new-${n}`)
		expect(await env.KV.get(`link:kv-${n}`)).toBeNull()
		expect(await env.KV.get(`link:kv-new-${n}`)).not.toBeNull()
	})
})

describe('the LINE button', () => {
	const tap = (path: string) => call(path, { method: 'POST', headers: { 'user-agent': IPHONE } })

	it('isn’t there unless the owner adds it', async () => {
		const { handle } = await makePage(() => ({}))
		const html = await (await visit(`/${handle}`)).text()
		expect(html).not.toContain('line-button')
		expect(html).not.toContain('<body class')
	})

	it('floats on the page with LINE’s mark, and reports a tap', async () => {
		const { page, handle } = await makePage(() => ({ lineButton: 'https://lin.ee/abc' }))
		const html = await (await visit(`/${handle}?s=threads`)).text()
		expect(html).toContain(`<a class="line-button" href="https://lin.ee/abc" ping="/_c/${handle}/page/line?s=threads" aria-label="LINE">`)
		expect(html).toContain('<body class="has-line">')
		expect(html).toContain('<script>')
		expect((await tap(`/_c/${handle}/page/line`)).status).toBe(204)
		const stats = await apiJson<StatsResponse>(`/stats?page=${page.id}&days=7`)
		expect(stats.topLinks).toMatchObject([{ target: `${page.id}.line`, count: 1, label: 'LINE button' }])
	})

	it('takes an official account’s @id', async () => {
		expect(socialHref('line', '@cafe.tw')).toBe('https://line.me/R/ti/p/@cafe.tw')
		const { handle } = await makePage(() => ({ lineButton: '@cafe.tw' }))
		expect(await (await visit(`/${handle}`)).text()).toContain('href="https://line.me/R/ti/p/@cafe.tw"')
	})

	it('stops a publish when its address makes no sense, and an empty one is no button', async () => {
		const { page } = await makePage(() => ({ lineButton: 'not an address' }), false)
		const refused = await api(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(refused.status).toBe(400)
		const { handle } = await makePage(() => ({ lineButton: '  ' }))
		expect(await (await visit(`/${handle}`)).text()).not.toContain('line-button')
	})

	it('shows in a preview too, without counting', async () => {
		const { page } = await makePage(() => ({ lineButton: 'https://lin.ee/abc' }), false)
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		const html = await (await visit(new URL(url).pathname)).text()
		expect(html).toContain('class="line-button"')
		expect(html).not.toContain('ping=')
	})

	it('uses LINE’s mark in the row of social icons as well', async () => {
		const { handle } = await makePage((i) => ({ socials: [{ id: `line-${i}`, platform: 'line', url: 'https://lin.ee/abc' }] }))
		expect(await (await visit(`/${handle}`)).text()).toContain('M19.365 9.863')
	})
})
