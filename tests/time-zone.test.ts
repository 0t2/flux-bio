import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { StateResponse } from '../src/shared/api'
import { emptyContent, emptyLink, newItem, type Settings } from '../src/shared/content'
import { dayIn } from '../src/shared/time'
import { api, apiJson, visit } from './helpers'

// In KV the time zone lives in the "site" record only, so changing it rewrites no short link or page copy.

async function save(patch: Partial<Settings>): Promise<void> {
	const { settings } = await apiJson<StateResponse>('/state')
	await apiJson('/settings', { method: 'PUT', json: { ...settings, ...patch } })
}

const daysCounted = async (target: string) =>
	(await env.DB.prepare('SELECT day FROM stats WHERE target = ?1 ORDER BY day').bind(target).all<{ day: string }>()).results.map((row) => row.day)

describe('time zone', () => {
	// 25 hours apart, so their dates always differ.
	const EAST = 'Pacific/Kiritimati'
	const WEST = 'Pacific/Pago_Pago'

	it('counts clicks in the new time zone without touching the short links', async () => {
		await save({ timezone: WEST })
		const { link } = await apiJson<{ link: { id: string } }>('/links', { method: 'POST', json: { url: 'https://example.com/tz', slug: 'tz-link' } })
		const before = await env.KV.get('name:tz-link')
		await save({ timezone: EAST })
		// The copy visitors read is as it was: nothing in it depends on the time zone.
		expect(await env.KV.get('name:tz-link')).toBe(before)
		expect(before).not.toContain('Pacific')
		const { status } = await visit('/tz-link')
		expect(status).toBe(302)
		expect(await daysCounted(link.id)).toEqual([dayIn(EAST, Date.now())])
	})

	it('rebuilds a site record in a shape this version does not write', async () => {
		await save({ timezone: EAST })
		const site = JSON.parse((await env.KV.get('site')) ?? '{}') as Record<string, unknown>
		expect(site.timezone).toBe(EAST)
		await env.KV.put('site', JSON.stringify({ ...site, v: 2, timezone: undefined }))
		await visit('/')
		expect(JSON.parse((await env.KV.get('site')) ?? '{}')).toMatchObject({ v: 3, timezone: EAST })
	})

	it('shows opening hours in the new time zone without rewriting the page', async () => {
		await save({ timezone: WEST })
		const content = emptyContent('Hours')
		content.items = [{ ...newItem('hours'), id: 'tz-hours' }, { ...emptyLink(), id: 'tz-hours-link', title: 'Go', url: 'https://example.com/go', slug: 'tz-go' }]
		const { page } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle: 'tz-page', name: 'Hours' } })
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: content })
		expect((await api(`/pages/${page.id}/publish`, { method: 'POST' })).ok).toBe(true)
		const snapshot = await env.KV.get('name:tz-page')
		await save({ timezone: EAST })
		expect(await env.KV.get('name:tz-page')).toBe(snapshot)
		expect((await visit('/tz-page')).status).toBe(200)
		expect(await daysCounted(page.id)).toEqual([dayIn(EAST, Date.now())])
	})
})
