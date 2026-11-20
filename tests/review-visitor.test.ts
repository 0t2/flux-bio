import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreviewLinkResponse } from '../src/shared/api'
import { env } from 'cloudflare:test'
import { forgetPastTries, PASSWORD_TRIES, PASSWORD_TRIES_LINK, PASSWORD_WINDOW, returnPasswordTry, takePasswordTry } from '../src/worker/lib/db'
import { visitorNetwork } from '../src/worker/lib/password'
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
	// A wrong try waits half a second before its answer. These are about what is counted, so it doesn't here.
	beforeEach(() => void vi.spyOn(scheduler, 'wait').mockResolvedValue(undefined))
	afterEach(() => vi.restoreAllMocks())

	const guess = (slug: string, password: string, ip = '203.0.113.7') =>
		call(`/${slug}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (iPhone)', 'cf-connecting-ip': ip }, body: `password=${encodeURIComponent(password)}` })

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

	it('gives a try back only in the quarter of an hour it was counted in', async () => {
		// A burst turned away at the end of one quarter of an hour, given back in the next, would make room there
		// for as many guesses again.
		const start = Date.now()
		const old = await takePasswordTry(env.DB, 'rv-window-1', 'aaaaaaaa', start)
		let last = old
		for (let n = 0; n < 3; n++) expect((last = await takePasswordTry(env.DB, 'rv-window-1', 'aaaaaaaa', start + PASSWORD_WINDOW + 1 + n)).ok).toBe(true)
		expect(await counted('rv-window-1')).toBe(3)
		await returnPasswordTry(env.DB, 'rv-window-1', 'aaaaaaaa', old.since)
		expect(await counted('rv-window-1')).toBe(3)
		await returnPasswordTry(env.DB, 'rv-window-1', 'aaaaaaaa', last.since)
		expect(await counted('rv-window-1')).toBe(2)
	})

	const rows = async (id: string) => (await env.DB.prepare("SELECT key, value FROM _meta WHERE key LIKE 'tries:' || ?1 || '%' ORDER BY key").bind(id).all<{ key: string; value: string }>()).results

	it('locks out the one who guesses, and nobody else', async () => {
		await pageWith('rv-fair', [link('rv-fair-1', 'rv-fair-door', 'https://example.com/fair')])
		await api('/links/rv-fair-1', { method: 'PATCH', json: { password: 'the right one' } })
		await Promise.all(Array.from({ length: PASSWORD_TRIES + 5 }, (_, n) => guess('rv-fair-door', `guess ${n}`, '198.51.100.9')))
		// The guesser is read no password now, the right one included. The people the link is for come in as before.
		expect((await guess('rv-fair-door', 'the right one', '198.51.100.9')).status).toBe(429)
		expect((await guess('rv-fair-door', 'the right one', '203.0.113.50')).status).toBe(303)
		expect((await guess('rv-fair-door', 'a slip of the finger', '203.0.113.50')).status).toBe(401)
		expect((await guess('rv-fair-door', 'the right one', '203.0.113.50')).status).toBe(303)
	}, 30_000)

	it('still stops someone who comes from many addresses: the link has a count of its own, from everyone together', async () => {
		await pageWith('rv-many', [link('rv-many-1', 'rv-many-door', 'https://example.com/many')])
		await api('/links/rv-many-1', { method: 'PATCH', json: { password: 'the right one' } })
		// Seven addresses, eight wrong tries each: none of them has had its ten, and the link has had its fifty.
		const statuses: number[] = []
		for (let address = 0; address < 7; address++) {
			for (let n = 0; n < 8; n++) statuses.push((await guess('rv-many-door', `guess ${address}-${n}`, `192.0.2.${address + 1}`)).status)
		}
		expect(statuses.filter((status) => status === 401)).toHaveLength(PASSWORD_TRIES_LINK)
		expect(statuses.filter((status) => status === 429)).toHaveLength(7 * 8 - PASSWORD_TRIES_LINK)
		expect(await counted('rv-many-1')).toBe(PASSWORD_TRIES_LINK)
		expect((await guess('rv-many-door', 'the right one', '203.0.113.99')).status).toBe(429)
	}, 60_000)

	it('looks at no more than the link’s fifty when they all come at once, each from an address of its own', async () => {
		await pageWith('rv-burst-many', [link('rv-flood-1', 'rv-flood-door', 'https://example.com/flood')])
		await api('/links/rv-flood-1', { method: 'PATCH', json: { password: 'the right one' } })
		const together = await Promise.all(Array.from({ length: PASSWORD_TRIES_LINK + 20 }, (_, n) => guess('rv-flood-door', `guess ${n}`, `192.0.2.${n + 1}`)))
		expect(together.filter((response) => response.status === 401)).toHaveLength(PASSWORD_TRIES_LINK)
		expect(await counted('rv-flood-1')).toBe(PASSWORD_TRIES_LINK)
	}, 60_000)

	it('counts an IPv6 visitor by their network, since the rest of the address is theirs to change', async () => {
		expect(visitorNetwork('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3:8d3')
		expect(visitorNetwork('2001:db8:85a3:8d3::1')).toBe('2001:db8:85a3:8d3')
		expect(visitorNetwork('2001:0db8::1')).toBe('2001:db8:0:0')
		expect(visitorNetwork('::ffff:203.0.113.7')).toBe('203.0.113.7')
		expect(visitorNetwork('203.0.113.7')).toBe('203.0.113.7')
		await pageWith('rv-six', [link('rv-six-1', 'rv-six-door', 'https://example.com/six')])
		await api('/links/rv-six-1', { method: 'PATCH', json: { password: 'the right one' } })
		for (let n = 0; n < PASSWORD_TRIES; n++) expect((await guess('rv-six-door', `guess ${n}`, `2001:db8:85a3:8d3::${(n + 1).toString(16)}`)).status).toBe(401)
		expect((await guess('rv-six-door', 'the right one', '2001:db8:85a3:8d3:ffff:ffff:ffff:ffff')).status).toBe(429)
		expect((await guess('rv-six-door', 'the right one', '2001:db8:85a3:8d4::1')).status).toBe(303)
	}, 30_000)

	it('keeps nothing of a visitor but a few characters, for as long as their tries count', async () => {
		await pageWith('rv-kept', [link('rv-kept-1', 'rv-kept-door', 'https://example.com/kept')])
		await api('/links/rv-kept-1', { method: 'PATCH', json: { password: 'the right one' } })
		expect((await guess('rv-kept-door', 'wrong', '198.51.100.77')).status).toBe(401)
		const kept = await rows('rv-kept-1')
		// Four characters: sixty-five thousand addresses share each, so a row says one of that many was here.
		expect(kept.map((row) => row.key)).toEqual(['tries:rv-kept-1', expect.stringMatching(/^tries:rv-kept-1:[0-9a-f]{4}$/)])
		// Not the address, in any part of it, and nothing of the browser.
		const everything = JSON.stringify((await env.DB.prepare('SELECT key, value FROM _meta WHERE key LIKE ?1').bind('tries%').all()).results)
		for (const part of ['198.51.100.77', '198.51', '100.77', 'iPhone', 'Mozilla']) expect(everything).not.toContain(part)
		// The same visitor is other characters at another link, so the two can't be put together.
		await pageWith('rv-kept-b', [link('rv-kept-2', 'rv-kept-other', 'https://example.com/other')])
		await api('/links/rv-kept-2', { method: 'PATCH', json: { password: 'the right one' } })
		await guess('rv-kept-other', 'wrong', '198.51.100.77')
		expect((await rows('rv-kept-2'))[1]!.key.split(':')[2]).not.toBe(kept[1]!.key.split(':')[2])
		// The right password leaves nothing: a try given back that was a visitor's only one takes their row with it.
		expect((await guess('rv-kept-other', 'the right one', '203.0.113.200')).status).toBe(303)
		expect(await rows('rv-kept-2')).toHaveLength(2)
		// Once the quarter of an hour is over, the link's next try takes its visitors' old rows away,
		const later = Date.now() + PASSWORD_WINDOW + 1
		await takePasswordTry(env.DB, 'rv-kept-1', 'bbbb', later)
		expect((await rows('rv-kept-1')).map((row) => row.key)).toEqual(['tries:rv-kept-1', 'tries:rv-kept-1:bbbb'])
		// and a look at the site's state takes every link's, where nobody tries again.
		expect((await rows('rv-kept-2')).length).toBe(2)
		await forgetPastTries(env.DB, later + PASSWORD_WINDOW + 1).run()
		expect(await rows('rv-kept-1')).toEqual([])
		expect(await rows('rv-kept-2')).toEqual([])
	}, 30_000)

	it('costs a try the same however many others there are: none looks through the rows', async () => {
		await pageWith('rv-cost', [link('rv-cost-1', 'rv-cost-door', 'https://example.com/cost')])
		await api('/links/rv-cost-1', { method: 'PATCH', json: { password: 'the right one' } })
		// Three hundred at once, each from a network of its own. Fifty are looked at; the others are turned away,
		// given back, and leave no row.
		const together = await Promise.all(Array.from({ length: 300 }, (_, n) => guess('rv-cost-door', `guess ${n}`, `2001:db8:${n.toString(16)}::1`)))
		expect(together.filter((response) => response.status === 401)).toHaveLength(PASSWORD_TRIES_LINK)
		expect((await rows('rv-cost-1')).length).toBeLessThanOrEqual(PASSWORD_TRIES_LINK + 1)
		// And the one after reads no row but its own two.
		const read: number[] = []
		const DB = new Proxy(env.DB, {
			get(target, key) {
				if (key === 'batch') {
					return async (statements: D1PreparedStatement[]) => {
						const results = await target.batch(statements)
						read.push(...results.map((result) => (result.meta as { rows_read?: number }).rows_read ?? 0))
						return results
					}
				}
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		await takePasswordTry(DB, 'rv-cost-1', 'cccc')
		expect(read.reduce((sum, rows) => sum + rows, 0)).toBeLessThan(10)
	}, 60_000)

	it('starts everyone again with a new password, not only the link', async () => {
		await pageWith('rv-fresh', [link('rv-fresh-1', 'rv-fresh-door', 'https://example.com/fresh')])
		await api('/links/rv-fresh-1', { method: 'PATCH', json: { password: 'old' } })
		await Promise.all(Array.from({ length: PASSWORD_TRIES }, (_, n) => guess('rv-fresh-door', `guess ${n}`, '198.51.100.5')))
		expect((await rows('rv-fresh-1')).length).toBe(2)
		expect((await api('/links/rv-fresh-1', { method: 'PATCH', json: { password: 'new and longer' } })).status).toBe(200)
		expect(await rows('rv-fresh-1')).toEqual([])
		expect((await guess('rv-fresh-door', 'new and longer', '198.51.100.5')).status).toBe(303)
	}, 30_000)
})
