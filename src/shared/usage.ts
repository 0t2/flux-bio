/**
 * The sums behind `pnpm usage`: how much of the free plan's daily KV and D1 quota is
 * used and left. The limits are for a whole Cloudflare account and reset at 00:00 UTC.
 * https://developers.cloudflare.com/kv/platform/pricing/
 * https://developers.cloudflare.com/d1/platform/pricing/
 */
export const KV_DAILY_LIMITS = { read: 100_000, write: 1_000, delete: 1_000, list: 1_000 } as const
export type KvAction = keyof typeof KV_DAILY_LIMITS
export const KV_ACTIONS = Object.keys(KV_DAILY_LIMITS) as KvAction[]

export interface KvQuota {
	used: number
	limit: number
	left: number
	/** Of the limit, to one decimal. */
	percent: number
}

/** D1's daily limits on the free plan, and how much it may hold. */
export const D1_DAILY_LIMITS = { rowsRead: 5_000_000, rowsWritten: 100_000 } as const
export const D1_STORAGE = { database: 500 * 1024 ** 2, account: 5 * 1024 ** 3, databases: 10 } as const
export type D1Measure = keyof typeof D1_DAILY_LIMITS

/** One of the account's subscriptions, as `cf accounts subscriptions get` lists them. */
export interface Subscription {
	state?: string
	rate_plan?: { id?: string; public_name?: string }
}

/** The account's Workers plan: "paid" with a live Workers Paid (Standard) subscription, else "free". */
export function workersPlan(subscriptions: readonly Subscription[]): 'free' | 'paid' {
	const paid = subscriptions.some((entry) => {
		const plan = `${entry.rate_plan?.id ?? ''} ${entry.rate_plan?.public_name ?? ''}`
		return /workers/i.test(plan) && /paid|standard|bundled|unbound/i.test(plan) && !/cancel|expired/i.test(entry.state ?? '')
	})
	return paid ? 'paid' : 'free'
}

/** One row from the D1 analytics query: one database's rows, summed. */
export interface D1Row {
	readRows: number | string
	writtenRows: number | string
}

function quota(used: number, limit: number): KvQuota {
	return { used, limit, left: Math.max(0, limit - used), percent: Math.round((used / limit) * 1000) / 10 }
}

export function d1Quota(rows: readonly D1Row[]): Record<D1Measure, KvQuota> {
	const sum = (pick: (row: D1Row) => number | string) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0)
	return { rowsRead: quota(sum((row) => row.readRows), D1_DAILY_LIMITS.rowsRead), rowsWritten: quota(sum((row) => row.writtenRows), D1_DAILY_LIMITS.rowsWritten) }
}

/**
 * What is left in terms an owner can picture. A page view reads KV once (tests/kv-cost.test.ts) and each image once
 * more, and writes a D1 row for its count, so this is the most it could be; a change is about one KV write (a publish,
 * a new short link).
 */
export function leftInPlainWords(kv: Record<KvAction, KvQuota>, d1?: Record<D1Measure, KvQuota>): { pageViews: number; changes: number } {
	const views = kv.read.left
	return { pageViews: d1 ? Math.min(views, d1.rowsWritten.left) : views, changes: kv.write.left }
}

/** One row from the analytics query: operations of one kind, summed. */
export interface KvRow {
	actionType: string
	ops: number | string
}

export function kvQuota(rows: readonly KvRow[]): Record<KvAction, KvQuota> {
	const used = { read: 0, write: 0, delete: 0, list: 0 }
	for (const row of rows) {
		if (row.actionType in used) used[row.actionType as KvAction] += Number(row.ops) || 0
	}
	return Object.fromEntries(KV_ACTIONS.map((action) => [action, quota(used[action], KV_DAILY_LIMITS[action])])) as Record<KvAction, KvQuota>
}

/** What to call a namespace. Analytics can report operations under an id of all zeros, seen on a namespace made minutes earlier. They still count. */
export function kvNamespaceLabel(id: string, name?: string | null): string {
	if (name) return name
	return /^0+$/.test(id) ? '(no id from Cloudflare)' : id.slice(0, 8)
}

/** The day the quota counts in: it follows UTC, whatever the owner's time zone. */
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10)

/** A real calendar day written as YYYY-MM-DD. */
export function isDay(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
	const parsed = new Date(`${value}T00:00:00Z`)
	return !Number.isNaN(parsed.getTime()) && utcDay(parsed) === value
}

/** Both ends are inclusive in the analytics query. */
export const dayRange = (day: string): { since: string; until: string } => ({ since: `${day}T00:00:00Z`, until: `${day}T23:59:59Z` })

/** The moment today's quota starts over. */
export function nextReset(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/** The last `count` UTC days, newest first. */
export function lastDays(now: Date, count: number): string[] {
	return Array.from({ length: count }, (_, back) => utcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back))))
}
