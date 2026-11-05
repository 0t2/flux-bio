import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FontsResponse, PageJson, StateResponse } from '../src/shared/api'
import { emptyContent, newItem, PageContentSchema, storedContent, type PageContent } from '../src/shared/content'
import { findFont, fontAxis, headingWeight, searchFonts, FEATURED_FONTS, googleFonts } from '../src/shared/fonts'
import { pageCharacters, pageWebFonts, parseFaces } from '../src/worker/lib/fonts'
import { resolveAppearance } from '../src/templates/themes'
import { api, apiJson, visit } from './helpers'

describe('the Google Fonts list', () => {
	it('knows families by exact name, with their scripts and weights', () => {
		expect(googleFonts().length).toBeGreaterThan(1500)
		expect(findFont('Noto Sans TC')).toMatchObject({ category: 'sans-serif', variable: true })
		expect(findFont('Noto Sans TC')?.scripts).toContain('chinese-traditional')
		expect(findFont('Pacifico')?.weights).toEqual([400])
		expect(findFont('pacifico')).toBeNull()
		expect(findFont("Inter'); color: red")).toBeNull()
		for (const family of FEATURED_FONTS) expect(findFont(family), family).not.toBeNull()
	})

	it('asks only for weights a family has', () => {
		const inter = findFont('Inter')!
		const pacifico = findFont('Pacifico')!
		const wenkai = findFont('LXGW WenKai TC')!
		expect(fontAxis(inter, [400, 500, 600, 700])).toBe('400..700')
		expect(fontAxis(pacifico, [400, 500, 600, 700])).toBe('400')
		expect(fontAxis(wenkai, [400, 500, 600, 700])).toBe('400;700')
		expect(headingWeight(inter)).toBe(700)
		expect(headingWeight(pacifico)).toBe(400)
	})

	it('finds families by name, kind and script', () => {
		expect(searchFonts({ q: 'playfair' })[0]?.family).toBe('Playfair')
		expect(searchFonts({ q: 'playfair d' })[0]?.family).toBe('Playfair Display')
		expect(searchFonts({ q: 'mono' }).every((font) => font.family.toLowerCase().includes('mono'))).toBe(true)
		const traditional = searchFonts({ script: 'chinese-traditional' })
		expect(traditional.length).toBeGreaterThan(5)
		expect(traditional.every((font) => font.scripts.includes('chinese-traditional'))).toBe(true)
		expect(searchFonts({ category: 'handwriting' }).every((font) => font.category === 'handwriting')).toBe(true)
		expect(searchFonts({})[0]?.family).toBe(FEATURED_FONTS[0])
	})
})

describe('picked fonts', () => {
	const appearance = (patch: Partial<PageContent['appearance']>) => ({ ...emptyContent('x').appearance, theme: 'letter' as const, ...patch })

	it('come first, with the built-in font for characters they lack', () => {
		const look = resolveAppearance(appearance({ bodyFont: 'Inter', headFont: 'Pacifico' }), 'zh-TW')
		expect(look.vars['--body-font']).toMatch(/^'Inter', 'Noto Serif TC'/)
		expect(look.vars['--head-font']).toMatch(/^'Pacifico', 'Inter'/)
		expect(look.headWeight).toBe(400)
		expect(look.vars['--head-synthesis']).toBe('none')
		expect(look.webFonts).toEqual(
			expect.arrayContaining([
				{ family: 'Inter', axis: '400..700' },
				{ family: 'Pacifico', axis: '400' },
				{ family: 'Noto Serif TC', axis: '500..700' },
			]),
		)
		// An English page needs nothing else from a Latin font.
		const english = resolveAppearance(appearance({ bodyFont: 'Inter' }), 'en')
		expect(english.webFonts.map((font) => font.family)).not.toContain('Noto Serif TC')
		expect(english.vars['--head-font']).toMatch(/^'Inter'/)
	})

	it('are checked against the list when a draft is saved, and forgotten when the list loses them', async () => {
		const content = emptyContent('fonts')
		expect(PageContentSchema.safeParse({ ...content, appearance: { ...content.appearance, bodyFont: 'Comic Sans MS' } }).success).toBe(false)
		expect(PageContentSchema.safeParse({ ...content, appearance: { ...content.appearance, bodyFont: 'Inter' } }).success).toBe(true)
		const stored = storedContent({ ...content, appearance: { ...content.appearance, headFont: 'Gone Font', bodyFont: 'Inter' } })
		expect(PageContentSchema.parse(stored).appearance).toMatchObject({ headFont: '', bodyFont: 'Inter' })
	})
})

describe('characters a page can show', () => {
	it('include its text, the built-in text of its languages and ASCII', () => {
		const content = emptyContent('王小明')
		content.items = [{ ...newItem('hours'), id: 'hours-1' }]
		const chars = new Set(pageCharacters(content, ['zh-TW', 'en']))
		for (const char of '王小明營業中休息中打烊開門AZaz09@') expect(chars.has(char), char).toBe(true)
		expect(chars.has('円')).toBe(false)
	})

	it('cover every family the page uses in any of its languages', () => {
		const content = emptyContent('x')
		content.appearance.font = 'sans'
		// A built-in font replaces the theme's heading face; the page's other language uses the visitor's own.
		expect(pageWebFonts(content, ['en', 'ja']).map((font) => font.family)).toEqual(['Noto Sans TC'])
		content.appearance = { ...content.appearance, font: 'auto', theme: 'brutal' }
		expect(pageWebFonts(content, ['en', 'ja']).map((font) => font.family)).toEqual(expect.arrayContaining(['Noto Sans TC', 'Plus Jakarta Sans']))
	})

	it('read faces out of Google’s CSS, and only files from Google', () => {
		const css = `@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400 700; src: url(https://fonts.gstatic.com/l/font?kit=abc&v=1) format('woff2'); }
@font-face { font-family: 'X'; font-weight: 400; src: url(https://evil.example/x.woff2) format('woff2'); }`
		expect(parseFaces(css)).toEqual([{ weight: '400 700', src: 'https://fonts.gstatic.com/l/font?kit=abc&v=1' }])
	})
})

describe('fonts on published pages', () => {
	const requests: string[] = []
	let googleUp = true

	/** Stands in for Google Fonts: one face per weight asked for, or one variable face for a range. */
	function fakeGoogle(url: URL): Response {
		requests.push(url.href)
		if (!googleUp) return new Response('down', { status: 503 })
		if (url.host === 'fonts.gstatic.com') return new Response(`wOF2 ${url.searchParams.get('kit')}`, { headers: { 'content-type': 'font/woff2' } })
		const [family = '', axis = ''] = (url.searchParams.get('family') ?? '').split(':wght@')
		const weights = axis.includes('..') ? [axis.replace('..', ' ')] : axis.split(';')
		const text = url.searchParams.get('text') ?? ''
		return new Response(
			weights
				.map(
					(weight) =>
						`@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url(https://fonts.gstatic.com/l/font?kit=${encodeURIComponent(`${family}-${weight}-${text.length}`)}&v=1) format('woff2'); }`,
				)
				.join('\n'),
			{ headers: { 'content-type': 'text/css' } },
		)
	}

	let pageId = ''
	const handle = 'typefaces'

	beforeAll(async () => {
		const network = globalThis.fetch
		vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input))
			if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') return Promise.resolve(fakeGoogle(url))
			return network(input, init)
		})
		const { settings } = await apiJson<StateResponse>('/state')
		await api('/settings', { method: 'PUT', json: { ...settings, locale: 'zh-TW', languages: [] } })
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle, name: '字體測試' } })
		pageId = page.id
	})

	async function publish(patch: (content: PageContent) => void): Promise<void> {
		const { page } = await apiJson<{ page: PageJson }>(`/pages/${pageId}`)
		const draft = structuredClone(page.draft)
		patch(draft)
		expect((await api(`/pages/${pageId}/draft`, { method: 'PUT', json: draft })).status).toBe(200)
		expect((await api(`/pages/${pageId}/publish`, { method: 'POST' })).status).toBe(200)
	}

	const fontFiles = (html: string) => [...html.matchAll(/url\((\/_fonts\/[^)]+)\)/g)].map((match) => match[1] ?? '')

	async function setHosting(hostFonts: boolean): Promise<void> {
		const { settings } = await apiJson<StateResponse>('/state')
		const response = await api('/settings', { method: 'PUT', json: { ...settings, hostFonts } })
		expect(response.status, await response.clone().text()).toBe(200)
	}

	it('load from Google by default, which costs this site nothing', async () => {
		requests.length = 0
		await publish((content) => {
			content.appearance.bodyFont = 'Inter'
			content.appearance.headFont = 'Pacifico'
		})
		expect(requests).toEqual([])
		const html = await (await visit(`/${handle}`)).text()
		expect(html).toContain('https://fonts.googleapis.com/css2?')
		expect(html).toContain('family=Pacifico:wght@400')
		expect(fontFiles(html)).toEqual([])
	})

	it('load from this Worker, never from Google, once the switch is on', async () => {
		requests.length = 0
		// Turning it on copies the fonts of pages already published.
		await setHosting(true)
		expect(requests.some((url) => url.includes('family=Inter:wght@400..700'))).toBe(true)
		const css = requests.find((url) => url.includes('family=Inter'))!
		// The page's own characters and its built-in text are asked for; a Latin family isn't asked for Chinese.
		expect(decodeURIComponent(css)).toContain('abcdefghijklmnopqrstuvwxyz')
		expect(decodeURIComponent(css)).not.toContain('字')
		const chinese = decodeURIComponent(requests.find((url) => url.includes('Noto+Sans+TC'))!)
		for (const char of '字體測試營業中打烊') expect(chinese, char).toContain(char)

		const html = await (await visit(`/${handle}`)).text()
		expect(html).toContain("@font-face{font-family:'Inter';font-style:normal;font-weight:400 700;font-display:swap;src:url(/_fonts/")
		expect(html).toContain("font-family:'Pacifico'")
		expect(html).not.toContain('fonts.googleapis.com')
		expect(html).not.toContain('fonts.gstatic.com')

		const files = fontFiles(html)
		expect(files.length).toBeGreaterThanOrEqual(3)
		const file = await visit(files[0]!)
		expect(file.status).toBe(200)
		expect(file.headers.get('content-type')).toBe('font/woff2')
		expect(file.headers.get('cache-control')).toContain('immutable')
		expect(new TextDecoder().decode(await file.arrayBuffer())).toMatch(/^wOF2 /)
	})

	it('keep their files while nothing they draw changes, and drop the old ones when it does', async () => {
		const before = fontFiles(await (await visit(`/${handle}`)).text())
		requests.length = 0
		await publish((content) => {
			content.showBadge = !content.showBadge
		})
		expect(requests).toEqual([])
		expect(fontFiles(await (await visit(`/${handle}`)).text())).toEqual(before)

		await publish((content) => {
			content.profile.bio = 'Ünïcödé 新的字'
		})
		expect(requests.length).toBeGreaterThan(0)
		const after = fontFiles(await (await visit(`/${handle}`)).text())
		expect(after).not.toEqual(before)
		for (const file of after) expect((await visit(file)).status).toBe(200)
		const gone = before.filter((file) => !after.includes(file))
		expect(gone.length).toBeGreaterThan(0)
		for (const file of gone) expect((await visit(file)).status).toBe(404)
	})

	it('fall back to the visitor’s own fonts, not Google, when Google could not be reached', async () => {
		googleUp = false
		await publish((content) => {
			content.profile.bio = '換了內容'
		})
		googleUp = true
		const html = await (await visit(`/${handle}`)).text()
		expect(html).not.toContain('fonts.googleapis.com')
		expect(html).not.toContain('@font-face')
		expect(fontFiles(html)).toEqual([])
	})

	it('are copied again when the site gets another language', async () => {
		await publish((content) => {
			content.profile.bio = '再發布一次'
		})
		requests.length = 0
		const { settings } = await apiJson<StateResponse>('/state')
		const response = await api('/settings', { method: 'PUT', json: { ...settings, languages: ['ja'] } })
		expect(response.status, await response.clone().text()).toBe(200)
		// Japanese words, in characters (sorted by code point, so not as words).
		const asked = decodeURIComponent(requests.find((url) => url.includes('Noto+Sans+TC'))!)
		for (const char of '営まで') expect(asked, char).toContain(char)
		expect(fontFiles(await (await visit(`/${handle}`)).text()).length).toBeGreaterThan(0)
	})

	it('go back to Google, and their files away, when the switch is turned off', async () => {
		const files = fontFiles(await (await visit(`/${handle}`)).text())
		expect(files.length).toBeGreaterThan(0)
		requests.length = 0
		await setHosting(false)
		expect(requests).toEqual([])
		const html = await (await visit(`/${handle}`)).text()
		expect(html).toContain('https://fonts.googleapis.com/css2?')
		expect(fontFiles(html)).toEqual([])
		for (const file of files) expect((await visit(file)).status).toBe(404)
		await setHosting(true)
	})

	it('are not loaded on system pages, which use the visitor’s own fonts', async () => {
		const html = await (await visit('/no-such-page-here')).text()
		expect(html).not.toContain('fonts.googleapis.com')
		expect(html).not.toContain('/_fonts/')
	})

	it('serve nothing for names that are not font files', async () => {
		expect((await visit('/_fonts/../../secret.woff2')).status).toBe(404)
		expect((await visit('/_fonts/abc.css')).status).toBe(404)
	})
})

describe('GET /api/fonts', () => {
	it('searches the list for agents', async () => {
		const found = await apiJson<FontsResponse>('/fonts?q=noto%20sans&script=chinese-traditional&limit=5')
		expect(found.fonts[0]?.family).toBe('Noto Sans TC')
		expect(found.fonts.length).toBeLessThanOrEqual(5)
		expect(found.total).toBeGreaterThanOrEqual(found.fonts.length)
		const handwriting = await apiJson<FontsResponse>('/fonts?category=handwriting')
		expect(handwriting.fonts).toHaveLength(20)
		expect(handwriting.fonts.every((font) => font.category === 'handwriting')).toBe(true)
	})
})
