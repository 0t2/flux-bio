import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { emptyContent, emptyLink, newItem } from '../src/shared/content'
import warm from '../src/worker/index'
import { api, apiJson, call, IPHONE, ORIGIN, PASSWORD, visit } from './helpers'

// A request waits for D1 once for every query it sends after another has answered, and a trip to D1 can be
// a hundred milliseconds for someone far from the database. Queries sent together are one trip. So what matters
// is how many a request makes one after another before it answers, and these hold that number down.

type Worker = { fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> }

/**
 * How many trips to D1 a request made one after another before it answered. A trip is every query that was on
 * its way at the same time; one counts if any of its queries had answered by the time the response was ready,
 * which leaves out what a request only starts for later, such as counting the visit.
 */
async function trips(worker: Worker, path: string, init: RequestInit = {}): Promise<{ trips: number; status: number }> {
	let onTheWay = 0
	let trip = 0
	const answered = new Set<number>()
	const sent = async <T>(query: () => Promise<T>): Promise<T> => {
		if (onTheWay++ === 0) trip++
		const mine = trip
		try {
			return await query()
		} finally {
			onTheWay--
			answered.add(mine)
		}
	}
	const real = new WeakMap<object, D1PreparedStatement>()
	const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
		const proxy = new Proxy(statement, {
			get(target, name) {
				if (name === 'bind') return (...args: unknown[]) => wrap(target.bind(...args))
				if (name === 'all' || name === 'run' || name === 'first' || name === 'raw') {
					const method = Reflect.get(target, name) as (...args: unknown[]) => Promise<unknown>
					return (...args: unknown[]) => sent(() => method.apply(target, args))
				}
				const value = Reflect.get(target, name) as unknown
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		real.set(proxy, statement)
		return proxy
	}
	const DB = new Proxy(env.DB, {
		get(target, name) {
			if (name === 'prepare') return (sql: string) => wrap(target.prepare(sql))
			if (name === 'batch') return (statements: D1PreparedStatement[]) => sent(() => target.batch(statements.map((statement) => real.get(statement) ?? statement)))
			const value = Reflect.get(target, name) as unknown
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	const ctx = createExecutionContext()
	const response = await worker.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init }), { ...env, DB } as unknown as Env, ctx)
	const before = answered.size
	await response.text()
	await waitOnExecutionContext(ctx)
	return { trips: before, status: response.status }
}

/** The Worker as a new copy of it starts: nothing remembered, the schema not yet checked. */
async function newCopy(): Promise<Worker> {
	vi.resetModules()
	return (await import('../src/worker/index')).default
}

const owner = { authorization: `Bearer ${PASSWORD}` }
let pageId = ''
let linkId = ''
let cookie = ''

beforeAll(async () => {
	const content = emptyContent('Corner Shop')
	content.items = [{ ...newItem('hours'), id: 'trip-hours', address: '1 Main St' }, { ...emptyLink(), id: 'trip-link', title: 'Menu', url: 'https://example.com/menu', slug: 'trip-menu' }]
	const { page } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle: 'trip-shop', name: 'Corner Shop' } })
	await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: content })
	expect((await api(`/pages/${page.id}/publish`, { method: 'POST' })).ok).toBe(true)
	pageId = page.id
	linkId = 'trip-link'
	// Visited once, so KV has what visitors read and something is counted.
	expect((await visit('/trip-shop')).status).toBe(200)
	expect((await visit('/trip-menu')).status).toBe(302)
	const login = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) })
	cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
	expect(cookie).toContain('=')
})

describe('a new copy of the Worker', () => {
	it('draws a page with opening hours after one trip to D1: the time zone, asked for alongside the schema check', async () => {
		const visited = await trips(await newCopy(), '/trip-shop', { headers: { 'user-agent': IPHONE } })
		expect(visited.status).toBe(200)
		expect(visited.trips).toBeLessThanOrEqual(1)
	})

	it('sends a short link on its way without waiting for D1 at all', async () => {
		const visited = await trips(await newCopy(), '/trip-menu', { headers: { 'user-agent': IPHONE } })
		expect(visited.status).toBe(302)
		expect(visited.trips).toBe(0)
	})

	it('answers the dashboard’s first request in three: the schema check with the secret, the settings, the pages with their clicks', async () => {
		const first = await trips(await newCopy(), '/api/state', { headers: { cookie } })
		expect(first.status).toBe(200)
		expect(first.trips).toBeLessThanOrEqual(3)
	})

	it('looks an API token up on the second trip', async () => {
		const { token } = await apiJson<{ token: string }>('/tokens', { method: 'POST', json: { name: 'trips', scope: 'full' } })
		const asked = await trips(await newCopy(), '/api/auth/me', { headers: { authorization: `Bearer ${token}` } })
		expect(asked.status).toBe(200)
		expect(asked.trips).toBeLessThanOrEqual(2)
	})
})

describe('the dashboard, once the Worker is running', () => {
	it.each([
		['its pages', () => '/api/state', 2],
		['a page’s numbers', () => `/api/stats?page=${pageId}&days=30`, 2],
		['numbers with no page named, which is the home page’s', () => '/api/stats?days=30', 3],
		['a short link’s numbers', () => `/api/links/${linkId}/stats?days=30`, 2],
		// Two, and a third for today’s counts from D1 where Analytics Engine can’t give them, as here.
		['how much of the plan is used', () => '/api/usage', 3],
		['a page', () => `/api/pages/${pageId}`, 1],
		['the short links', () => '/api/links', 2],
	])('reads %s without waiting for D1 more often than it has to', async (_, path, most) => {
		const asked = await trips(warm, path(), { headers: owner })
		expect(asked.status).toBe(200)
		expect(asked.trips).toBeLessThanOrEqual(most)
		expect(asked.trips).toBeGreaterThan(0)
	})

	it('gives each page the clicks on its links and inside its blocks, from one statement', async () => {
		const clicks = async () => (await apiJson<{ pages: { id: string; clicks7d: number }[] }>('/state')).pages.find((page) => page.id === pageId)?.clicks7d ?? 0
		const before = await clicks()
		// A tap inside a block carries its page; a click on a link is found through the link.
		expect((await visit('/_c/trip-shop/trip-hours/map', IPHONE, { method: 'POST' })).status).toBe(204)
		expect(await clicks()).toBe(before + 1)
		expect((await visit('/trip-menu')).status).toBe(302)
		expect(await clicks()).toBe(before + 2)
		// A standalone short link belongs to no page, and adds to none.
		await apiJson('/links', { method: 'POST', json: { url: 'https://example.com/solo', slug: 'trip-solo' } })
		expect((await visit('/trip-solo')).status).toBe(302)
		expect(await clicks()).toBe(before + 2)
		const { stats } = await apiJson<{ stats: { clearing: string | null; oldestMonth: string | null } }>('/usage')
		expect(stats.clearing).toBeNull()
		expect(stats.oldestMonth).toMatch(/^\d{4}-\d{2}$/)
	})
})
