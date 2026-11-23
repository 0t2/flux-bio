import type { Hono } from 'hono'
import type {
	ClearStatsResponse,
	StateResponse,
	StatsExportResponse,
	StatsResponse,
	TopTargetJson,
	UpdateResponse,
	UsageResponse,
} from '../../../shared/api'
import { addDays, dayIn, lastDays } from '../../../shared/time'
import { D1_DAILY_LIMITS, D1_STORAGE, KV_DAILY_LIMITS } from '../../../shared/usage'
import { msg } from '../../../templates/msg'
import { ApiError, type AppEnv } from '../../types'
import { accountUse, clearInsightsCache, countsSince, forgetPastSalts, insights } from '../../lib/analytics'
import { firstPage, forgetPastTries, getPage, listOwnLinks, loadSettings } from '../../lib/db'
import { isTestSite } from '../../lib/mode'
import { sendOwed, settingsAndOwed } from '../../lib/ops'
import { StatsClearInput, StatsExportQuery } from '../../lib/schemas'
import { overview } from '../../lib/stats'
import { clearStats, DATABASE_LIMIT, databaseBytes, EXPORT_COLUMNS, exportStats, statsHistory, tidyStats } from '../../lib/statsHistory'
import { checkUpdate } from '../../lib/update'
import { VERSION } from '../../lib/version'
import { insightsJson, labelOf, pageSummaries, publicOrigin, rangeOf, readBody, requireOwner, siteList, targetLabel, type Label } from './helpers'

/** The free plan's limits, per account and per UTC day. */
const FREE_DAILY: NonNullable<UsageResponse['dailyLimits']> = {
	requests: 100_000,
	kv: KV_DAILY_LIMITS,
	d1: D1_DAILY_LIMITS,
	databases: { count: D1_STORAGE.databases, bytes: D1_STORAGE.account },
}

export function registerStatsRoutes(api: Hono<AppEnv>): void {
	api.get('/state', async (c) => {
		const db = c.env.DB
		const { settings, owed } = await settingsAndOwed(db)
		const body: StateResponse = {
			version: VERSION,
			origin: publicOrigin(c, settings),
			role: c.get('auth').role,
			settings,
			pages: await pageSummaries(db, settings),
			sites: siteList(c),
			analytics: Boolean((c.env as { ANALYTICS_SQL?: unknown }).ANALYTICS_SQL),
			testSite: isTestSite(c.env),
		}
		// Old numbers are merged, or deleted as asked, a slice per dashboard visit, after it has its answer.
		c.executionCtx.waitUntil(tidyStats(db, settings).catch((error: unknown) => console.error('Could not tidy old stats', error)))
		// And what is kept only for a while, where nothing has come along to write over it.
		c.executionCtx.waitUntil(
			db
				.batch([forgetPastSalts(db), forgetPastTries(db)])
				.catch((error: unknown) => console.error('Could not take out a past salt or count', error)),
		)
		// A settings change that D1 has and KV refused is sent again when the dashboard is next opened: nobody has to
		// know to save twice. Not the dropping of a large site's pages, which goes on with settings calls only.
		if (owed) c.executionCtx.waitUntil(sendOwed(c.env).catch((error: unknown) => console.error('Could not send what KV is owed', error)))
		return c.json(body)
	})

	// The owner's AI asks this, and the dashboard when the owner opens Settings; a visitor never does. It is the one route
	// that reads from GitHub by itself.
	api.get('/update', async (c) => c.json<UpdateResponse>(await checkUpdate()))

	api.get('/usage', async (c) => {
		const db = c.env.DB
		const now = Date.now()
		const since = `${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`
		const [settings, bytes] = await Promise.all([loadSettings(db), databaseBytes(db)])
		const quietly = <T>(read: Promise<T>) =>
			read.catch((error: unknown) => {
				console.error('Cloudflare analytics did not answer', error)
				return null
			})
		const [history, counted, account] = await Promise.all([statsHistory(db, settings, bytes, now), quietly(countsSince(c.env, since)), quietly(accountUse(c.env, since))])
		let today: UsageResponse['today']
		if (counted) today = { since, ...counted, from: 'analytics' }
		else {
			const { results } = await db
				.prepare("SELECT kind, SUM(count) AS n FROM stats WHERE day = ?1 AND dim = 'source' GROUP BY kind")
				.bind(dayIn(settings.timezone, now))
				.all<{ kind: string; n: number }>()
			const count = (kind: string) => results.find((row) => row.kind === kind)?.n ?? 0
			today = { since, views: count('view'), clicks: count('click'), from: 'stats' }
		}
		const body: UsageResponse = {
			plan: settings.plan,
			database: { bytes, limit: DATABASE_LIMIT[settings.plan] },
			today,
			estimate: { requests: today.views + today.clicks },
			account,
			dailyLimits: settings.plan === 'free' ? FREE_DAILY : null,
			stats: history,
		}
		return c.json(body)
	})

	api.get('/stats', async (c) => {
		const db = c.env.DB
		const days = rangeOf(c.req.query('days'))
		const asked = c.req.query('page')
		// A page is read with its links, not before them. The one that is asked for is read alongside the settings,
		// as the dashboard always asks; a request that names none, or one that is gone, gets the home page, else the first.
		const withLinks = (id: string) => Promise.all([getPage(db, id), listOwnLinks(db, id)])
		const [settings, named] = await Promise.all([loadSettings(db), asked ? withLinks(asked) : null])
		let [page, rows] = named ?? [null, []]
		if (!page && settings.home) [page, rows] = await withLinks(settings.home)
		if (!page) {
			page = await firstPage(db)
			rows = page ? await listOwnLinks(db, page.id) : []
		}
		const byId = new Map(rows.map((row) => [row.id, row]))
		// The counts in D1 and the detailed numbers don't wait for each other. One moment fixes the days for both.
		const now = Date.now()
		const range = lastDays(settings.timezone, days, now)
		const from = range[0]!
		const [data, details] = await Promise.all([
			overview(db, settings.timezone, days, page?.id ?? '', rows.map((row) => row.id), now),
			page ? insights(c.env, { page: page.id }, { from, to: range.at(-1)!, previousFrom: addDays(from, -days) }) : null,
		])
		const content = page ? (page.published ?? page.draft) : null
		const label = (target: string): Label => {
			if (page && target === page.id) return labelOf(msg('bio 頁'))
			// Only the label: an event has a kind of its own.
			const { label: text, labelKey, labelParams } = targetLabel(target, byId, content, page?.id)
			return { label: text, labelKey, labelParams }
		}
		const topLinks: TopTargetJson[] = data.clicksByTarget.slice(0, 20).map((entry) => ({ target: entry.target, count: entry.count, ...targetLabel(entry.target, byId, content, page?.id) }))
		const body: StatsResponse = {
			page: page ? { id: page.id, handle: page.handle } : null,
			timezone: settings.timezone,
			days: data.days,
			views: data.views,
			clicks: data.clicks,
			totals: data.totals,
			previous: data.previous,
			topLinks,
			clickSources: data.clickSources,
			viewSources: data.viewSources,
			insights: insightsJson(details, label),
		}
		return c.json(body)
	})

	api.get('/stats/export', async (c) => {
		const query = StatsExportQuery.safeParse(c.req.query())
		if (!query.success) throw new ApiError(400, 'invalid', msg('查詢參數不正確'))
		const body: StatsExportResponse = { columns: EXPORT_COLUMNS, ...(await exportStats(c.env.DB, query.data.cursor, query.data.before)) }
		return c.json(body)
	})

	api.post('/stats/clear', async (c) => {
		requireOwner(c.get('auth'), msg('清除點擊數據'))
		const { before } = await readBody(c, StatsClearInput)
		const db = c.env.DB
		const settings = await loadSettings(db)
		await clearStats(db, settings, before)
		clearInsightsCache(c.env)
		return c.json<ClearStatsResponse>({ stats: await statsHistory(db, settings, await databaseBytes(db)) })
	})
}
