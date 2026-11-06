import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson } from '../src/shared/api'
import { d1Quota, dayRange, isDay, kvNamespaceLabel, kvQuota, KV_DAILY_LIMITS, lastDays, leftInPlainWords, nextReset, utcDay } from '../src/shared/usage'
import app from '../src/worker/index'
import { apiJson, IPHONE, ORIGIN } from './helpers'
import { guideNames } from '../src/worker/lib/agent'
import { guideTopic } from '../src/worker/lib/agentTopics'

describe('kvQuota', () => {
	it('adds up each kind across namespaces, and says what is left', () => {
		const quota = kvQuota([
			{ actionType: 'read', ops: '4288' },
			{ actionType: 'read', ops: 12 },
			{ actionType: 'write', ops: '27' },
		])
		expect(quota.read).toEqual({ used: 4300, limit: 100_000, left: 95_700, percent: 4.3 })
		expect(quota.write).toEqual({ used: 27, limit: 1_000, left: 973, percent: 2.7 })
		expect(quota.delete).toEqual({ used: 0, limit: 1_000, left: 1_000, percent: 0 })
	})

	it('never goes below nothing left', () => {
		expect(kvQuota([{ actionType: 'write', ops: 1500 }]).write).toMatchObject({ left: 0, percent: 150 })
	})

	it('reads no rows as nothing used, and ignores a kind it does not know', () => {
		expect(kvQuota([]).read.left).toBe(KV_DAILY_LIMITS.read)
		expect(kvQuota([{ actionType: 'other', ops: 5 }, { actionType: 'list', ops: 'x' }]).list.used).toBe(0)
	})
})

describe('days', () => {
	it('count in UTC, whatever the time zone', () => {
		// 07:30 on the 5th in Taipei is still the 4th for the quota; 08:00 there starts the 5th.
		expect(utcDay(new Date('2026-11-05T07:30:00+08:00'))).toBe('2026-11-04')
		expect(utcDay(new Date('2026-11-05T08:00:00+08:00'))).toBe('2026-11-05')
	})

	it('reset at the next midnight UTC, across a month and a year', () => {
		expect(nextReset(new Date('2026-11-04T00:51:00Z')).toISOString()).toBe('2026-11-05T00:00:00.000Z')
		expect(nextReset(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
	})

	it('cover a whole day when asked for one', () => {
		expect(dayRange('2026-10-28')).toEqual({ since: '2026-10-28T00:00:00Z', until: '2026-10-28T23:59:59Z' })
	})

	it('go back from today, newest first', () => {
		expect(lastDays(new Date('2026-11-02T12:00:00Z'), 3)).toEqual(['2026-11-02', '2026-11-01', '2026-10-31'])
	})

	it('must be real dates', () => {
		expect(isDay('2026-10-28')).toBe(true)
		for (const bad of ['2026-02-30', '2026-13-01', '10/28', '2026-10-28 x', "2026-10-28'; DROP", '']) expect(isDay(bad), bad).toBe(false)
	})
})

describe('what is left, for an owner', () => {
	it('is page views and changes, not reads and writes', () => {
		const usage = kvQuota([{ actionType: 'read', ops: 2000 }, { actionType: 'write', ops: 20 }] as never)
		expect(leftInPlainWords(usage)).toEqual({ pageViews: 49_000, changes: 980 })
	})

	it('is whichever of KV reads and D1 rows written runs out first', () => {
		const kv = kvQuota([{ actionType: 'read', ops: 2000 }] as never)
		const d1 = d1Quota([{ readRows: '1000', writtenRows: '70000' }, { readRows: 10, writtenRows: 5000 }])
		expect(d1.rowsWritten).toEqual({ used: 75_000, limit: 100_000, left: 25_000, percent: 75 })
		expect(leftInPlainWords(kv, d1)).toEqual({ pageViews: 25_000, changes: 1_000 })
	})

	it('never goes below nothing', () => {
		const usage = kvQuota([{ actionType: 'read', ops: 200_000 }, { actionType: 'write', ops: 5000 }] as never)
		expect(leftInPlainWords(usage)).toEqual({ pageViews: 0, changes: 0 })
	})
})

describe('namespace labels', () => {
	it('use the name, then the start of the id, and say so when Cloudflare gives no id', () => {
		expect(kvNamespaceLabel('0123456789abcdef0123456789abcdef', 'flux-bio-kv')).toBe('flux-bio-kv')
		expect(kvNamespaceLabel('0123456789abcdef0123456789abcdef', null)).toBe('01234567')
		expect(kvNamespaceLabel('00000000000000000000000000000000')).toBe('(no id from Cloudflare)')
	})
})

describe('the guide', () => {
	const guide = guideTopic('quota', guideNames('https://bio.example', 'flux-bio'))

	it('tells an agent how to answer "how much is left today", and what to say if it can only reach the API', () => {
		expect(guide).toContain('**How much free quota is left.**')
		expect(guide).toContain('pnpm usage')
		expect(guide).toContain('00:00 UTC')
		expect(guide).toContain("If you can only reach this API, you can't read the quota")
	})
})

// Past a daily limit Cloudflare fails that kind of operation. The guide tells owners what that means for visitors.
describe('when KV reads run out', () => {
	const noReads = new Proxy(env.KV, {
		get(target, name) {
			if (name === 'get' || name === 'getWithMetadata') return () => Promise.reject(new Error('KV GET failed: 429 Too Many Requests'))
			const value = Reflect.get(target, name) as unknown
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	async function visit(path: string): Promise<Response> {
		const ctx = createExecutionContext()
		const response = await app.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', headers: { 'user-agent': IPHONE } }), { ...env, KV: noReads }, ctx)
		await waitOnExecutionContext(ctx)
		return response
	}

	beforeAll(async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'out-of-reads', name: 'Out of reads' } })
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		await apiJson('/links', { method: 'POST', json: { url: 'https://example.com/a', slug: 'out-link' } })
	})

	it('pages and short links stop working until the reset', async () => {
		expect((await visit('/')).status).toBe(500)
		expect((await visit('/out-of-reads')).status).toBe(500)
		expect((await visit('/out-link')).status).toBe(500)
	})
})
