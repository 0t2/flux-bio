import { describe, expect, it } from 'vitest'
import type { PreviewLinkResponse } from '../src/shared/api'
import { env } from 'cloudflare:test'
import { PASSWORD_TRIES } from '../src/worker/lib/db'
import { distance } from '../src/worker/routes/site'
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

	it('measures as the plain way of measuring does, for everything near enough to matter', () => {
		// The whole table, as it was before: right, and far too much work for every name on every miss.
		const plain = (a: string, b: string): number => {
			const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
			for (let i = 1; i <= a.length; i++) {
				for (let j = 1; j <= b.length; j++) {
					const cost = a[i - 1] === b[j - 1] ? 0 : 1
					d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
					if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
				}
			}
			return d[a.length]![b.length]!
		}
		// The rows are used again from one name to the next, so they are here too: what one pair left must not reach the next.
		const rows: [Uint16Array, Uint16Array, Uint16Array] = [new Uint16Array(68), new Uint16Array(68), new Uint16Array(68)]
		let seed = 20261120
		const random = (below: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648
			return seed % below
		}
		const word = (length: number, letters: string) => Array.from({ length }, () => letters[random(letters.length)]).join('')
		const typo = (text: string) => {
			const at = random(text.length + 1)
			const kind = random(4)
			if (kind === 0) return text.slice(0, at) + word(1, 'abc') + text.slice(at)
			if (kind === 1) return text.slice(0, at) + text.slice(at + 1)
			if (kind === 2) return text.slice(0, at) + word(1, 'abc') + text.slice(at + 1)
			return at + 1 < text.length ? text.slice(0, at) + text[at + 1] + text[at] + text.slice(at + 2) : text
		}
		for (let n = 0; n < 6000; n++) {
			// Few letters, so that near misses, repeats and swaps are common; and names a typo or three apart.
			const a = word(random(n % 3 === 0 ? 64 : 9) + 1, 'abc')
			const b = n % 2 ? word(random(9) + 1, 'abc') : [typo, typo, typo].slice(0, random(4)).reduce((text, change) => change(text), a).slice(0, 64) || 'a'
			for (const limit of [1, 2]) expect(distance(a, b, limit, rows), `${a} / ${b} within ${limit}`).toBe(Math.min(plain(a, b), limit + 1))
		}
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

	it('keeps it back for a link that was taken off the page and is in the draft again, as a version put back is', async () => {
		const items = [link('rv-vault-1', 'rv-vault', 'https://example.com/still-behind-a-password'), link('rv-plain-1', 'rv-plain', 'https://example.com/plain')]
		const id = await pageWith('rv-back-again', items)
		expect((await api('/links/rv-vault-1', { method: 'PATCH', json: { password: 'correct horse' } })).status).toBe(200)
		const draft = async (now: object[]) => {
			const { page } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${id}`)
			expect((await api(`/pages/${id}/draft`, { method: 'PUT', json: { ...page.draft, items: now } })).status).toBe(200)
		}
		// Off the page and published: its short link is archived, and keeps its password for when it comes back.
		await draft([items[1]!])
		expect((await api(`/pages/${id}/publish`, { method: 'POST' })).status).toBe(200)
		await draft(items)
		const { url } = await apiJson<PreviewLinkResponse>(`/pages/${id}/preview-link`, { method: 'POST', json: { minutes: 60 } })
		const html = await (await call(new URL(url).pathname)).text()
		expect(html).toContain('rv-plain-1')
		expect(html).not.toContain('still-behind-a-password')
		// And published back, it is behind its password as before.
		expect((await api(`/pages/${id}/publish`, { method: 'POST' })).status).toBe(200)
		expect(await (await visit('/rv-back-again')).text()).not.toContain('still-behind-a-password')
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

	const counted = async (id: string) => {
		const row = await env.DB.prepare("SELECT json_extract(value, '$.n') AS n FROM _meta WHERE key = ?1").bind(`tries:${id}`).first<{ n: number }>()
		return row?.n ?? 0
	}

	it('counts only wrong tries that were looked at: the ones turned away unread are given back', async () => {
		await pageWith('rv-burst', [link('rv-gate-1', 'rv-gate', 'https://example.com/garden')])
		await api('/links/rv-gate-1', { method: 'PATCH', json: { password: 'right' } })
		// Thirty people with the right password in the same instant, and nobody guessing. Only so many are looked at
		// at once, and the rest are asked to try again: none of them may stay counted as a wrong try.
		const together = await Promise.all(Array.from({ length: 30 }, () => guess('rv-gate', 'right')))
		expect(together.filter((response) => response.status === 303).length).toBeGreaterThanOrEqual(PASSWORD_TRIES)
		expect(await counted('rv-gate-1')).toBe(0)
		expect((await guess('rv-gate', 'right')).status).toBe(303)
		// A guesser's burst leaves exactly the tries that were looked at, however many were sent.
		await Promise.all(Array.from({ length: 40 }, (_, n) => guess('rv-gate', `wrong ${n}`)))
		expect(await counted('rv-gate-1')).toBe(PASSWORD_TRIES)
		expect((await guess('rv-gate', 'right')).status).toBe(429)
	}, 30_000)

	it('starts again with a new password: the owner who changes it isn’t locked out with the guessers', async () => {
		await pageWith('rv-changed', [link('rv-lock-1', 'rv-lock', 'https://example.com/room')])
		await api('/links/rv-lock-1', { method: 'PATCH', json: { password: 'old' } })
		await Promise.all(Array.from({ length: PASSWORD_TRIES }, (_, n) => guess('rv-lock', `guess ${n}`)))
		expect((await guess('rv-lock', 'old')).status).toBe(429)
		expect((await api('/links/rv-lock-1', { method: 'PATCH', json: { password: 'new and longer' } })).status).toBe(200)
		expect((await guess('rv-lock', 'new and longer')).status).toBe(303)
	}, 30_000)
})
