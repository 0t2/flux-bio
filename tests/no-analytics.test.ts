import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { LinkJson, PageJson } from '../src/shared/api'
import app from '../src/worker/index'
import { apiJson, IPHONE, ORIGIN, PASSWORD } from './helpers'

// A new Cloudflare account may not be able to turn on Analytics Engine. AGENTS.md then has the owner
// deploy without its two bindings, and promises that views and clicks still count.
const bare = { ...env, ANALYTICS: undefined, ANALYTICS_SQL: undefined } as unknown as typeof env

async function call(path: string, init: RequestInit = {}) {
	const ctx = createExecutionContext()
	const response = await app.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init }), bare, ctx)
	await waitOnExecutionContext(ctx)
	return response
}

const asOwner = (path: string) => call(path, { headers: { authorization: `Bearer ${PASSWORD}` } })
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

describe('a site without Analytics Engine', () => {
	it('still shows pages, redirects and counts views and clicks, with no detailed stats', async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'bare-page', name: 'Bare' } })
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		const { link } = await apiJson<{ link: LinkJson }>('/links', { method: 'POST', json: { url: 'https://example.com/bare', slug: 'bare-link' } })

		const visit = await call('/bare-page', { headers: { 'user-agent': IPHONE } })
		expect(visit.status).toBe(200)
		const click = await call('/bare-link', { headers: { 'user-agent': IPHONE } })
		expect(click.status).toBe(302)

		const stats = (await (await asOwner(`/api/stats?page=${page.id}&days=7`)).json()) as { views: number[]; insights: unknown }
		expect(sum(stats.views)).toBe(1)
		expect(stats.insights).toBeNull()
		const linkStats = (await (await asOwner(`/api/links/${link.id}/stats?days=7`)).json()) as Record<string, unknown>
		expect(JSON.stringify(linkStats)).toMatch(/"total":1|"clicks":\[[0,]*1/)
	})
})
