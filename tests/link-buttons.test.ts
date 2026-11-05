import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { LinkStatsResponse, PageJson, PublishResponse, StatsResponse } from '../src/shared/api'
import { emptyContent, emptyLink, newItem, type LinkItem, type PageContent, type Social } from '../src/shared/content'
import { TAP_SCRIPT, TAP_SCRIPT_HASH } from '../src/templates/render'
import { apiJson, IPHONE, visit } from './helpers'

// A button shows where it goes, and a small script reports the tap; hiding the address is the owner's choice.

const ADDRESS = 'https://shop.example/affiliate?tag=mei-20'
let count = 0

function linkItem(n: number, patch: Partial<LinkItem> = {}): LinkItem {
	return { ...emptyLink(), id: `link-${n}`, title: 'Shop', url: ADDRESS, slug: `shop-${n}`, ...patch }
}

async function makePage(changes: (n: number) => Partial<PageContent>) {
	const n = ++count
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: `buttons-${n}`, name: 'Mei' } })
	const publish = async (next: Partial<PageContent>) => {
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), ...next } })
		await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
	}
	await publish(changes(n))
	return { page, n, handle: page.handle, publish }
}

const htmlOf = async (path: string) => (await visit(path)).text()
const statsOf = (id: string) => apiJson<StatsResponse>(`/stats?page=${id}&days=7`)
const tap = (path: string, userAgent = IPHONE) => visit(path, userAgent, { method: 'POST', body: 'PING', headers: { 'content-type': 'text/ping' } })

describe('a link button', () => {
	it('shows the real address and reports the tap with one script, which the CSP allows by its hash', async () => {
		const { handle, n } = await makePage((i) => ({ items: [linkItem(i)] }))
		const response = await visit(`/${handle}?s=threads`)
		const html = await response.text()
		expect(html).toContain(`href="https://shop.example/affiliate?tag=mei-20" ping="/_c/${handle}/link-${n}/link?s=threads"`)
		expect(html.match(/<script/g)).toHaveLength(1)
		expect(html).toContain(`<script>${TAP_SCRIPT}</script>`)
		const csp = response.headers.get('content-security-policy') ?? ''
		expect(csp).toContain(`script-src '${TAP_SCRIPT_HASH}';`)
		expect(csp).not.toMatch(/script-src [^;]*unsafe-inline/)
		expect(csp).toContain("connect-src 'self'")
	})

	it('has the hash of exactly the script it sends', async () => {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TAP_SCRIPT))
		expect(`sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`).toBe(TAP_SCRIPT_HASH)
	})

	it('reports a tap once: the script takes the attribute off before it counts', () => {
		expect(TAP_SCRIPT.indexOf("removeAttribute('ping')")).toBeGreaterThan(-1)
		expect(TAP_SCRIPT.indexOf("removeAttribute('ping')")).toBeLessThan(TAP_SCRIPT.indexOf('addEventListener'))
		expect(TAP_SCRIPT).toContain('keepalive:true')
		expect(TAP_SCRIPT).toContain("credentials:'omit'")
	})

	it('sends no script when nothing on the page reports a tap', async () => {
		const { handle } = await makePage((i) => ({ items: [linkItem(i, { hideUrl: true })], socials: [{ id: `mail-only-${i}`, platform: 'email', url: 'mei@example.com' }] }))
		expect(await htmlOf(`/${handle}`)).not.toContain('<script')
	})

	it('isn’t fooled by the owner writing the attribute into their own text', async () => {
		const { handle } = await makePage((i) => ({ items: [linkItem(i, { hideUrl: true, title: 'a ping="x" b' })] }))
		expect(await htmlOf(`/${handle}`)).not.toContain('<script')
	})

	it('counts a tap under the link itself, the same as a click on its short link', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [linkItem(i)] }))
		const response = await tap(`/_c/${handle}/link-${n}/link?s=threads`)
		expect(response.status).toBe(204)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect((await visit(`/shop-${n}`)).headers.get('location')).toBe(ADDRESS)
		const stats = await statsOf(page.id)
		expect(stats.totals.clicks).toBe(2)
		expect(stats.topLinks).toMatchObject([{ target: `link-${n}`, count: 2, label: 'Shop', kind: 'link', slug: `shop-${n}` }])
		expect(stats.clickSources.find((row) => row.value === 'threads')?.count).toBe(1)
		const own = await apiJson<LinkStatsResponse>(`/links/link-${n}/stats?days=7`)
		expect(own.total).toBe(2)
	})

	it('still has a short link for sharing elsewhere', async () => {
		const { n } = await makePage((i) => ({ items: [linkItem(i)] }))
		const response = await visit(`/shop-${n}`)
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe(ADDRESS)
	})

	it('keeps its address off the page when the owner hides it', async () => {
		const { handle, n } = await makePage((i) => ({ items: [linkItem(i, { hideUrl: true })] }))
		const html = await htmlOf(`/${handle}?s=threads`)
		expect(html).toContain(`href="/shop-${n}?s=threads"`)
		expect(html).not.toContain('shop.example')
		expect(html).not.toContain(`/link-${n}/link`)
	})

	it('doesn’t count a tap from a bot, a link that isn’t there, or a hidden one', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [linkItem(i), linkItem(i + 1000, { hidden: true, slug: `secret-${i}` })] }))
		await tap(`/_c/${handle}/link-${n}/link`, 'Googlebot/2.1 (+http://www.google.com/bot.html)')
		expect((await tap(`/_c/${handle}/nope-nope/link`)).status).toBe(204)
		expect((await tap(`/_c/${handle}/link-${n + 1000}/link`)).status).toBe(204)
		expect((await tap('/_c/no-such-page/link-1/link')).status).toBe(204)
		expect((await statsOf(page.id)).totals.clicks).toBe(0)
	})

	it('stays a plain link in a preview, which counts nothing', async () => {
		const { page } = await makePage((i) => ({ items: [linkItem(i)] }))
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		const html = await htmlOf(new URL(url).pathname)
		expect(html).toContain('href="https://shop.example/affiliate?tag=mei-20"')
		expect(html).not.toContain('ping=')
		expect(html).not.toContain(TAP_SCRIPT)
	})
})

describe('a link that needs its short link', () => {
	const settings = [
		['a password', { password: 'open-sesame' }, { password: null }],
		['a phone address', { iosUrl: 'https://apps.apple.com/app/1' }, { iosUrl: '' }],
		['an Android address', { androidUrl: 'https://play.google.com/store/apps/details?id=x' }, { androidUrl: '' }],
		['the LINE setting', { lineExternal: true }, { lineExternal: false }],
		['the in-app browser prompt', { inAppPrompt: true }, { inAppPrompt: false }],
		['UTM tags', { utm: { source: 'bio' } }, { utm: { source: '' } }],
	] as const

	for (const [name, on, off] of settings) {
		it(`goes through it as soon as it has ${name}, and comes back when that’s gone`, async () => {
			const { handle, n } = await makePage((i) => ({ items: [linkItem(i)] }))
			expect(await htmlOf(`/${handle}`)).toContain('ping=')
			await apiJson(`/links/link-${n}`, { method: 'PATCH', json: on })
			const hidden = await htmlOf(`/${handle}`)
			expect(hidden).toContain(`href="/shop-${n}"`)
			expect(hidden).not.toContain('shop.example')
			await apiJson(`/links/link-${n}`, { method: 'PATCH', json: off })
			expect(await htmlOf(`/${handle}`)).toContain(`ping="/_c/${handle}/link-${n}/link"`)
		})
	}

	it('asks for the password, so the page can’t be a way round it', async () => {
		const { handle, n, publish } = await makePage((i) => ({ items: [linkItem(i)] }))
		await apiJson(`/links/link-${n}`, { method: 'PATCH', json: { password: 'open-sesame' } })
		// Publishing again keeps it hidden.
		await publish({ items: [linkItem(n, { title: 'Renamed' })] })
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain('Renamed')
		expect(html).not.toContain('shop.example')
		expect((await visit(`/shop-${n}`)).status).toBe(401)
	})

	it('is safe in a copy of the page written before this existed: it gets rebuilt', async () => {
		const { handle, n } = await makePage((i) => ({ items: [linkItem(i)] }))
		await apiJson(`/links/link-${n}`, { method: 'PATCH', json: { password: 'open-sesame' } })
		const copy = (await env.KV.get(`page:${handle}`, 'json')) as Record<string, unknown>
		delete copy.viaShortLink
		await env.KV.put(`page:${handle}`, JSON.stringify({ ...copy, v: 2 }))
		expect(await htmlOf(`/${handle}`)).not.toContain('shop.example')
	})
})

describe('other links on a page', () => {
	const product = (n: number) => ({ ...newItem('product'), id: `prod-${n}`, moreUrl: 'https://shop.example/all', products: [{ id: 'beans', name: 'Beans', price: '', image: null, url: 'https://shop.example/beans' }] })
	const video = (n: number) => ({ ...newItem('video'), id: `video-${n}`, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })

	it('show the real address too, and count the same way', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [product(i)] as PageContent['items'] }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain(`href="https://shop.example/beans" ping="/_c/${handle}/prod-${n}/beans"`)
		expect(html).toContain(`href="https://shop.example/all" ping="/_c/${handle}/prod-${n}/more"`)
		expect((await tap(`/_c/${handle}/prod-${n}/beans`)).status).toBe(204)
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `prod-${n}.beans`, count: 1, label: 'Product: Beans' }])
	})

	it('keep going through the Worker for a video, whose player opens in its frame', async () => {
		const { handle, n } = await makePage((i) => ({ items: [video(i)] as PageContent['items'] }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain(`/_c/${handle}/video-${n}/play`)
		expect((await visit(`/_c/${handle}/video-${n}/play`)).status).toBe(302)
	})
})

describe('social icons', () => {
	const icons = (n: number): Social[] => [
		{ id: `insta-${n}`, platform: 'instagram', url: 'instagram.com/mei' },
		{ id: `site-${n}`, platform: 'website', url: 'https://mei.example' },
		{ id: `mail-${n}`, platform: 'email', url: 'mei@example.com' },
	]

	it('aren’t counted by default', async () => {
		const { page, handle, n } = await makePage((i) => ({ socials: icons(i) }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain('href="https://instagram.com/mei" aria-label="Instagram" rel="me"')
		expect(html).not.toContain('ping=')
		await tap(`/_c/${handle}/insta-${n}/social`)
		expect((await statsOf(page.id)).totals.clicks).toBe(0)
	})

	it('report a tap when the owner counts them, and stay real links', async () => {
		const { page, handle, n } = await makePage((i) => ({ countSocials: true, socials: icons(i) }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain(`href="https://instagram.com/mei" aria-label="Instagram" rel="me" ping="/_c/${handle}/insta-${n}/social"`)
		expect(html).toContain('href="mailto:mei@example.com"')
		expect(html).toContain(TAP_SCRIPT)
		expect(html).not.toContain(`/mail-${n}/social`)
		expect((await tap(`/_c/${handle}/insta-${n}/social`)).status).toBe(204)
		expect((await tap(`/_c/${handle}/site-${n}/social`)).status).toBe(204)
		const labels = (await statsOf(page.id)).topLinks.map((entry) => entry.label).sort()
		expect(labels).toEqual(['Social icon: Instagram', 'Social icon: Website'])
	})

	it('leave a block’s part of the same name alone', async () => {
		const shop = (n: number) => ({ ...newItem('product'), id: `shop-${n}`, products: [{ id: 'social', name: 'Socks', price: '', image: null, url: 'https://shop.example/socks' }] })
		const { handle, n } = await makePage((i) => ({ countSocials: true, socials: icons(i), items: [shop(i)] as PageContent['items'] }))
		expect((await visit(`/_c/${handle}/shop-${n}/social`)).headers.get('location')).toBe('https://shop.example/socks')
		expect((await visit(`/_c/${handle}/nope-nope/social`)).headers.get('location')).toBe(`/${handle}`)
	})
})
