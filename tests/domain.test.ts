import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import type { StateResponse } from '../src/shared/api'
import app from '../src/worker/index'
import { api, apiJson, call, ORIGIN } from './helpers'

// A custom domain is checked by asking it for this deployment's signature. A Worker's request to a hostname on its own
// zone used to go to the zone's origin, which a custom domain doesn't have, so the check failed with 522 on exactly
// the domains it was for. A request that arrives at the domain has already shown it reaches this Worker.

const host = new URL(ORIGIN).hostname

describe('the custom domain check', () => {
	it('passes for the domain the request came in at, without asking it', async () => {
		const result = await apiJson<{ ok: boolean; domain: string }>('/settings/verify-domain', { method: 'POST', json: { domain: host } })
		expect(result).toMatchObject({ ok: true, domain: host })
	})

	it('lets the domain the dashboard is open at be saved', async () => {
		await apiJson('/settings', { method: 'PUT', json: { domain: host } })
		expect((await apiJson<StateResponse>('/state')).settings.domain).toBe(host)
		await apiJson('/settings', { method: 'PUT', json: { domain: '' } })
	})

	it('still asks any other domain', async () => {
		// What a hostname that doesn't reach this Worker answers. Tests don't go out to the network.
		const asked: string[] = []
		vi.mocked(fetch).mockImplementationOnce((input) => {
			asked.push(new URL(input instanceof Request ? input.url : String(input)).hostname)
			return Promise.resolve(new Response('', { status: 522 }))
		})
		const result = await apiJson<{ ok: boolean; params: { status: number } }>('/settings/verify-domain', { method: 'POST', json: { domain: 'elsewhere.example' } })
		expect(asked).toEqual(['elsewhere.example'])
		expect(result).toMatchObject({ ok: false, params: { status: 522 } })
	})

	it('accepts a second hostname that reaches the same site', async () => {
		const domain = 'alias.example'
		vi.mocked(fetch).mockImplementationOnce(async (input) => {
			const ctx = createExecutionContext()
			const response = await app.fetch(new Request(input), env, ctx)
			await waitOnExecutionContext(ctx)
			return response
		})
		expect(await apiJson('/settings/verify-domain', { method: 'POST', json: { domain } })).toMatchObject({ ok: true, domain })
	})

	it('rejects another hostname that only relays the public ping', async () => {
		vi.mocked(fetch).mockImplementationOnce((input) => {
			const url = new URL(input instanceof Request ? input.url : String(input))
			return call(url.pathname + url.search)
		})
		const response = await api('/settings', { method: 'PUT', json: { domain: 'relay.example' } })
		expect(response.status).toBe(400)
		expect((await apiJson<StateResponse>('/state')).settings.domain).toBe('')
	})
})
