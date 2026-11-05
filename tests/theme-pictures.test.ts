import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson, ThemesResponse } from '../src/shared/api'
import { emptyContent, emptyLink, type SavedTheme } from '../src/shared/content'
import { api, apiJson, visit } from './helpers'

// An AI makes a theme through the API: pictures, colors, fonts, then saved for later.
const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

async function upload(): Promise<string> {
	const response = await api('/media', { method: 'POST', body: PIXEL, headers: { 'content-type': 'image/png' } })
	expect(response.status).toBe(201)
	return ((await response.json()) as { id: string }).id
}

describe('a theme made by an AI', () => {
	let pageId = ''
	let cover = ''
	let background = ''

	beforeAll(async () => {
		await apiJson('/pages', { method: 'POST', json: { handle: 'first', name: 'First' } })
		pageId = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'picture-page', name: 'Pictures' } })).page.id
		cover = await upload()
		background = await upload()
	})

	it('goes on the draft and is public once published', async () => {
		const content = emptyContent('Pictures')
		content.items = [{ ...emptyLink(), id: 'pic-link-1', title: 'Shop', url: 'https://example.com/a', slug: 'pic-shop' }]
		content.appearance = { ...content.appearance, theme: 'liquid', accent: '#FFCC00', bg: '#101820', fg: '#F2F2F2', headFont: 'Inter', coverImage: cover, bgImage: background, bgDim: 0.85 }
		await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: content })
		await apiJson(`/pages/${pageId}/publish`, { method: 'POST' })
		const html = await (await visit('/picture-page')).text()
		expect(html).toContain(`<figure class="cover"><img src="/media/${cover}" alt=""></figure>`)
		expect(html).toContain(`style="--dim:0.85"`)
		expect(html).toContain('--bg:#101820')
	})

	it('refuses a background picture that would hide the text, and an id that is no id', async () => {
		const content = emptyContent('Pictures')
		for (const patch of [{ bgDim: 0.1 }, { bgDim: 1 }, { coverImage: '<script>' }, { bgImage: '../secret' }]) {
			const response = await api(`/pages/${pageId}/draft`, { method: 'PUT', json: { ...content, appearance: { ...content.appearance, ...patch } } })
			expect(response.status, JSON.stringify(patch)).toBe(400)
		}
	})

	it('can be saved with its pictures, and a backup lists them', async () => {
		const third = await upload()
		const { theme } = await apiJson<{ theme: SavedTheme }>('/themes', {
			method: 'POST',
			json: { name: 'From the photo', base: 'liquid', accent: '#FFCC00', bg: '#101820', font: 'auto', button: 'auto', coverImage: third, bgImage: background, bgDim: 0.85 },
		})
		expect(theme).toMatchObject({ coverImage: third, bgImage: background, bgDim: 0.85 })
		const { themes } = await apiJson<ThemesResponse>('/themes')
		expect(themes.find((saved) => saved.id === theme.id)).toMatchObject({ coverImage: third })
		const backup = await apiJson<{ media: string[] }>('/export')
		for (const id of [cover, background, third]) expect(backup.media).toContain(id)
	})

	it('is explained to the AI', async () => {
		const guide = await (await visit('/api/guide/look')).text()
		for (const word of ['**Make a theme.**', '`coverImage`', '`bgImage`', '`bgDim`', 'POST /api/media', 'POST /api/themes']) expect(guide).toContain(word)
	})
})
