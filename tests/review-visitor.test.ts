import { describe, expect, it } from 'vitest'
import type { PreviewLinkResponse } from '../src/shared/api'
import { PASSWORD_TRIES } from '../src/worker/lib/db'
import { api, apiJson, call, visit } from './helpers'

// What a review of the visitor's side found (2026-11-20): three things anyone could do to a site without signing in.

async function pageWith(handle: string, items: object[]) {
	const { page } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle, name: handle } })
	const { page: full } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${page.id}`)
	await api(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...full.draft, items } })
	const published = await api(`/pages/${page.id}/publish`, { method: 'POST' })
	expect(published.status, await published.clone().text()).toBe(200)
	return page.id
}
const link = (id: string, slug: string, url: string, more: object = {}) => ({ id, kind: 'link', title: id, subtitle: '', url, slug, icon: 'auto', featured: false, hidden: false, startsAt: null, endsAt: null, ...more })

describe('an address that doesn’t exist', () => {
	it('still suggests the near ones: a typo, a swap, a missing letter', async () => {
		await pageWith('rv-bakery', [link('rv-menu-1', 'rv-menu', 'https://example.com/menu'), link('rv-order-1', 'rv-order', 'https://example.com/order')])
		const near = async (slug: string) => await (await visit(`/${slug}`)).text()
		expect(await near('rv-bakry')).toContain('/rv-bakery')
		expect(await near('rv-mneu')).toContain('/rv-menu')
		expect(await near('rv-ordr')).toContain('/rv-order')
		expect(await near('rv-bakery-shop')).not.toContain('href="/rv-bakery"')
		// Nothing is near an address far longer than any name, and none is looked for.
		const long = await visit(`/${'a'.repeat(64)}`)
		expect(long.status).toBe(404)
		expect(await long.text()).not.toContain('rv-')
	})

	it('costs the same however long it is, where it used to cost by the square of its length', async () => {
		// A page and its links are a handful of names here; the cost that mattered grew with each name and with the
		// address's length. A 64-letter address against every name must now be turned away on its length alone.
		const started = performance.now()
		for (let i = 0; i < 40; i++) expect((await visit(`/${'q'.repeat(60)}${i}`)).status).toBe(404)
		const long = performance.now() - started
		const again = performance.now()
		for (let i = 0; i < 40; i++) expect((await visit(`/qq${i}`)).status).toBe(404)
		const short = performance.now() - again
		expect(long).toBeLessThan(short * 4 + 200)
	})
})

describe('a draft’s preview link', () => {
	it('keeps back the address of a link behind a password, and of one whose address is hidden', async () => {
		const id = await pageWith('rv-private', [
			link('rv-secret-1', 'rv-secret', 'https://example.com/behind-a-password'),
			link('rv-hidden-1', 'rv-hidden', 'https://example.com/affiliate?ref=me', { hideUrl: true }),
			link('rv-open-1', 'rv-open', 'https://example.com/open'),
		])
		expect((await api('/links/rv-secret-1', { method: 'PATCH', json: { password: 'correct horse' } })).status).toBe(200)
		const { url } = await apiJson<PreviewLinkResponse>(`/pages/${id}/preview-link`, { method: 'POST', json: { minutes: 60 } })
		const html = await (await call(new URL(url).pathname)).text()
		expect(html).toContain('rv-open-1')
		expect(html).not.toContain('behind-a-password')
		expect(html).not.toContain('affiliate?ref=me')
		// They go where the live page sends them: through the short link, which asks for the password.
		expect(html).toContain('href="/rv-secret"')
		expect(html).toContain('href="/rv-hidden"')
		expect(html).toContain('href="https://example.com/open"')
		// The owner's own preview in the dashboard still shows where a link goes.
		expect(await (await api(`/pages/${id}/preview`)).text()).toContain('behind-a-password')
	})

	it('shows nowhere to go for a hidden link that has no short link yet', async () => {
		const { page } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle: 'rv-unpublished', name: 'x' } })
		const { page: full } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${page.id}`)
		await api(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...full.draft, items: [link('rv-new-1', 'rv-new', 'https://example.com/not-yet', { hideUrl: true })] } })
		const { url } = await apiJson<PreviewLinkResponse>(`/pages/${page.id}/preview-link`, { method: 'POST', json: { minutes: 60 } })
		const html = await (await call(new URL(url).pathname)).text()
		expect(html).not.toContain('not-yet')
		expect(html).toContain('href="#"')
	})
})

describe('a link’s password', () => {
	const guess = (slug: string, password: string) => call(`/${slug}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (iPhone)' }, body: `password=${encodeURIComponent(password)}` })

	it('takes ten wrong tries, then none for a while, not even the right one', async () => {
		await pageWith('rv-locked', [link('rv-pin-1', 'rv-pin', 'https://example.com/prize')])
		await api('/links/rv-pin-1', { method: 'PATCH', json: { password: '4821' } })
		// All at once, as a guesser would send them: counted before any is looked at.
		const tries = await Promise.all(Array.from({ length: PASSWORD_TRIES + 15 }, (_, n) => guess('rv-pin', String(1000 + n))))
		const statuses = tries.map((response) => response.status)
		expect(statuses.filter((status) => status === 401)).toHaveLength(PASSWORD_TRIES)
		expect(statuses.filter((status) => status === 429)).toHaveLength(15)
		const locked = await guess('rv-pin', '4821')
		expect(locked.status).toBe(429)
		const page = await locked.text()
		expect(page).toContain('Too many wrong tries')
		expect(page).not.toContain('<form')
		expect(locked.headers.get('location')).toBeNull()
	}, 30_000)

	it('gives a right try back, so the people it is for never run out', async () => {
		await pageWith('rv-busy', [link('rv-door-1', 'rv-door', 'https://example.com/inside')])
		await api('/links/rv-door-1', { method: 'PATCH', json: { password: 'open sesame' } })
		for (let n = 0; n < PASSWORD_TRIES + 5; n++) {
			const response = await guess('rv-door', 'open sesame')
			expect(response.status, `visitor ${n + 1}`).toBe(303)
			expect(response.headers.get('location')).toBe('https://example.com/inside')
		}
		// And a few wrong ones among them are still only a few.
		expect((await guess('rv-door', 'nope')).status).toBe(401)
		expect((await guess('rv-door', 'open sesame')).status).toBe(303)
	}, 30_000)
})
