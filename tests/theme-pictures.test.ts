import { beforeAll, describe, expect, it } from 'vitest'
import type { CommunityThemesResponse, PageJson, ThemesResponse } from '../src/shared/api'
import { appearanceFromPreset, emptyContent, emptyLink, THEME_IDS, type SavedTheme } from '../src/shared/content'
import { THEME_WORDS } from '../src/shared/serverWords'
import { THEMES } from '../src/templates/themes'
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

	it('can be saved from an appearance as it is, where null is no picture', async () => {
		const { page } = await apiJson<{ page: PageJson }>(`/pages/${pageId}`)
		const { theme: base, ...appearance } = { ...page.draft.appearance, coverImage: null, bgImage: null }
		const { theme } = await apiJson<{ theme: SavedTheme }>('/themes', { method: 'POST', json: { ...appearance, name: 'As it is', base } })
		expect(theme).toMatchObject({ name: 'As it is', base })
		expect(theme.coverImage ?? null).toBeNull()
		expect(theme.bgImage ?? null).toBeNull()
		// Put back on a page, a look with no pictures leaves the page's own cover, and has no background picture.
		const back = appearanceFromPreset(theme, { ...page.draft.appearance, coverImage: cover, bgImage: background })
		expect(back).toMatchObject({ coverImage: cover, bgImage: null })
		// Something that isn't a picture's id still isn't one.
		expect((await api('/themes', { method: 'POST', json: { ...appearance, name: 'Bad', base, bgImage: '../secret' } })).status).toBe(400)
	})

	it('is explained to the AI', async () => {
		const guide = await (await visit('/api/guide/look')).text()
		for (const word of ['**Make a theme.**', '`coverImage`', '`bgImage`', '`bgDim`', 'POST /api/media', 'POST /api/themes']) expect(guide).toContain(word)
	})
})

describe('the themes by name', () => {
	const dictionaries = import.meta.glob<Record<string, string>>('../src/admin/i18n/locales/*.json', { import: 'default', eager: true })

	it('are named as the dashboard names them, in the language asked for, else the page language', async () => {
		const english = await apiJson<CommunityThemesResponse>('/themes/community')
		expect(english.lang).toBe('en')
		expect(english.bases.map((base) => base.id)).toEqual([...THEME_IDS])
		expect(english.bases.find((base) => base.id === 'jelly')).toEqual({ id: 'jelly', name: 'Candy', en: 'Candy' })
		expect(english.themes.length).toBeGreaterThan(THEME_IDS.length)

		const chinese = await apiJson<CommunityThemesResponse>('/themes/community?lang=zh-TW')
		expect(chinese.lang).toBe('zh-TW')
		expect(chinese.bases.find((base) => base.id === 'jelly')).toEqual({ id: 'jelly', name: THEMES.jelly.label, en: 'Candy' })
		// A tag as a browser writes it is read as the language it stands for.
		const japanese = await apiJson<CommunityThemesResponse>('/themes/community?lang=ja-JP')
		expect(japanese.lang).toBe('ja')
		const ja = dictionaries['../src/admin/i18n/locales/ja.json']!
		for (const base of japanese.bases) expect(base.name, base.id).toBe(ja[THEMES[base.id].label])
		// One it doesn't know gets the page language.
		expect((await apiJson<CommunityThemesResponse>('/themes/community?lang=xx')).lang).toBe('en')
	})

	it('have a name in every language the dashboard has, the same as there', () => {
		// If this fails: pnpm i18n server
		for (const [path, words] of Object.entries(dictionaries)) {
			const code = path.match(/([\w-]+)\.json$/)![1]! as keyof typeof THEME_WORDS
			for (const id of THEME_IDS) expect(THEME_WORDS[code]?.[THEMES[id].label], `${code}: ${id}`).toBe(words[THEMES[id].label])
		}
	})

	it('are explained to the AI, with where to see every theme', async () => {
		const look = await (await visit('/api/guide/look')).text()
		for (const part of ['/api/themes/community?lang=', '`{ source, lang, bases, themes }`', 'https://fluxbio.link/<code>/#themes', 'https://fluxbio.link/preview/<code>/<theme id>']) expect(look).toContain(part)
		const customize = await (await visit('/api/guide/customize')).text()
		expect(customize).toContain('https://fluxbio.link/en/#themes')
	})
})
