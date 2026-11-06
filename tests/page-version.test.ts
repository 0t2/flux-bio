import { describe, expect, it } from 'vitest'
import type { PageJson } from '../src/shared/api'
import { api, apiJson } from './helpers'

// The dashboard asks whether a draft has moved on every time its window comes back. Holding the version already,
// it gets a short answer while that is still the one, and the page only once it isn't.

describe('reading a page whose version the caller holds', () => {
	const read = (id: string, held: string) => api(`/pages/${id}`, { headers: { 'if-none-match': held } })

	it('answers 304 with nothing in it while the draft is the same, and the page once it has changed', async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'version-page', name: 'Mei' } })
		const same = await read(page.id, `"${page.draftUpdatedAt}"`)
		expect(same.status).toBe(304)
		expect(await same.text()).toBe('')
		// Nothing may keep this answer and give it in the Worker's place: the version says nothing of the page's address.
		expect(same.headers.get('cache-control')).toBe('no-store')
		expect(same.headers.get('etag')).toBeNull()
		expect((await read(page.id, String(page.draftUpdatedAt))).status).toBe(304)

		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...page.draft, profile: { ...page.draft.profile, bio: 'Changed' } } })
		const changed = await read(page.id, `"${page.draftUpdatedAt}"`)
		expect(changed.status).toBe(200)
		const fresh = ((await changed.json()) as { page: PageJson }).page
		expect(fresh.draft.profile.bio).toBe('Changed')
		expect(fresh.draftUpdatedAt).toBeGreaterThan(page.draftUpdatedAt)
		expect(changed.headers.get('etag')).toBeNull()
	})

	it('moves on with a publish too, which is what the dashboard needs to see', async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'version-publish', name: 'Kai' } })
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		expect((await read(page.id, `"${page.draftUpdatedAt}"`)).status).toBe(200)
	})

	it('reads as usual without a version, with one that is no number, and for a page that is not there', async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'version-plain', name: 'Wen' } })
		expect((await api(`/pages/${page.id}`)).status).toBe(200)
		expect((await read(page.id, '"*"')).status).toBe(200)
		expect((await read('no-such-page', '"1"')).status).toBe(404)
	})
})
