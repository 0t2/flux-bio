import type { Settings } from '../../shared/content'
import { addMonths, dayIn } from '../../shared/time'
import { msg } from '../../templates/msg'
import { ApiError } from '../types'
import { readMeta, writeMetaStatement } from './db'

/**
 * Old stats. The dashboard reads at most 180 days back (90 days and the 90 before them), so daily rows are kept for
 * 13 whole months and older months become one row per month: `day` is then "YYYY-MM", which sorts before that month's
 * days and so is never in a query for a range of days. Only the day within the month is lost; each target, kind
 * and source keeps its count. When the database passes DATABASE_FULL of the plan's size, 6 months are kept instead.
 *
 * Nothing runs on a schedule: a visit to the dashboard (GET /api/state) does a slice after answering, within a
 * budget a day, because rows merged or deleted count as rows written, of which the free plan allows 100,000 a day.
 * The owner can also have everything before a month deleted (`clear`); that goes the same way, a slice at a time.
 */

/** A year and a month, so a month can still be set beside the same one a year before. */
export const DAILY_MONTHS = 13
/** When the database is filling up. Still more than the 180 days the dashboard reads. */
export const DAILY_MONTHS_TIGHT = 6
/** The share of the plan's database size past which fewer months are kept, and the dashboard warns. */
export const DATABASE_FULL = 0.7
/** Largest D1 database on each plan. */
export const DATABASE_LIMIT: Record<Settings['plan'], number> = { free: 500 * 1024 ** 2, paid: 10 * 1024 ** 3 }
/**
 * Rows merged or deleted per visit, and per UTC day. One costs about four rows written (the monthly row and the
 * daily one leave or change, each with its index), so on the free plan this stays near a fifth of the day's writes.
 */
const PER_RUN: Record<Settings['plan'], number> = { free: 2_000, paid: 20_000 }
const PER_DAY: Record<Settings['plan'], number> = { free: 5_000, paid: 500_000 }

const KEY = 'stats_history'

interface State {
	/** The first month that may still have daily rows: everything before it is merged. */
	from: string
	/** Everything before this month is to be deleted, when the owner asked for it. */
	clear: string | null
	/** The UTC day `done` counts rows for. */
	day: string
	done: number
}

const stateOf = (raw: Partial<State> | undefined): State => ({ from: raw?.from ?? '', clear: raw?.clear ?? null, day: raw?.day ?? '', done: raw?.done ?? 0 })

async function loadState(db: D1Database): Promise<State> {
	return stateOf((await readMeta(db, KEY)) as Partial<State> | undefined)
}

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10)
const monthOf = (timeZone: string, now: number) => dayIn(timeZone, now).slice(0, 7)

/** The database's size in bytes, which D1 reports with every query. */
export async function databaseBytes(db: D1Database): Promise<number> {
	const result = await db.prepare('SELECT 1').run()
	return Number((result.meta as { size_after?: number }).size_after ?? 0)
}

export function dailyMonths(bytes: number, plan: Settings['plan']): number {
	return bytes > DATABASE_LIMIT[plan] * DATABASE_FULL ? DAILY_MONTHS_TIGHT : DAILY_MONTHS
}

/** The oldest month that may be deleted: older than every day the dashboard can show. */
export function clearableBefore(timeZone: string, now = Date.now()): string {
	return addMonths(monthOf(timeZone, now), -DAILY_MONTHS_TIGHT)
}

/** Rows in [from, until) as they sort in the primary key, the first `limit` of them. */
const SLICE = 'SELECT day, target, kind, dim, value FROM stats WHERE day >= ?1 AND day < ?2 ORDER BY day, target, kind, dim, value LIMIT ?3'

/**
 * One slice of the work on old stats, at most once per visit and within the day's budget: what the owner asked
 * to delete first, then daily rows of whole months past the window into one row per month.
 */
export async function tidyStats(db: D1Database, settings: Settings, now = Date.now()): Promise<void> {
	const state = await loadState(db)
	const today = utcDay(now)
	const done = state.day === today ? state.done : 0
	const room = Math.min(PER_RUN[settings.plan], PER_DAY[settings.plan] - done)
	if (room <= 0) return
	const save = (next: Partial<State>, rows: number) => writeMetaStatement(db, KEY, { ...state, ...next, day: today, done: done + rows } satisfies State).run()

	if (state.clear) {
		// A month sorts before its days and after the days of the month before, so `< "YYYY-MM"` is exactly the months before it.
		const result = await db.prepare(`DELETE FROM stats WHERE (day, target, kind, dim, value) IN (${SLICE})`).bind('', state.clear, room).run()
		const rows = result.meta.changes ?? 0
		await save(rows < room ? { clear: null, from: state.from < state.clear ? state.clear : state.from } : {}, rows)
		return
	}

	const cutoff = `${addMonths(monthOf(settings.timezone, now), -dailyMonths(await databaseBytes(db), settings.plan))}-01`
	const first = await db
		.prepare('SELECT day FROM stats WHERE day >= ?1 AND day < ?2 AND length(day) = 10 ORDER BY day LIMIT 1')
		.bind(state.from, cutoff)
		.first<{ day: string }>()
	if (!first) {
		const from = cutoff.slice(0, 7)
		if (state.from !== from) await save({ from }, 0)
		return
	}
	const month = first.day.slice(0, 7)
	const end = `${addMonths(month, 1)}-01`
	const until = end < cutoff ? end : cutoff
	// Both statements take the same first rows of the month, in one transaction. The monthly row's day sorts before
	// the month's first day, so it is never among them.
	const [merged] = await db.batch([
		db
			.prepare(
				`INSERT INTO stats (day, target, kind, dim, value, count, page)
				SELECT ?4, target, kind, dim, value, count, page FROM stats WHERE (day, target, kind, dim, value) IN (${SLICE})
				ON CONFLICT (day, target, kind, dim, value) DO UPDATE SET count = count + excluded.count, page = COALESCE(stats.page, excluded.page)`,
			)
			.bind(`${month}-01`, until, room, month),
		db.prepare(`DELETE FROM stats WHERE (day, target, kind, dim, value) IN (${SLICE})`).bind(`${month}-01`, until, room),
	])
	await save({ from: month }, merged?.meta.changes ?? 0)
}

export interface StatsHistory {
	/** Months of daily rows kept now. */
	dailyMonths: number
	/** The oldest month with any numbers, "YYYY-MM". */
	oldestMonth: string | null
	/** The next month whose days become one row, and the day that happens, in the site's time zone. */
	nextMerge: { month: string; on: string } | null
	/** Older months are still being made into one row each, a slice per dashboard visit. */
	merging: boolean
	/** Everything before this month is being deleted, as the owner asked. */
	clearing: string | null
	/** The latest month `clear` takes. */
	clearableBefore: string
}

export async function statsHistory(db: D1Database, settings: Settings, bytes: number, now = Date.now()): Promise<StatsHistory> {
	const months = dailyMonths(bytes, settings.plan)
	// The oldest month still kept by the day; on the first of next month, it is next.
	const thisMonth = monthOf(settings.timezone, now)
	const kept = addMonths(thisMonth, -months)
	// One trip to D1. The second read starts where the saved state says daily rows may begin, so it takes that from
	// the state's own row and needn't wait for the Worker to have read it.
	const [saved, oldest, firstDaily, keptDays] = await db.batch<{ value?: string; day?: string; n?: number }>([
		db.prepare('SELECT value FROM _meta WHERE key = ?1').bind(KEY),
		db.prepare('SELECT day FROM stats ORDER BY day LIMIT 1'),
		db
			.prepare(
				`SELECT day FROM stats
				WHERE day >= COALESCE((SELECT CASE WHEN json_valid(value) THEN json_extract(value, '$.from') END FROM _meta WHERE key = ?1), '')
					AND length(day) = 10
				ORDER BY day LIMIT 1`,
			)
			.bind(KEY),
		db.prepare('SELECT 1 AS n FROM stats WHERE day >= ?1 AND day < ?2 LIMIT 1').bind(`${kept}-01`, `${addMonths(kept, 1)}-01`),
	])
	let raw: Partial<State> | undefined
	try {
		raw = JSON.parse(saved?.results[0]?.value ?? 'null') ?? undefined
	} catch {
		raw = undefined
	}
	const state = stateOf(raw)
	const firstDay = firstDaily?.results[0]?.day
	return {
		dailyMonths: months,
		oldestMonth: oldest?.results[0]?.day?.slice(0, 7) ?? null,
		nextMerge: keptDays?.results.length ? { month: kept, on: `${addMonths(thisMonth, 1)}-01` } : null,
		merging: Boolean(firstDay && firstDay < `${kept}-01`),
		clearing: state.clear,
		clearableBefore: clearableBefore(settings.timezone, now),
	}
}

/** Has everything before `before` ("YYYY-MM") deleted, a slice per dashboard visit. */
export async function clearStats(db: D1Database, settings: Settings, before: string, now = Date.now()): Promise<void> {
	if (before > clearableBefore(settings.timezone, now)) {
		throw new ApiError(400, 'invalid', { key: msg('只能清除 {month} 以前的點擊數據，比這更新的還會顯示在數據頁'), params: { month: clearableBefore(settings.timezone, now) } })
	}
	const state = await loadState(db)
	await writeMetaStatement(db, KEY, { ...state, clear: state.clear && state.clear > before ? state.clear : before } satisfies State).run()
}

/** One line of the stats download. */
export type ExportRow = [day: string, kind: string, target: string, page: string, slug: string, title: string, source: string, count: number]

export const EXPORT_COLUMNS = ['day', 'kind', 'target', 'page', 'slug', 'title', 'source', 'count'] as const

const EXPORT_PAGE = 1_000

type Key = [string, string, string, string, string]

const encodeCursor = (key: Key) => btoa(JSON.stringify(key)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function decodeCursor(cursor: string): Key | null {
	try {
		const key = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))) as unknown
		return Array.isArray(key) && key.length === 5 && key.every((part) => typeof part === 'string') ? (key as Key) : null
	} catch {
		return null
	}
}

/**
 * Every count, oldest first, a thousand at a time: days as "YYYY-MM-DD", merged months as "YYYY-MM". `page` is the
 * page's address for its views, its links and the clicks inside it; `slug` and `title` are a short link's.
 */
export async function exportStats(db: D1Database, cursor: string | undefined, before?: string): Promise<{ rows: ExportRow[]; nextCursor: string | null }> {
	const after = cursor ? decodeCursor(cursor) : null
	if (cursor && !after) throw new ApiError(400, 'invalid', msg('查詢參數不正確'))
	const { results } = await db
		.prepare(
			`SELECT s.day, s.kind, s.target, s.dim, s.value, s.count, p.handle, l.slug, l.title
			FROM stats s
			LEFT JOIN links l ON l.id = s.target
			LEFT JOIN pages p ON p.id = COALESCE(s.page, l.page_id, CASE WHEN s.kind = 'view' THEN s.target END)
			WHERE (s.day, s.target, s.kind, s.dim, s.value) > (?1, ?2, ?3, ?4, ?5) AND s.day < ?6
			ORDER BY s.day, s.target, s.kind, s.dim, s.value LIMIT ?7`,
		)
		.bind(...(after ?? ['', '', '', '', '']), before ?? '9999', EXPORT_PAGE + 1)
		.all<{ day: string; kind: string; target: string; dim: string; value: string; count: number; handle: string | null; slug: string | null; title: string | null }>()
	const page = results.slice(0, EXPORT_PAGE)
	const last = page.at(-1)
	return {
		rows: page.map((row) => [row.day, row.kind, row.target, row.handle ?? '', row.slug?.startsWith('~') ? '' : (row.slug ?? ''), row.title ?? '', row.value, row.count]),
		nextCursor: results.length > EXPORT_PAGE && last ? encodeCursor([last.day, last.target, last.kind, last.dim, last.value]) : null,
	}
}
