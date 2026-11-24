import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import config from '../cloudflare.config.ts?raw'
import { detectBrowser, detectOs } from '../src/shared/source'
import { CLIENT_ROWS, clearInsightsCache, EVENT_FIELDS, EVENT_NUMBERS, eventBlobs, eventDoubles, insights } from '../src/worker/lib/analytics'

const IP = '203.0.113.77'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0'

function visit(): Request {
	return new Request('https://bio.example/lens?s=ig&utm_source=line&utm_medium=broadcast&utm_campaign=talk-nov&utm_content=story', {
		headers: {
			'cf-connecting-ip': IP,
			'user-agent': UA,
			'accept-language': 'zh-tw,zh;q=0.9,en;q=0.8',
			referer: 'https://www.threads.com/@someone',
		},
		cf: {
			country: 'TW',
			region: 'Taipei City',
			city: 'Taipei',
			timezone: 'Asia/Taipei',
			colo: 'TPE',
			latitude: '25.04776',
			longitude: '121.53185',
			asn: 3462,
			asOrganization: 'Chunghwa Telecom',
		},
	})
}

describe('analytics events', () => {
	it('records the context of a visit in a fixed field order', async () => {
		const blobs = await eventBlobs(env, visit(), {
			kind: 'click',
			target: 'lens-link',
			source: 'instagram',
			day: '2026-10-31',
			hour: 14,
			slug: 'lens',
			url: 'https://example.com/lens/',
			page: 'main',
		})
		const field = (name: (typeof EVENT_FIELDS)[number]) => blobs[EVENT_FIELDS.indexOf(name)]
		expect(blobs).toHaveLength(EVENT_FIELDS.length)
		expect(field('kind')).toBe('click')
		expect(field('country')).toBe('TW')
		expect(field('city')).toBe('Taipei')
		expect(field('region')).toBe('Taipei City')
		expect(field('language')).toBe('zh-TW')
		expect(field('device')).toBe('mobile')
		expect(field('browser')).toBe('Instagram')
		expect(field('os')).toBe('iOS')
		expect(field('referrer')).toBe('threads.com')
		expect(field('slug')).toBe('lens')
		expect(field('url')).toBe('https://example.com/lens/')
		expect([field('utmSource'), field('utmMedium'), field('utmCampaign')]).toEqual(['line', 'broadcast', 'talk-nov'])
		expect(field('utmContent')).toBe('story')
		expect(field('visitor')).toMatch(/^[0-9a-f]{16}$/)
		expect(field('page')).toBe('main')
		expect(field('network')).toBe('Chunghwa Telecom')
		// Analytics Engine takes at most 20 blobs and 20 doubles per data point.
		expect(EVENT_FIELDS.length).toBeLessThanOrEqual(20)
		expect(EVENT_NUMBERS.length).toBeLessThanOrEqual(20)
	})

	it('keeps the place to a town and the network as its AS number', () => {
		const doubles = eventDoubles(visit(), { day: '2026-10-31', hour: 14 })
		const number = (name: (typeof EVENT_NUMBERS)[number]) => doubles[EVENT_NUMBERS.indexOf(name)]
		expect(doubles).toHaveLength(EVENT_NUMBERS.length)
		expect([number('day'), number('hour')]).toEqual([20261031, 14])
		expect([number('latitude'), number('longitude')]).toEqual([25, 121.5])
		expect(number('asn')).toBe(3462)
	})

	it('writes 0 when Cloudflare has no place or network', () => {
		const plain = new Request('https://bio.example/me', { cf: { latitude: 'abc', longitude: '999' } })
		const doubles = eventDoubles(plain, { day: '2026-10-31', hour: 0 })
		const unknown = ['latitude', 'longitude', 'asn'] as const
		expect(unknown.map((name) => doubles[EVENT_NUMBERS.indexOf(name)])).toEqual([0, 0, 0])
	})

	it("uses the short link's own UTM tags when the visit carried none", async () => {
		const plain = new Request('https://bio.example/talk', { headers: { 'user-agent': UA } })
		const blobs = await eventBlobs(env, plain, {
			kind: 'click',
			target: 'talk',
			source: 'direct',
			day: '2026-10-31',
			hour: 9,
			slug: 'talk',
			url: 'https://example.com',
			page: '',
			utm: { source: 'line', medium: 'broadcast', campaign: 'talk-nov', content: null },
		})
		expect(blobs[EVENT_FIELDS.indexOf('utmCampaign')]).toBe('talk-nov')
	})

	it('never stores the IP address, the user-agent string or precise coordinates', async () => {
		const input = { kind: 'view', target: 'main', source: 'threads', day: '2026-10-31', hour: 9, slug: 'me', url: '', page: 'main' } as const
		const blobs = await eventBlobs(env, visit(), input)
		const stored = [...blobs, ...eventDoubles(visit(), input).map(String)].join('\n')
		expect(stored).not.toContain(IP)
		expect(stored).not.toContain('203.0.113')
		expect(stored).not.toContain(UA)
		expect(stored).not.toContain('AppleWebKit')
		expect(stored).not.toContain('25.04')
		expect(stored).not.toContain('121.53')
	})

	it('gives the same visitor a new id the next day', async () => {
		const input = { kind: 'view' as const, target: 'main', source: 'direct', hour: 9, slug: 'me', url: '', page: 'main' }
		const today = await eventBlobs(env, visit(), { ...input, day: '2026-10-31' })
		const tomorrow = await eventBlobs(env, visit(), { ...input, day: '2026-11-01' })
		const index = EVENT_FIELDS.indexOf('visitor')
		expect(today[index]).not.toBe(tomorrow[index])
	})
})

describe('logs', () => {
	it('don’t keep a record of each request, which would hold its headers', () => {
		expect(config).toContain('logs: { invocationLogs: false }')
	})

	it('leaves the bindings that need a Cloudflare sign-in out of local development', () => {
		// Trying FluxBio on your own computer, before having an account, depends on this (AGENTS.md 1.2).
		// `cf dev --mode staging`, the test site on a computer, is not the mode "development": the command is asked too.
		expect(config).toContain("const local = mode === 'development' || command === 'dev'")
		const local = config.indexOf('const analytics = !local && own.analytics')
		expect(local).toBeGreaterThan(-1)
		const inProduction = config.slice(local)
		// Every Analytics binding hangs on that one answer, a second site's too.
		expect(inProduction.match(/analytics\s*\?/g)).toHaveLength(2)
		expect(inProduction).toContain('ANALYTICS: bindings.analyticsEngineDataset')
		expect(inProduction).toContain('ANALYTICS_SQL: bindings.analytics()')
		expect(config.slice(0, local)).not.toMatch(/ANALYTICS(_SQL)?: bindings\./)
		expect(config).not.toMatch(/remote: true/)
	})
})

describe('insights query caching and rollup', () => {
	const period = { from: '2026-10-01', to: '2026-10-30', previousFrom: '2026-09-01' }
	const clients = [
		{ device: 'mobile', os: 'iOS', browser: 'Safari', n: 10 },
		{ device: 'mobile', os: 'Android', browser: 'Chrome', n: 6 },
		{ device: 'desktop', os: 'macOS', browser: 'Chrome', n: 4 },
	]
	/** Analytics Engine, answering the device query with rows and everything else with none. */
	function analyticsEnv(answer: (query: string) => Promise<{ data: unknown[] }> | { data: unknown[] }) {
		const asked: string[] = []
		const mockEnv = {
			...env,
			ANALYTICS_DATASET: 'flux_bio',
			ANALYTICS_SQL: {
				async query({ query }: { query: string }) {
					asked.push(query)
					return answer(query)
				},
			},
		} as unknown as Env
		return { mockEnv, asked }
	}
	const withClients = (query: string) => ({ data: query.includes('GROUP BY device, os, browser') ? clients : [] })

	it('rolls up device/os/browser from one query and answers a repeated call within the minute from what it kept', async () => {
		clearInsightsCache()
		const { mockEnv, asked } = analyticsEnv(withClients)
		const first = await insights(mockEnv, { page: 'p1' }, period)
		expect(asked).toHaveLength(13)
		expect(first?.devices).toEqual([
			{ value: 'mobile', count: 16 },
			{ value: 'desktop', count: 4 },
		])
		expect(first?.os).toEqual([
			{ value: 'iOS', count: 10 },
			{ value: 'Android', count: 6 },
			{ value: 'macOS', count: 4 },
		])
		expect(first?.browsers).toEqual([
			{ value: 'Safari', count: 10 },
			{ value: 'Chrome', count: 10 },
		])
		// A follow-up makes no more queries, and another page or range asks for its own.
		expect(await insights(mockEnv, { page: 'p1' }, period)).toEqual(first)
		expect(asked).toHaveLength(13)
		await insights(mockEnv, { page: 'p2' }, period)
		expect(asked).toHaveLength(26)
		clearInsightsCache()
	})

	it('asks for every combination of device, system and browser, so no total falls short', async () => {
		clearInsightsCache()
		const { mockEnv, asked } = analyticsEnv(withClients)
		await insights(mockEnv, { page: 'p1' }, period)
		const limit = Number(/GROUP BY device, os, browser ORDER BY n DESC LIMIT (\d+)/.exec(asked.find((query) => query.includes('GROUP BY device, os, browser')) ?? '')?.[1])
		expect(limit).toBe(CLIENT_ROWS)
		// Every value the detectors can give: three devices, and each name a system or a browser can have.
		const names = (fn: (ua: string) => string) => new Set([...fn.toString().matchAll(/return ['"]([^'"]+)['"]/g)].map((match) => match[1])).size
		expect(names(detectOs)).toBeGreaterThan(3)
		expect(names(detectBrowser)).toBeGreaterThan(10)
		expect(3 * names(detectOs) * names(detectBrowser)).toBeLessThanOrEqual(CLIENT_ROWS)
		clearInsightsCache()
	})

	it('never hands one request another’s unfinished read: a request that is cancelled leaves nobody waiting', async () => {
		clearInsightsCache()
		// The first request's queries never answer, as when its client has gone.
		const stuck = analyticsEnv(() => new Promise<{ data: unknown[] }>(() => {}))
		void insights(stuck.mockEnv, { page: 'p1' }, period)
		const { mockEnv, asked } = analyticsEnv(withClients)
		const second = await Promise.race([insights(mockEnv, { page: 'p1' }, period), new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 2000))])
		expect(second).not.toBe('hung')
		expect(asked).toHaveLength(13)
		clearInsightsCache()
	})

	it('keeps no failed read', async () => {
		clearInsightsCache()
		let fail = true
		const { mockEnv, asked } = analyticsEnv((query) => {
			if (fail) throw new Error('Analytics Engine is away')
			return withClients(query)
		})
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
		expect(await insights(mockEnv, { page: 'p1' }, period)).toBeNull()
		logged.mockRestore()
		fail = false
		const before = asked.length
		expect((await insights(mockEnv, { page: 'p1' }, period))?.devices).toHaveLength(2)
		expect(asked.length).toBe(before + 13)
		clearInsightsCache()
	})
})
