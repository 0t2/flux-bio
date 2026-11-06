import { describe, expect, it } from 'vitest'
import type { PageJson } from '../src/shared/api'
import { apiJson } from './helpers'

// An AI building a look through the API sends the theme and what it means to change: the rest is the theme's own.

describe('an appearance with only some of its fields', () => {
	it('is saved with the theme\'s own colors, fonts and no pictures for what was left out', async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'partial-look', name: 'Mei' } })
		const appearance = { theme: 'jelly', accent: '#fedb8a', font: 'mono', button: 'shadow', showSocial: true }
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...page.draft, appearance } })
		const saved = (await apiJson<{ page: PageJson }>(`/pages/${page.id}`)).page.draft.appearance
		expect(saved).toEqual({ ...appearance, accent2: '', bg: '', fg: '', headFont: '', bodyFont: '', coverImage: null, bgImage: null, bgDim: 0.75, bgTile: 0 })
	})
})
