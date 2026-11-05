import { expect, it } from 'vitest'
import type { PageJson, PublishResponse, StateResponse } from '../src/shared/api'
import { defaultContent, emptyLink } from '../src/shared/content'
import { apiJson, visit } from './helpers'

// Runs against an empty database, the way a script or AI agent sets up a new instance.
it('starts with no pages, then publishes the first one at "/"', async () => {
	expect((await apiJson<StateResponse>('/state')).pages).toEqual([])
	// A new install speaks English until the owner picks the page language.
	expect(await (await visit('/')).text()).toContain('Open the dashboard')

	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'fresh', name: 'Fresh install' } })
	const draft = defaultContent()
	draft.profile.name = 'Fresh install'
	draft.items = [{ ...emptyLink(), id: 'first-link', title: 'First', url: 'https://example.com/first', slug: 'first' }]
	await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: draft })
	const published = await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
	expect(published.content.profile.name).toBe('Fresh install')
	expect((await visit('/')).status).toBe(200)
	expect((await visit('/first')).headers.get('location')).toBe('https://example.com/first')
})
