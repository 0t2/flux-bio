import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import config from '../cloudflare.config.ts?raw'
import { EVENT_FIELDS, EVENT_NUMBERS, eventBlobs, eventDoubles } from '../src/worker/lib/analytics'

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
		const local = config.indexOf("mode === 'development'")
		expect(local).toBeGreaterThan(-1)
		const inProduction = config.slice(local)
		expect(inProduction).toContain('ANALYTICS: bindings.analyticsEngineDataset')
		expect(inProduction).toContain('ANALYTICS_SQL: bindings.analytics()')
		expect(config.slice(0, local)).not.toMatch(/ANALYTICS(_SQL)?: bindings\./)
		expect(config).not.toMatch(/remote: true/)
	})
})
