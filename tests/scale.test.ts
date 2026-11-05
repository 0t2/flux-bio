import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { emptyContent, emptyLink } from '../src/shared/content'
import { dayIn, addDays } from '../src/shared/time'
import { ensureSchema } from '../src/worker/lib/db'
import { KV_OPS_AT_ONCE } from '../src/worker/lib/mode'
import app from '../src/worker/index'
import { IPHONE, ORIGIN, PASSWORD } from './helpers'

const PAGES = 300
const LINKS = 6000

type Cost = { queries: number; rowsRead: number; rowsWritten: number; kv: number; ms: number; status: number }

/** D1 and KV wrapped so a request reports what the free plan would count: rows read, queries, KV operations. */
async function measure(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Cost & { body: string }> {
	const cost: Cost = { queries: 0, rowsRead: 0, rowsWritten: 0, kv: 0, ms: 0, status: 0 }
	const real = new WeakMap<object, D1PreparedStatement>()
	const note = (meta?: { rows_read?: number; rows_written?: number }) => {
		cost.rowsRead += meta?.rows_read ?? 0
		cost.rowsWritten += meta?.rows_written ?? 0
	}
	const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
		const proxy = new Proxy(statement, {
			get(target, name) {
				if (name === 'bind') return (...args: unknown[]) => wrap(target.bind(...args))
				if (name === 'all' || name === 'run') return async () => { cost.queries++; const out = await target.all(); note(out.meta); return out }
				if (name === 'first') return async (column?: string) => {
					cost.queries++
					const out = await target.all<Record<string, unknown>>()
					note(out.meta)
					const row = out.results[0] ?? null
					return column && row ? row[column] : row
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
			if (name === 'batch') return async (statements: D1PreparedStatement[]) => {
				cost.queries++
				const out = await target.batch(statements.map((s) => real.get(s) ?? s))
				for (const result of out) note(result.meta)
				return out
			}
			const value = Reflect.get(target, name) as unknown
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	const KV = new Proxy(env.KV, {
		get(target, name) {
			const value = Reflect.get(target, name) as unknown
			if (typeof value !== 'function') return value
			return (...args: unknown[]) => { cost.kv++; return value.apply(target, args) as unknown }
		},
	})
	const { json, ...rest } = init
	const headers = new Headers(rest.headers)
	headers.set('user-agent', IPHONE)
	if (path.startsWith('/api/')) headers.set('authorization', `Bearer ${PASSWORD}`)
	if (json !== undefined) headers.set('content-type', 'application/json')
	const ctx = createExecutionContext()
	const request = new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...rest, headers, body: json === undefined ? rest.body : JSON.stringify(json) })
	const started = Date.now()
	const response = await app.fetch(request, { ...env, DB, KV } as unknown as Env, ctx)
	const body = await response.text()
	await waitOnExecutionContext(ctx)
	cost.ms = Date.now() - started
	cost.status = response.status
	return { ...cost, body }
}

const callJson = (path: string) => measure(path).then((cost) => new Response(cost.body))

const pageContent = (i: number) => {
	const content = emptyContent(`Shop ${i}`)
	content.items = Array.from({ length: 8 }, (_, n) => ({ ...emptyLink(), id: `item-${i}-${n}`, title: `Link ${n}`, url: `https://example.com/${i}/${n}`, slug: `p${i}-l${n}` }))
	return content
}

async function seed(): Promise<void> {
	await ensureSchema(env.DB)
	const now = Date.now()
	const insertPage = env.DB.prepare('INSERT INTO pages (id, handle, position, draft, published, draft_updated_at, published_at, created_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?5, ?5)')
	const pages = Array.from({ length: PAGES }, (_, i) => insertPage.bind(`page-${i}`, `shop-${i}`, i, JSON.stringify(pageContent(i)), now))
	await env.DB.batch(pages)
	const insertLink = env.DB.prepare("INSERT INTO links (id, slug, url, title, kind, page_id, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, ?7)")
	const insertStat = env.DB.prepare("INSERT INTO stats (day, target, kind, dim, value, count) VALUES (?1, ?2, 'click', 'source', 'ig', 3)")
	const today = dayIn('Asia/Taipei', now)
	const links: D1PreparedStatement[] = []
	const stats: D1PreparedStatement[] = []
	for (let i = 0; i < LINKS; i++) {
		const page = i < PAGES * 8 ? Math.floor(i / 8) : null
		const id = page === null ? `solo-${i}` : `item-${page}-${i % 8}`
		const slug = page === null ? `solo-${i}` : `p${page}-l${i % 8}`
		links.push(insertLink.bind(id, slug, `https://example.com/${i}`, `Link ${i}`, page === null ? 'solo' : 'bio', page === null ? null : `page-${page}`, now - i))
		for (let d = 0; d < 7; d++) stats.push(insertStat.bind(addDays(today, -d), id))
	}
	for (let at = 0; at < links.length; at += 2000) await env.DB.batch(links.slice(at, at + 2000))
	for (let at = 0; at < stats.length; at += 2000) await env.DB.batch(stats.slice(at, at + 2000))
	await env.DB.prepare("INSERT INTO _meta (key, value) VALUES ('settings', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
		.bind(JSON.stringify({ home: 'page-0', timezone: 'Asia/Taipei', locale: 'en', languages: [], domain: '' }))
		.run()
}

describe(`a site with ${PAGES} pages and ${LINKS} short links`, () => {
	beforeAll(seed, 120_000)

	// Every link here was clicked on each of the last 7 days, as bad as it gets for a whole-site total.
	it.each([
		['the dashboard loading', '/api/state', 80_000, 12],
		['the list of pages', '/api/pages', 80_000, 12],
		['a screenful of short links', '/api/links?limit=100', 2_000, 6],
		['a page of stats', '/api/stats?page=page-1&days=30', 200, 6],
		['the sitemap', '/sitemap.xml', 1_000, 4],
	])('%s stays within the free plan', async (_, path, rows, queries) => {
		const cost = await measure(path)
		expect(cost.status).toBe(200)
		expect(cost.rowsRead).toBeLessThan(rows)
		expect(cost.queries).toBeLessThanOrEqual(queries)
	})

	it('naming something looks up that name, not every other name', async () => {
		const link = await measure('/api/links', { method: 'POST', json: { url: 'https://example.com/new', slug: 'brand-new' } })
		expect(link.status).toBe(201)
		expect(link.rowsRead).toBeLessThan(50)
		const page = await measure('/api/pages', { method: 'POST', json: { handle: 'new-shop', name: 'New' } })
		expect(page.status).toBe(201)
		expect(page.rowsRead).toBeLessThan(50)
		const taken = await measure('/api/links', { method: 'POST', json: { url: 'https://example.com/x', slug: 'SHOP-1' } })
		expect(taken.status).toBe(409)
		const rename = await measure('/api/links/solo-3000', { method: 'PATCH', json: { slug: 'renamed' } })
		expect(rename.status).toBe(200)
		expect(rename.rowsRead).toBeLessThan(50)
	})

	it('publishing reads about one page, whatever the site holds', async () => {
		const cost = await measure('/api/pages/page-1/publish', { method: 'POST' })
		expect(cost.status).toBe(200)
		expect(cost.rowsRead).toBeLessThan(200)
		expect(cost.queries).toBeLessThanOrEqual(10)
	})

	it('a publish still refuses a name another page or link holds', async () => {
		const page = (await (await callJson('/api/pages/page-2')).json()) as { page: { draft: { items: { slug: string }[] }; draftUpdatedAt: number } }
		page.page.draft.items[0]!.slug = 'solo-4000'
		await measure('/api/pages/page-2/draft', { method: 'PUT', json: page.page.draft, headers: { 'if-match': String(page.page.draftUpdatedAt) } })
		const cost = await measure('/api/pages/page-2/publish', { method: 'POST' })
		expect(cost.status).toBe(409)
		expect(cost.body).toContain('solo-4000')
	})

	it('a made-up address reads the names at most once', async () => {
		const first = await measure('/shop-1x')
		expect(first.status).toBe(404)
		expect(first.body).toContain('shop-1')
		const again = await measure('/shop-2x')
		expect(again.rowsRead).toBeLessThan(first.rowsRead)
		expect(again.rowsRead).toBeLessThan(20)
	})

	it('a redirect costs one KV read once its copy exists', async () => {
		await measure('/solo-4001')
		const cost = await measure('/solo-4001')
		expect(cost.status).toBe(302)
		expect(cost.kv).toBe(1)
	})

	it('changing the home page touches two pages, not all of them', async () => {
		const cost = await measure('/api/settings', { method: 'PUT', json: { home: 'page-2' } })
		expect(cost.status).toBe(200)
		expect(cost.rowsRead).toBeLessThan(100)
		expect(cost.queries).toBeLessThanOrEqual(12)
		expect(cost.kv).toBeLessThanOrEqual(4)
	})

	it('changing the time zone stays within what one request may do, and says when copies are left', async () => {
		const cost = await measure('/api/settings', { method: 'PUT', json: { timezone: 'Asia/Tokyo' } })
		expect(cost.status).toBe(200)
		expect(cost.queries).toBeLessThanOrEqual(12)
		expect(cost.kv).toBeLessThanOrEqual(KV_OPS_AT_ONCE + 5)
		expect(cost.rowsRead).toBeLessThan(2_000)
		expect((JSON.parse(cost.body) as { copiesLeft?: boolean }).copiesLeft).toBe(true)
	})

	it('pages through every short link once, live ones first', async () => {
		const seen = new Set<string>()
		let cursor: string | null = null
		let requests = 0
		do {
			const response = await measure(`/api/links?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
			const body = JSON.parse(response.body) as { links: { id: string }[]; nextCursor: string | null }
			for (const link of body.links) seen.add(link.id)
			cursor = body.nextCursor
			requests++
		} while (cursor)
		expect(requests).toBe(Math.ceil(seen.size / 1000))
		expect(seen.size).toBeGreaterThan(LINKS)
	})

	it('searches and filters on the Worker', async () => {
		const found = JSON.parse((await measure('/api/links?q=SOLO-59&limit=5')).body) as { links: { slug: string }[]; nextCursor: string | null }
		expect(found.links).toHaveLength(5)
		expect(found.links.every((link) => link.slug.includes('solo-59'))).toBe(true)
		expect(found.nextCursor).not.toBeNull()
		const pattern = JSON.parse((await measure('/api/links?q=%25')).body) as { links: unknown[] }
		expect(pattern.links).toHaveLength(0)
		const solo = JSON.parse((await measure('/api/links?kind=solo&limit=3')).body) as { links: { kind: string }[] }
		expect(solo.links.map((link) => link.kind)).toEqual(['solo', 'solo', 'solo'])
		expect((await measure('/api/links?limit=0')).status).toBe(400)
	})

	it('lists the clicked links for a whole-site total', async () => {
		const cost = await measure('/api/links/clicked')
		const body = JSON.parse(cost.body) as { links: { stats: { total: number } }[]; nextCursor: null }
		expect(cost.status).toBe(200)
		expect(body.links.length).toBeGreaterThan(1000)
		expect(body.links[0]!.stats.total).toBeGreaterThan(0)
	})

	it('holds more than the old limits of 50 pages and 5,000 short links', async () => {
		const state = JSON.parse((await measure('/api/state')).body) as { pages: { id: string; clicks7d: number; links: number; dirty: boolean }[]; limits?: unknown }
		expect(state.pages.length).toBeGreaterThan(50)
		expect(state.limits).toBeUndefined()
		const page = state.pages.find((entry) => entry.id === 'page-7')!
		expect(page.links).toBe(8)
		expect(page.dirty).toBe(false)
		expect(page.clicks7d).toBe(8 * 7 * 3)
	})

	// Last: the import replaces what the tests above rely on.
	it('a backup of all of it comes back, and spends KV only on pages and on links that changed', async () => {
		const backup = await measure('/api/export')
		expect(backup.status).toBe(200)
		const parsed = JSON.parse(backup.body) as { pages: unknown[]; shortLinks: unknown[] }
		expect(parsed.pages.length).toBeGreaterThan(50)
		expect(parsed.shortLinks.length).toBeGreaterThan(5000)
		// Its copies are from the time zone test above, so only the links read since then have one to drop.
		const restored = await measure('/api/import', { method: 'POST', json: parsed })
		expect(restored.status).toBe(200)
		expect(restored.kv).toBeLessThan(KV_OPS_AT_ONCE)
		expect(JSON.parse(restored.body)).toMatchObject({ pages: parsed.pages.length, shortLinks: parsed.shortLinks.length })
		expect((await measure('/solo-4100')).status).toBe(302)
	}, 180_000)
})
