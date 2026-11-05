/**
 * The sums behind `pnpm kv-usage`: how much of the free plan's daily KV quota is
 * used and left. The limits are for a whole Cloudflare account and reset at 00:00 UTC.
 * https://developers.cloudflare.com/kv/platform/pricing/
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

/**
 * What is left in terms an owner can picture. A page view reads twice (tests/kv-cost.test.ts) and each image once more,
 * so this is the most it could be; a change is about one write (a publish, a new short link).
 */
export function kvLeftInPlainWords(usage: Record<KvAction, KvQuota>): { pageViews: number; changes: number } {
	return { pageViews: Math.floor(usage.read.left / 2), changes: usage.write.left }
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
	return Object.fromEntries(
		KV_ACTIONS.map((action) => {
			const limit = KV_DAILY_LIMITS[action]
			const count = used[action]
			return [action, { used: count, limit, left: Math.max(0, limit - count), percent: Math.round((count / limit) * 1000) / 10 }]
		}),
	) as Record<KvAction, KvQuota>
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
