import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateTokenResponse, PageJson, StateResponse, StatsExportResponse, StatsResponse, UsageResponse } from '../src/shared/api'
import { emptyContent, emptyLink, newItem, type PageContent } from '../src/shared/content'
import { addMonths, dayIn } from '../src/shared/time'
import { DAILY_MONTHS } from '../src/worker/lib/statsHistory'
import app from '../src/worker/index'
import { api, apiJson, ORIGIN, PASSWORD, visit } from './helpers'

// Clicks inside blocks keep their page; old days become months; the owner can download and clear old numbers.

let pageId = ''
const TZ = 'UTC'
const thisMonth = () => dayIn(TZ).slice(0, 7)

function content(withVideo: boolean): PageContent {
	const page = emptyContent('History')
	page.items = [{ ...emptyLink(), id: 'hist-link', title: 'Shop', url: 'https://example.com/shop', slug: 'hist-shop' }]
	if (withVideo) page.items.push({ ...newItem('video'), id: 'hist-video', title: 'Watch', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
	return page
}

async function publish(page: PageContent): Promise<void> {
	await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: page })
	await apiJson(`/pages/${pageId}/publish`, { method: 'POST' })
}

const insert = env.DB.prepare("INSERT INTO stats (day, target, kind, dim, value, count) VALUES (?1, ?2, 'click', 'source', ?3, ?4)")
const rowsOn = async (day: string) => (await env.DB.prepare('SELECT target, value, count FROM stats WHERE day = ?1 ORDER BY target, value').bind(day).all()).results

beforeAll(async () => {
	pageId = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'history', name: 'History' } })).page.id
	await apiJson('/settings', { method: 'PUT', json: { ...(await apiJson<StateResponse>('/state')).settings, timezone: TZ } })
	await publish(content(true))
})

describe('clicks inside blocks', () => {
	it('stay with their page after the block is deleted', async () => {
		expect((await visit('/_c/history/hist-video/play')).status).toBe(302)
		const row = await env.DB.prepare("SELECT page FROM stats WHERE target = 'hist-video.play'").first<{ page: string }>()
		expect(row?.page).toBe(pageId)
		// A link's tap needs no page of its own: the link knows it.
		expect((await visit('/_c/history/hist-link/link', undefined, { method: 'POST' })).status).toBe(204)
		expect((await env.DB.prepare("SELECT page FROM stats WHERE target = 'hist-link'").first<{ page: string | null }>())?.page).toBeNull()

		await publish(content(false))
		const stats = await apiJson<StatsResponse>(`/stats?page=${pageId}&days=7`)
		expect(stats.totals.clicks).toBe(2)
		expect(stats.topLinks.map((entry) => entry.target).sort()).toEqual(['hist-link', 'hist-video.play'])
		const { pages } = await apiJson<StateResponse>('/state')
		expect(pages.find((page) => page.id === pageId)?.clicks7d).toBe(2)
	})
})

describe('old numbers', () => {
	const oldMonth = () => addMonths(thisMonth(), -(DAILY_MONTHS + 2))

	it('become one row per month once a whole month is past the window, a slice per dashboard visit', async () => {
		const month = oldMonth()
		const days = [`${month}-01`, `${month}-02`, `${month}-17`]
		await env.DB.batch(days.flatMap((day, i) => [insert.bind(day, 'hist-link', 'ig', i + 1), insert.bind(day, 'hist-link', 'line', 10)]))
		// The month just inside the window stays as it is.
		const kept = `${addMonths(thisMonth(), -DAILY_MONTHS)}-05`
		await env.DB.batch([insert.bind(kept, 'hist-link', 'ig', 4)])
		// Over a visit's slice, so the rest waits for the next visit.
		const many = Array.from({ length: 2_100 }, (_, i) => insert.bind(`${month}-20`, `bulk-${String(i).padStart(4, '0')}`, 'direct', 1))
		for (let at = 0; at < many.length; at += 500) await env.DB.batch(many.slice(at, at + 500))
		// As if these had been there all along: new numbers are only ever today's, so the visits before this have
		// already noted that nothing older was left.
		await env.DB.prepare("DELETE FROM _meta WHERE key = 'stats_history'").run()

		await api('/state')
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM stats WHERE day >= ?1 AND day < ?2').bind(`${month}-01`, `${addMonths(month, 1)}-01`).first('n')).toBeGreaterThan(0)
		expect((await apiJson<UsageResponse>('/usage')).stats.merging).toBe(true)
		await api('/state')
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM stats WHERE day >= ?1 AND day < ?2').bind(`${month}-01`, `${addMonths(month, 1)}-01`).first('n')).toBe(0)
		expect(await rowsOn(month)).toEqual(
			expect.arrayContaining([
				{ target: 'hist-link', value: 'ig', count: 6 },
				{ target: 'hist-link', value: 'line', count: 30 },
			]),
		)
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM stats WHERE day = ?1').bind(month).first('n')).toBe(2 + 2_100)
		expect(await rowsOn(kept)).toEqual([{ target: 'hist-link', value: 'ig', count: 4 }])
	})

	it('say which month is merged next', async () => {
		const usage = await apiJson<UsageResponse>('/usage')
		expect(usage.stats.dailyMonths).toBe(DAILY_MONTHS)
		const next = addMonths(thisMonth(), -DAILY_MONTHS)
		expect(usage.stats.nextMerge).toEqual({ month: next, on: `${addMonths(thisMonth(), 1)}-01` })
		expect(usage.stats.merging).toBe(false)
		expect(usage.stats.oldestMonth).toBe(oldMonth())
	})

	it('can be downloaded, oldest first, a thousand at a time, months included', async () => {
		const rows: StatsExportResponse['rows'] = []
		let cursor: string | null = null
		let pages = 0
		do {
			const page: StatsExportResponse = await apiJson<StatsExportResponse>(`/stats/export${cursor ? `?cursor=${cursor}` : ''}`)
			rows.push(...page.rows)
			cursor = page.nextCursor
			pages++
		} while (cursor)
		expect(pages).toBeGreaterThan(2)
		expect(rows[0]?.[0]).toBe(oldMonth())
		const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM stats').first<number>('n')) ?? 0
		expect(rows.length).toBe(total)
		const link = rows.find((row) => row[2] === 'hist-link' && row[0] === oldMonth() && row[6] === 'ig')
		expect(link).toEqual([oldMonth(), 'click', 'hist-link', 'history', 'hist-shop', 'Shop', 'ig', 6])
		const video = rows.find((row) => row[2] === 'hist-video.play')
		expect(video?.[3]).toBe('history')
		const before = await apiJson<StatsExportResponse>(`/stats/export?before=${addMonths(oldMonth(), 1)}`)
		expect(before.rows.every((row) => row[0] < addMonths(oldMonth(), 1))).toBe(true)
	})

	it('are deleted only by the owner, only past what the stats pages show', async () => {
		const { token } = await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'Clear', scope: 'full' } })
		expect((await api('/stats/clear', { method: 'POST', json: { before: oldMonth() }, bearer: token })).status).toBe(403)
		expect((await api('/stats/clear', { method: 'POST', json: { before: thisMonth() } })).status).toBe(400)

		const before = addMonths(oldMonth(), 1)
		const { stats } = await apiJson<{ stats: UsageResponse['stats'] }>('/stats/clear', { method: 'POST', json: { before } })
		expect(stats.clearing).toBe(before)
		for (let visit = 0; visit < 3; visit++) await api('/state')
		expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM stats WHERE day < ?1').bind(before).first('n')).toBe(0)
		expect(await rowsOn(`${addMonths(thisMonth(), -DAILY_MONTHS)}-05`)).toHaveLength(1)
		expect((await apiJson<UsageResponse>('/usage')).stats.clearing).toBeNull()
	})
})

describe('usage', () => {
	it("says how big the database is and what today's visits cost", async () => {
		await visit('/history')
		const usage = await apiJson<UsageResponse>('/usage')
		expect(usage.plan).toBe('free')
		expect(usage.database.bytes).toBeGreaterThan(0)
		expect(usage.database.limit).toBe(500 * 1024 ** 2)
		expect(usage.today.from).toBe('stats')
		expect(usage.today.views).toBeGreaterThan(0)
		expect(usage.estimate.requests).toBe(usage.today.views + usage.today.clicks)
		// No Cloudflare analytics in tests, as in local development.
		expect(usage.account).toBeNull()
		expect(usage.dailyLimits).toEqual({
			requests: 100_000,
			kv: { read: 100_000, write: 1_000, delete: 1_000, list: 1_000 },
			d1: { rowsRead: 5_000_000, rowsWritten: 100_000 },
			databases: { count: 10, bytes: 5 * 1024 ** 3 },
		})
		const { settings } = await apiJson<StateResponse>('/state')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, plan: 'paid' } })
		const paid = await apiJson<UsageResponse>('/usage')
		expect(paid.dailyLimits).toBeNull()
		expect(paid.database.limit).toBe(10 * 1024 ** 3)
		await apiJson('/settings', { method: 'PUT', json: { ...settings, plan: 'free' } })
	})
})

describe("the account's use", () => {
	it("is read from Cloudflare's analytics through the SQL binding, with no token, and without one is left out", async () => {
		const asked: string[] = []
		const ANALYTICS_SQL = {
			async query({ query }: { query: string }) {
				asked.push(query)
				if (query.includes('events.kvRequests')) return { data: [{ actionType: 'read', ops: '41000' }, { actionType: 'write', ops: 812 }] }
				if (query.includes('events.d1BackendRequest')) return { data: [{ readRows: '1200000', writtenRows: '64000' }] }
				if (query.includes('states.d1Storage')) return { data: [{ databaseId: 'a', bytes: 3_000_000 }, { databaseId: 'b', bytes: '1000000' }] }
				return { data: [] }
			},
		}
		const ctx = createExecutionContext()
		const response = await app.fetch(new Request(`${ORIGIN}/api/usage`, { headers: { authorization: `Bearer ${PASSWORD}` } }), { ...env, ANALYTICS_SQL }, ctx)
		await waitOnExecutionContext(ctx)
		const usage = (await response.json()) as UsageResponse
		expect(usage.account).toEqual({
			kv: { read: 41_000, write: 812, delete: 0, list: 0 },
			d1: { rowsRead: 1_200_000, rowsWritten: 64_000 },
			databases: { count: 2, bytes: 4_000_000 },
		})
		// Every query bounds its time itself, and none names an account: the binding is scoped to this one.
		expect(asked.filter((query) => /events\.(kvRequests|d1BackendRequest)|states\.d1Storage/.test(query)).every((query) => query.includes('timestamp >='))).toBe(true)
		expect(asked.some((query) => /accountTag/i.test(query))).toBe(false)
	})
})
