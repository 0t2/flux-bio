import type { UtmTags } from '../../shared/api'
import { detectBrowser, detectDevice, detectOs } from '../../shared/source'
import { sha256Hex } from './auth'
import { adminPassword } from './mode'

/**
 * Raw visit and click events go to Workers Analytics Engine: writes are free,
 * unlimited for our purposes and add no latency. D1 keeps the exact daily
 * counts that must last forever (see stats.ts); AE answers the detailed
 * questions (unique visitors, places, devices, languages, campaigns, click
 * times, recent activity) for the last 90 days, which is how long AE keeps data.
 *
 * Reads use the Analytics SQL binding, so no API token is needed.
 */

/**
 * Positions of the blobs in each data point. Append new fields; never reorder.
 * AE allows 20 blobs, so this list is full: new fields go into doubles.
 *
 * Nothing here identifies a person: no IP address, no user-agent string and no
 * precise coordinates (see EVENT_NUMBERS). `visitor` is a one-way hash that
 * changes every day.
 */
export const EVENT_FIELDS = [
	'kind',
	'target',
	'source',
	'country',
	'device',
	'browser',
	'os',
	'referrer',
	'visitor',
	// Added in v0.1.2
	'region',
	'city',
	// utm_content since v0.3 (layout 1). Before that this slot held the visitor's time zone,
	// which nothing read; those rows have layout 0 and their content counts as empty.
	'utmContent',
	'language',
	// The visitor's network (Cloudflare's asOrganization, e.g. "Chunghwa Telecom") since v0.3.
	// Before that this slot held the Cloudflare data center, which nothing read; those rows
	// have asn 0 and network queries leave them out.
	'network',
	'slug',
	'url',
	'utmSource',
	'utmMedium',
	'utmCampaign',
	// Added in v0.2: the page a view or click belongs to; "" for standalone short links.
	'page',
] as const
type EventField = (typeof EVENT_FIELDS)[number]
const column = (field: EventField) => `blob${EVENT_FIELDS.indexOf(field) + 1}`

/**
 * Numbers in each data point. Append new fields; never reorder.
 * - v0.2: the day (yyyymmdd) and hour in the site's time zone.
 * - v0.3: where Cloudflare places the visitor's IP, rounded to 0.1° (about 11 km,
 *   so a town, not a street), and the network's AS number. 0 when unknown;
 *   rows written before v0.3 read as 0 too.
 * - v0.3: `layout`, which version of EVENT_FIELDS wrote the row: 1 once utmContent
 *   took the time zone's slot, 0 (missing) before.
 */
export const EVENT_NUMBERS = ['day', 'hour', 'latitude', 'longitude', 'asn', 'layout'] as const
const LAYOUT = 1
type EventNumber = (typeof EVENT_NUMBERS)[number]
const numberColumn = (field: EventNumber) => `double${EVENT_NUMBERS.indexOf(field) + 1}`

export interface EventInput {
	kind: 'view' | 'click'
	target: string
	source: string
	/** "YYYY-MM-DD" in the site's time zone. */
	day: string
	/** 0–23 in the site's time zone. */
	hour: number
	/** The page handle for views, the short link slug for clicks. */
	slug: string
	/** Where a click was sent; empty for page views. */
	url: string
	page: string
	/** Campaign tags for a click when the visit itself carried none, e.g. the short link's own UTM settings. */
	utm?: UtmTags
}

/**
 * The visitor id is a hash of the day, IP and browser, salted with the admin
 * password. It changes every day and can't be turned back into an IP.
 */
async function visitorId(secret: string, day: string, request: Request): Promise<string> {
	const ip = request.headers.get('cf-connecting-ip') ?? ''
	const ua = request.headers.get('user-agent') ?? ''
	return (await sha256Hex(`${secret}|${day}|${ip}|${ua}`)).slice(0, 16)
}

function referrerHost(request: Request): string {
	const referrer = request.headers.get('referer')
	if (!referrer) return ''
	try {
		const host = new URL(referrer).hostname
		return host === new URL(request.url).hostname ? '' : host.replace(/^www\./, '')
	} catch {
		return ''
	}
}

/** A string field from Cloudflare's request metadata (country, city…). */
function cf(request: Request, key: string): string {
	const value = (request.cf as Record<string, unknown> | undefined)?.[key]
	return typeof value === 'string' ? value : ''
}

/**
 * Cloudflare's estimate of where the IP is, rounded to 0.1°. It is a city's
 * position, not the visitor's: storing it to 4 decimals would only look precise.
 */
function coordinate(request: Request, key: 'latitude' | 'longitude', limit: number): number {
	const value = Number.parseFloat(cf(request, key))
	if (!Number.isFinite(value) || Math.abs(value) > limit) return 0
	return Math.round(value * 10) / 10
}

function asn(request: Request): number {
	const value = (request.cf as { asn?: unknown } | undefined)?.asn
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

/** The visitor's first preferred language, e.g. "zh-TW". */
function language(request: Request): string {
	const first = (request.headers.get('accept-language') ?? '').split(',')[0]?.split(';')[0]?.trim() ?? ''
	if (!first || first === '*') return ''
	try {
		return Intl.getCanonicalLocales(first)[0] ?? ''
	} catch {
		return ''
	}
}

/** The campaign tags a visit can carry, in the order of UtmTags. */
export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const

export async function eventBlobs(env: Env, request: Request, input: EventInput): Promise<string[]> {
	const ua = request.headers.get('user-agent') ?? ''
	const query = new URL(request.url).searchParams
	const tagged = UTM_PARAMS.some((key) => query.get(key))
	const utm: Partial<UtmTags> = tagged
		? { source: query.get('utm_source'), medium: query.get('utm_medium'), campaign: query.get('utm_campaign'), content: query.get('utm_content') }
		: (input.utm ?? {})
	const values: Record<EventField, string> = {
		kind: input.kind,
		target: input.target,
		source: input.source,
		country: cf(request, 'country') || 'XX',
		device: detectDevice(ua),
		browser: detectBrowser(ua),
		os: detectOs(ua),
		referrer: referrerHost(request),
		visitor: await visitorId(adminPassword(env), input.day, request),
		region: cf(request, 'region'),
		city: cf(request, 'city'),
		utmContent: utm.content ?? '',
		language: language(request),
		network: cf(request, 'asOrganization'),
		slug: input.slug,
		url: input.url,
		utmSource: utm.source ?? '',
		utmMedium: utm.medium ?? '',
		utmCampaign: utm.campaign ?? '',
		page: input.page,
	}
	return EVENT_FIELDS.map((field) => values[field].slice(0, field === 'url' ? 1024 : 200))
}

/** "2026-10-31" → 20261031, so days can be compared and grouped as numbers. */
export const dayNumber = (day: string): number => Number(day.replaceAll('-', ''))
const dayFromNumber = (n: number): string => {
	const s = String(Math.trunc(n))
	return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export function eventDoubles(request: Request, input: Pick<EventInput, 'day' | 'hour'>): number[] {
	const values: Record<EventNumber, number> = {
		day: dayNumber(input.day),
		hour: input.hour,
		latitude: coordinate(request, 'latitude', 90),
		longitude: coordinate(request, 'longitude', 180),
		asn: asn(request),
		layout: LAYOUT,
	}
	return EVENT_NUMBERS.map((field) => values[field])
}

export async function writeEvent(env: Env, request: Request, input: EventInput): Promise<void> {
	const dataset = (env as { ANALYTICS?: AnalyticsEngineDataset }).ANALYTICS
	if (!dataset) return
	dataset.writeDataPoint({
		indexes: [input.target],
		blobs: await eventBlobs(env, request, input),
		doubles: eventDoubles(request, input),
	})
}

export interface Ranked {
	value: string
	count: number
}

export interface RecentEvent {
	at: string
	kind: 'view' | 'click'
	target: string
	source: string
	country: string
	region: string
	city: string
	device: string
	os: string
	browser: string
}

export interface PlaceCount {
	country: string
	region: string
	count: number
}

export interface CampaignCount {
	source: string
	medium: string
	campaign: string
	content: string
	/** Page views that carried these tags. */
	views: number
	/** Clicks that carried them, from the visit or the short link's own settings. */
	clicks: number
}

/** Visitors around one spot on the map, which Cloudflare gives to 0.1°. */
export interface MapPoint {
	lat: number
	lon: number
	country: string
	city: string
	count: number
}

export interface Insights {
	/** Distinct visitors per day, summed over the range. */
	visitors: number
	/** The same for the period before, for comparison. */
	previousVisitors: number
	/** Distinct visitors per day, keyed by "YYYY-MM-DD". */
	visitorsByDay: Record<string, number>
	countries: Ranked[]
	/** `value` is "<country code>:<city>". */
	cities: Ranked[]
	/** Clicks by country and region (e.g. "TW", "Kaohsiung City"). */
	places: PlaceCount[]
	devices: Ranked[]
	os: Ranked[]
	browsers: Ranked[]
	languages: Ranked[]
	referrers: Ranked[]
	/** Networks visitors came through, e.g. "Chunghwa Telecom". */
	networks: Ranked[]
	/** Where visitors were, for a map; the busiest 300 spots. */
	points: MapPoint[]
	/** Visits and clicks by their UTM tags; "" where a tag is missing. */
	campaigns: CampaignCount[]
	/** Clicks by weekday (0 = Monday) and hour, in the site's time zone. */
	heatmap: number[][]
	recent: RecentEvent[]
}

type SqlBinding = { query<T extends Record<string, unknown>>(request: { query: string; params?: Record<string, string | number> }): Promise<{ data: T[] }> }

function sqlOf(env: Env): { sql: SqlBinding; from: string } | null {
	const sql = (env as { ANALYTICS_SQL?: SqlBinding }).ANALYTICS_SQL
	const dataset = (env as { ANALYTICS_DATASET?: string }).ANALYTICS_DATASET
	if (!sql || !dataset || !/^\w+$/.test(dataset)) return null
	return { sql, from: `events.analyticsEngine.${dataset}` }
}

/** Which events a query covers: one page's views and clicks, or one short link's clicks. */
export type Scope = { page: string } | { target: string }

export interface Period {
	/** First and last day, "YYYY-MM-DD", in the site's time zone. */
	from: string
	to: string
	previousFrom: string
}

type CampaignRow = { s: string; m: string; c: string; ct: string; v: number; k: string; n: number }

/** Views and clicks per set of tags, the busiest 12. */
function campaignCounts(rows: CampaignRow[]): CampaignCount[] {
	const counts = new Map<string, CampaignCount>()
	for (const row of rows) {
		const tags = { source: String(row.s), medium: String(row.m), campaign: String(row.c), content: Number(row.v) >= 1 ? String(row.ct) : '' }
		if (!tags.source && !tags.medium && !tags.campaign && !tags.content) continue
		const key = JSON.stringify(tags)
		const count = counts.get(key) ?? { ...tags, views: 0, clicks: 0 }
		if (row.k === 'click') count.clicks += Number(row.n)
		else count.views += Number(row.n)
		counts.set(key, count)
	}
	return [...counts.values()].sort((a, b) => b.views + b.clicks - (a.views + a.clicks)).slice(0, 12)
}

/** One point per spot: a spot can come back once per city name Cloudflare used there. */
function mapPoints(rows: { lat: number; lon: number; country: string; city: string; n: number }[]): MapPoint[] {
	const points = new Map<string, MapPoint & { top: number }>()
	for (const row of rows) {
		const lat = Number(row.lat)
		const lon = Number(row.lon)
		const count = Number(row.n)
		if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(count > 0)) continue
		const key = `${lat.toFixed(1)},${lon.toFixed(1)}`
		const point = points.get(key)
		if (!point) points.set(key, { lat, lon, country: String(row.country), city: String(row.city), count, top: count })
		else {
			point.count += count
			if (count > point.top) Object.assign(point, { country: String(row.country), city: String(row.city), top: count })
		}
	}
	return [...points.values()].map(({ lat, lon, country, city, count }) => ({ lat, lon, country, city, count })).sort((a, b) => b.count - a.count)
}

const weekday = (day: string): number => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7

function recentEvent(row: Record<string, unknown>): RecentEvent {
	const text = (key: string) => String(row[key] ?? '')
	return {
		at: text('at'),
		kind: row.kind === 'click' ? 'click' : 'view',
		target: text('target'),
		source: text('source'),
		country: text('country'),
		region: text('region'),
		city: text('city'),
		device: text('device'),
		os: text('os'),
		browser: text('browser'),
	}
}

/** What the whole Cloudflare account used of KV and D1 since a moment, and the size of its D1 databases. */
export interface AccountUse {
	kv: { read: number; write: number; delete: number; list: number }
	d1: { rowsRead: number; rowsWritten: number }
	databases: { count: number; bytes: number }
}

/**
 * The account's own numbers, from Cloudflare's analytics through the SQL binding, which is scoped to the account and
 * needs no API token: every Worker and database on it, not only this one. They run a few minutes late, and come from
 * sampled data. Null without the binding, as in local development.
 */
export async function accountUse(env: Env, since: string): Promise<AccountUse | null> {
	const sql = (env as { ANALYTICS_SQL?: SqlBinding }).ANALYTICS_SQL
	if (!sql) return null
	// Database sizes are sampled now and then; the last two days hold each one's latest.
	const recent = new Date(Date.parse(since) - 86_400_000).toISOString()
	const [kv, d1, storage] = await Promise.all([
		sql.query<{ actionType: string; ops: number }>({
			query: 'SELECT actionType, SUM(sampleInterval) AS ops FROM events.kvRequests WHERE timestamp >= $since GROUP BY actionType',
			params: { since },
		}),
		sql.query<{ readRows: number; writtenRows: number }>({
			query: 'SELECT SUM(rowsRead * sampleInterval) AS readRows, SUM(rowsWritten * sampleInterval) AS writtenRows FROM events.d1BackendRequest WHERE timestamp >= $since',
			params: { since },
		}),
		sql.query<{ databaseId: string; bytes: number }>({
			query: 'SELECT databaseId, MAX(databaseSizeBytes) AS bytes FROM states.d1Storage WHERE timestamp >= $recent GROUP BY databaseId',
			params: { recent },
		}),
	])
	const ops = (action: string) => Math.round(Number(kv.data.find((row) => row.actionType === action)?.ops ?? 0))
	const rows = d1.data[0]
	return {
		kv: { read: ops('read'), write: ops('write'), delete: ops('delete'), list: ops('list') },
		d1: { rowsRead: Math.round(Number(rows?.readRows ?? 0)), rowsWritten: Math.round(Number(rows?.writtenRows ?? 0)) },
		databases: { count: storage.data.length, bytes: storage.data.reduce((total, row) => total + (Number(row.bytes) || 0), 0) },
	}
}

/** Views and clicks counted since a moment (an ISO time), for how much of today's quota the site has used. Null without Analytics Engine. */
export async function countsSince(env: Env, since: string): Promise<{ views: number; clicks: number } | null> {
	const source = sqlOf(env)
	if (!source) return null
	const { data } = await source.sql.query<{ k: string; n: number }>({
		query: `SELECT ${column('kind')} AS k, SUM(sampleInterval) AS n FROM ${source.from} WHERE timestamp >= $since GROUP BY k`,
		params: { since },
	})
	const count = (kind: string) => Math.round(Number(data.find((row) => row.k === kind)?.n ?? 0))
	return { views: count('view'), clicks: count('click') }
}

/**
 * Reads the detailed numbers for a period. Returns null when Analytics Engine
 * isn't available, e.g. in local development where the SQL binding has no
 * local implementation.
 */
export async function insights(env: Env, scope: Scope, period: Period): Promise<Insights | null> {
	const source = sqlOf(env)
	if (!source) return null
	const { sql, from } = source
	const scoped = 'page' in scope ? `${column('page')} = $scope` : `${column('target')} = $scope AND ${column('kind')} = 'click'`
	const params = {
		scope: 'page' in scope ? scope.page : scope.target,
		from: dayNumber(period.from),
		to: dayNumber(period.to),
		previousFrom: dayNumber(period.previousFrom),
		// Lets AE skip old data; days are filtered exactly by the day column.
		since: new Date(Date.parse(`${period.previousFrom}T00:00:00Z`) - 86_400_000).toISOString(),
	}
	const day = numberColumn('day')
	const where = (kind: 'view' | 'click' | 'any', extra = '') =>
		`WHERE timestamp >= $since AND ${scoped} AND ${day} >= $from AND ${day} <= $to${kind === 'any' ? '' : ` AND ${column('kind')} = '${kind}'`} ${extra}`
	// Page scopes describe visitors by their page views; link scopes by their clicks.
	const people = 'page' in scope ? 'view' : 'click'
	const query = async <T extends Record<string, unknown>>(text: string) => (await sql.query<T>({ query: text, params })).data
	const top = async (field: EventField, kind: 'view' | 'click', limit: number, extra = '') =>
		(
			await query<{ value: string; n: number }>(
				`SELECT ${column(field)} AS value, SUM(sampleInterval) AS n FROM ${from} ${where(kind, extra)}
				GROUP BY value ORDER BY n DESC LIMIT ${limit}`,
			)
		).map((row) => ({ value: String(row.value), count: Number(row.n) }))

	try {
		const [visitorRows, previous, countries, cities, places, devices, os, browsers, languages, referrers, campaigns, hours, recent, networks, spots] =
			await Promise.all([
				query<{ d: number; n: number }>(
					`SELECT ${day} AS d, COUNT(DISTINCT ${column('visitor')}) AS n FROM ${from} ${where(people)} GROUP BY d`,
				),
				query<{ n: number }>(
					`SELECT COUNT(DISTINCT ${column('visitor')}) AS n FROM ${from}
					WHERE timestamp >= $since AND ${scoped} AND ${day} >= $previousFrom AND ${day} < $from AND ${column('kind')} = '${people}'`,
				),
				top('country', people, 8),
				query<{ country: string; city: string; n: number }>(
					`SELECT ${column('country')} AS country, ${column('city')} AS city, SUM(sampleInterval) AS n FROM ${from}
					${where(people, `AND ${column('city')} != ''`)} GROUP BY country, city ORDER BY n DESC LIMIT 8`,
				),
				query<{ country: string; region: string; n: number }>(
					`SELECT ${column('country')} AS country, ${column('region')} AS region, SUM(sampleInterval) AS n FROM ${from}
					${where('click')} GROUP BY country, region ORDER BY n DESC LIMIT 60`,
				),
				top('device', people, 3),
				top('os', people, 6),
				top('browser', people, 8),
				top('language', people, 6, `AND ${column('language')} != ''`),
				top('referrer', people, 8, `AND ${column('referrer')} != ''`),
				// Campaign tags count on both page views and clicks. Rows from before layout 1 hold a
				// time zone where utm_content is now; campaignCounts() leaves those out.
				query<CampaignRow>(
					`SELECT ${column('utmSource')} AS s, ${column('utmMedium')} AS m, ${column('utmCampaign')} AS c,
					${column('utmContent')} AS ct, ${numberColumn('layout')} AS v, ${column('kind')} AS k,
					SUM(sampleInterval) AS n FROM ${from}
					${where(
						'any',
						`AND (${column('utmSource')} != '' OR ${column('utmMedium')} != '' OR ${column('utmCampaign')} != ''
						OR (${column('utmContent')} != '' AND ${numberColumn('layout')} >= 1))`,
					)}
					GROUP BY s, m, c, ct, v, k ORDER BY n DESC LIMIT 100`,
				),
				query<{ d: number; h: number; n: number }>(
					`SELECT ${day} AS d, ${numberColumn('hour')} AS h, SUM(sampleInterval) AS n FROM ${from} ${where('click')} GROUP BY d, h`,
				),
				query<Record<string, unknown>>(
					`SELECT timestamp AS at, ${column('kind')} AS kind, ${column('target')} AS target, ${column('source')} AS source,
					${column('country')} AS country, ${column('region')} AS region, ${column('city')} AS city,
					${column('device')} AS device, ${column('os')} AS os, ${column('browser')} AS browser
					FROM ${from} ${where('any')} ORDER BY timestamp DESC LIMIT 20`,
				),
				top('network', people, 8, `AND ${numberColumn('asn')} > 0 AND ${column('network')} != ''`),
				query<{ lat: number; lon: number; country: string; city: string; n: number }>(
					`SELECT ${numberColumn('latitude')} AS lat, ${numberColumn('longitude')} AS lon, ${column('country')} AS country,
					${column('city')} AS city, SUM(sampleInterval) AS n FROM ${from}
					${where(people, `AND (${numberColumn('latitude')} != 0 OR ${numberColumn('longitude')} != 0)`)}
					GROUP BY lat, lon, country, city ORDER BY n DESC LIMIT 300`,
				),
			])

		const visitorsByDay: Record<string, number> = {}
		for (const row of visitorRows) visitorsByDay[dayFromNumber(Number(row.d))] = Number(row.n)
		const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
		for (const row of hours) {
			const hour = Math.trunc(Number(row.h))
			const cell = heatmap[weekday(dayFromNumber(Number(row.d)))]
			if (cell && hour >= 0 && hour < 24) cell[hour] = (cell[hour] ?? 0) + Number(row.n)
		}
		return {
			visitors: Object.values(visitorsByDay).reduce((a, b) => a + b, 0),
			previousVisitors: Number(previous[0]?.n ?? 0),
			visitorsByDay,
			countries,
			cities: cities.map((row) => ({ value: `${row.country}:${row.city}`, count: Number(row.n) })),
			places: places.map((row) => ({ country: String(row.country), region: String(row.region), count: Number(row.n) })),
			devices,
			os,
			browsers,
			languages,
			referrers,
			networks,
			points: mapPoints(spots),
			campaigns: campaignCounts(campaigns),
			heatmap,
			recent: recent.map(recentEvent),
		}
	} catch (error) {
		console.error('Analytics Engine query failed', error)
		return null
	}
}
