import { isbot } from 'isbot'
import { addDays, dayIn, hourIn, lastDays } from '../../shared/time'
import type { UtmTags } from '../../shared/api'
import { writeEvent } from './analytics'
import { chunks, ensureSchema } from './db'

/**
 * Exact counts live in D1: one row per day × target × kind × source, so a week of numbers is a few hundred rows.
 * Whole months older than the dashboard reads become one row per month (statsHistory.ts). Each hit is also sent
 * to Analytics Engine as a raw event for the detailed views (see analytics.ts).
 *
 * Targets: a page view counts under the page's id, a short link click or a tap
 * on the link's button under the link's id, a click inside a block (a product, a video, the map
 * button) under "<item id>.<part>", a click on a social icon, on a page
 * that counts them, under "<social id>.social", and the floating LINE and Ko-fi buttons under "<page id>.line" and
 * "<page id>.kofi" (a Ko-fi card's button is "<item id>.kofi"). Those with a "." keep
 * their page in `page`, since only the page knows its blocks; a link's page is in `links`.
 */

export type HitKind = 'view' | 'click'

/** How many sources one target keeps per day; anyone can make up a ?s= or a referrer, so the rest count as "other". */
export const SOURCE_LIMIT = 50

// SQLite needs the "WHERE true" to read ON CONFLICT as the upsert clause.
const UPSERT = `INSERT INTO stats (day, target, kind, dim, value, count, page)
SELECT ?1, ?2, ?3, ?4, CASE
	WHEN EXISTS (SELECT 1 FROM stats WHERE day = ?1 AND target = ?2 AND kind = ?3 AND dim = ?4 AND value = ?5) THEN ?5
	WHEN (SELECT COUNT(*) FROM stats WHERE day = ?1 AND target = ?2 AND kind = ?3 AND dim = ?4) < ?6 THEN ?5
	ELSE 'other' END, 1, ?7
WHERE true
ON CONFLICT (day, target, kind, dim, value) DO UPDATE SET count = count + 1`

/** Skips crawlers, link-preview fetchers and browser prefetches. */
export function isCountable(request: Request): boolean {
	if (request.method !== 'GET' && request.method !== 'POST') return false
	const ua = request.headers.get('user-agent') ?? ''
	if (!ua || isbot(ua)) return false
	const purpose = ['sec-purpose', 'purpose', 'x-purpose', 'x-moz']
		.map((name) => request.headers.get(name) ?? '')
		.join(' ')
		.toLowerCase()
	return !/prefetch|prerender|preview/.test(purpose)
}

export interface Hit {
	kind: HitKind
	target: string
	source: string
	/** The site's time zone, or the read that gives it, so a redirect needn't wait for it. */
	timeZone: string | Promise<string>
	/** The page handle for views, the short link slug for clicks. */
	slug: string
	/** Where a click was sent; empty for page views. */
	url: string
	/** The page this view or click belongs to; "" for standalone short links. */
	page: string
	/** The short link's own UTM settings, recorded when the visit carried no tags. */
	utm?: UtmTags
}

/** Anything with waitUntil: the Worker's ExecutionContext, or Hono's view of it. */
export interface WaitUntil {
	waitUntil(promise: Promise<unknown>): void
}

export function recordHit(env: Env, ctx: WaitUntil, request: Request, hit: Hit): void {
	if (!isCountable(request)) {
		// Nothing to count, but a read already under way mustn't fail unnoticed.
		void Promise.resolve(hit.timeZone).catch(() => undefined)
		return
	}
	const db = env.DB
	const now = Date.now()
	const timeZone = Promise.resolve(hit.timeZone)
	// One D1 row write per hit keeps the exact daily counts within the free plan;
	// countries, devices and the rest come from Analytics Engine.
	ctx.waitUntil(
		Promise.all([timeZone, ensureSchema(db)])
			.then(([zone]) =>
				db
					.prepare(UPSERT)
					.bind(dayIn(zone, now), hit.target, hit.kind, 'source', hit.source, SOURCE_LIMIT, hit.target.includes('.') && hit.page ? hit.page : null)
					.run(),
			)
			.catch((error: unknown) => console.error('Could not count a hit', error)),
	)
	ctx.waitUntil(
		timeZone.then((zone) =>
			writeEvent(env, request, {
				kind: hit.kind,
				target: hit.target,
				source: hit.source,
				day: dayIn(zone, now),
				hour: hourIn(zone, now),
				slug: hit.slug,
				url: hit.url,
				page: hit.page,
				utm: hit.utm,
			}),
		).catch((error: unknown) => console.error('Could not write an analytics event', error)),
	)
}

export interface LinkStats {
	/** Clicks per day, oldest first. */
	series: number[]
	total: number
	sources: { source: string; count: number }[]
}

export function emptyLinkStats(days: number): LinkStats {
	return { series: Array.from({ length: days }, () => 0), total: 0, sources: [] }
}

/**
 * Clicks per target over the last `days` days. Given `targets`, only theirs, through the target index, so a screenful of
 * links reads as many rows as its own clicks; without, the whole period of every target.
 */
export async function linkStats(
	db: D1Database,
	timeZone: string,
	days = 7,
	targets?: readonly string[],
): Promise<{ days: string[]; byLink: Map<string, LinkStats> }> {
	const range = lastDays(timeZone, days)
	const index = new Map(range.map((day, i) => [day, i]))
	const columns = (from: string) => `SELECT target, day, value, SUM(count) AS n FROM ${from} WHERE kind = 'click' AND dim = 'source' AND day >= ?1`
	type Row = { target: string; day: string; value: string; n: number }
	let results: Row[] = []
	if (!targets) {
		// Through the days' range of the primary key, not every day in the target index.
		results = (await db.prepare(`${columns('stats NOT INDEXED')} GROUP BY target, day, value`).bind(range[0]).all<Row>()).results
	} else if (targets.length) {
		const parts = await db.batch<Row>(
			chunks([...new Set(targets)], 90).map((part) =>
				db.prepare(`${columns('stats INDEXED BY stats_target_day')} AND target IN (${part.map((_, i) => `?${i + 2}`).join(', ')}) GROUP BY target, day, value`).bind(range[0], ...part),
			),
		)
		results = parts.flatMap((part) => part.results)
	}

	const byLink = new Map<string, LinkStats>()
	const sources = new Map<string, Map<string, number>>()
	for (const row of results) {
		const i = index.get(row.day)
		if (i === undefined) continue
		let stats = byLink.get(row.target)
		let counts = sources.get(row.target)
		if (!stats || !counts) {
			stats = emptyLinkStats(days)
			counts = new Map()
			byLink.set(row.target, stats)
			sources.set(row.target, counts)
		}
		stats.series[i] = (stats.series[i] ?? 0) + row.n
		stats.total += row.n
		counts.set(row.value, (counts.get(row.value) ?? 0) + row.n)
	}
	for (const [target, stats] of byLink) {
		stats.sources = [...(sources.get(target) ?? [])].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)
	}
	return { days: range, byLink }
}

/**
 * Each page's clicks in the last 7 days. Clicks inside blocks carry their page; a link's page is looked up by id,
 * and only for links clicked in that time, so a site's size matters less than how many of its links people use.
 * Both happen in one statement, because the dashboard waits for this every time it opens: the clicks are added up
 * per target first, so each clicked link is looked up once, as it was when the Worker did the second half itself.
 */
export async function clicksByPage(db: D1Database, timeZone: string): Promise<Map<string, number>> {
	const since = lastDays(timeZone, 7)[0]
	const { results } = await db
		.prepare(
			// By the days' range of the primary key. Grouped by target first, SQLite would go through the whole target index, every day ever.
			`SELECT COALESCE(clicked.page, links.page_id) AS page, SUM(clicked.n) AS n
			FROM (
				SELECT page, target, SUM(count) AS n FROM stats NOT INDEXED
				WHERE kind = 'click' AND dim = 'source' AND day >= ?1 GROUP BY page, target
			) AS clicked
			LEFT JOIN links ON clicked.page IS NULL AND links.id = clicked.target AND links.kind = 'bio'
			WHERE COALESCE(clicked.page, links.page_id) IS NOT NULL
			GROUP BY 1`,
		)
		.bind(since)
		.all<{ page: string; n: number }>()
	return new Map(results.map((row) => [row.page, row.n]))
}

export interface Ranked {
	value: string
	count: number
}

export interface Overview {
	days: string[]
	views: number[]
	clicks: number[]
	totals: { views: number; clicks: number }
	previous: { views: number; clicks: number }
	/** Clicks per target over the range, most clicked first. */
	clicksByTarget: { target: string; count: number }[]
	/** Where clicks came from. */
	clickSources: Ranked[]
	/** Where page views came from. */
	viewSources: Ranked[]
}

/**
 * One page's numbers over the last `days` days, plus the period before for comparison: its views, the clicks inside it,
 * which carry the page, and the clicks on `links`, its bio links. All are read through an index, so this costs as many
 * rows as the page has numbers, however big the site. `at` is the moment the days are counted back from: a caller that
 * reads the detailed numbers at the same time gives both the same one.
 */
export async function overview(db: D1Database, timeZone: string, days: number, pageId: string, links: readonly string[], at = Date.now()): Promise<Overview> {
	const range = lastDays(timeZone, days, at)
	const index = new Map(range.map((day, i) => [day, i]))
	const since = range[0]!
	const previousSince = addDays(since, -days)
	const [views, ...clickParts] = await db.batch([
		db
			.prepare(
				`SELECT day, value, SUM(count) AS n FROM stats INDEXED BY stats_target_day WHERE target = ?1 AND kind = 'view' AND dim = 'source' AND day >= ?2
				GROUP BY day, value`,
			)
			.bind(pageId, previousSince),
		db
			.prepare(
				`SELECT day, target, value, SUM(count) AS n FROM stats INDEXED BY stats_page_day WHERE page = ?1 AND kind = 'click' AND dim = 'source' AND day >= ?2
				GROUP BY day, target, value`,
			)
			.bind(pageId, previousSince),
		...chunks([...new Set(links)], 90).map((part) =>
			db
				.prepare(
					`SELECT day, target, value, SUM(count) AS n FROM stats INDEXED BY stats_target_day WHERE kind = 'click' AND dim = 'source' AND day >= ?1
					AND target IN (${part.map((_, i) => `?${i + 2}`).join(', ')}) GROUP BY day, target, value`,
				)
				.bind(previousSince, ...part),
		),
	])

	const series = { views: range.map(() => 0), clicks: range.map(() => 0) }
	const previous = { views: 0, clicks: 0 }
	const viewSources = new Map<string, number>()
	const clickSources = new Map<string, number>()
	const byTarget = new Map<string, number>()
	const bump = (map: Map<string, number>, key: string, n: number) => map.set(key, (map.get(key) ?? 0) + n)

	for (const row of (views?.results ?? []) as { day: string; value: string; n: number }[]) {
		const i = index.get(row.day)
		if (i === undefined) {
			if (row.day < since) previous.views += row.n
			continue
		}
		series.views[i] = (series.views[i] ?? 0) + row.n
		bump(viewSources, row.value, row.n)
	}
	for (const row of clickParts.flatMap((part) => part.results) as { day: string; target: string; value: string; n: number }[]) {
		const i = index.get(row.day)
		if (i === undefined) {
			if (row.day < since) previous.clicks += row.n
			continue
		}
		series.clicks[i] = (series.clicks[i] ?? 0) + row.n
		bump(clickSources, row.value, row.n)
		bump(byTarget, row.target, row.n)
	}
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
	const ranked = (map: Map<string, number>, limit: number) =>
		[...map]
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([value, count]) => ({ value, count }))

	return {
		days: range,
		views: series.views,
		clicks: series.clicks,
		totals: { views: sum(series.views), clicks: sum(series.clicks) },
		previous,
		clicksByTarget: ranked(byTarget, 50).map(({ value, count }) => ({ target: value, count })),
		clickSources: ranked(clickSources, 10),
		viewSources: ranked(viewSources, 10),
	}
}

export interface TargetOverview {
	days: string[]
	clicks: number[]
	total: number
	previous: number
	sources: Ranked[]
}

/** One short link's clicks per day and by source. */
export async function targetOverview(db: D1Database, timeZone: string, days: number, target: string, at = Date.now()): Promise<TargetOverview> {
	const range = lastDays(timeZone, days, at)
	const index = new Map(range.map((day, i) => [day, i]))
	const since = range[0]!
	const { results } = await db
		.prepare(
			`SELECT day, value, SUM(count) AS n FROM stats INDEXED BY stats_target_day WHERE target = ?1 AND kind = 'click' AND dim = 'source' AND day >= ?2
			GROUP BY day, value`,
		)
		.bind(target, addDays(since, -days))
		.all<{ day: string; value: string; n: number }>()
	const clicks = range.map(() => 0)
	const sources = new Map<string, number>()
	let previous = 0
	for (const row of results) {
		const i = index.get(row.day)
		if (i === undefined) {
			if (row.day < since) previous += row.n
			continue
		}
		clicks[i] = (clicks[i] ?? 0) + row.n
		sources.set(row.value, (sources.get(row.value) ?? 0) + row.n)
	}
	return {
		days: range,
		clicks,
		total: clicks.reduce((a, b) => a + b, 0),
		previous,
		sources: [...sources].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })),
	}
}
