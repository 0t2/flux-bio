import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson, PreviewLinkResponse, PublishResponse, StateResponse } from '../src/shared/api'
import { emptyContent, emptyLink, newItem, PageContentSchema, type PageContent } from '../src/shared/content'
import { localizedContent, pageTexts, translatedLocales, untranslated, usedTranslations } from '../src/shared/translations'
import { pageCharacters } from '../src/worker/lib/fonts'
import { api, apiJson, visit } from './helpers'

function shop(): PageContent {
	const content = emptyContent('小店')
	content.profile.bio = '手沖咖啡'
	content.seo.title = '小店的咖啡'
	content.items = [
		{ ...emptyLink(), id: 'link-menu', title: '菜單', subtitle: '每週更新', url: 'https://example.com/menu', slug: 'menu' },
		{ ...newItem('heading'), id: 'head-beans', title: '咖啡豆' },
		{
			...newItem('product'),
			id: 'prod-beans',
			title: '本週推薦',
			products: [{ id: 'bean-1', name: '耶加雪菲', price: '160', image: null, url: 'https://example.com/beans' }],
		},
		{ ...newItem('hours'), id: 'hours-1', title: '營業時間', note: '週一公休', address: '台北市中山區南京東路一段 1 號', phone: '02-1234 5678' },
	]
	return content
}

describe('what gets translated', () => {
	it('is the text visitors read, each once, without addresses, phone numbers, URLs or bare numbers', () => {
		const content = shop()
		content.items.push({ ...emptyLink(), id: 'link-again', title: '菜單', url: 'https://example.com/again' })
		const texts = pageTexts(content)
		expect(texts).toEqual(['小店', '手沖咖啡', '小店的咖啡', '菜單', '每週更新', '咖啡豆', '本週推薦', '耶加雪菲', '營業時間', '週一公休'])
	})
})

describe('a page in another language', () => {
	const content: PageContent = { ...shop(), translations: { en: { 小店: 'The Shop', 菜單: 'Menu', 週一公休: 'Closed on Mondays' } } }

	it('uses the translations it has and the original for the rest', () => {
		const english = localizedContent(content, 'en')
		expect(english.profile.name).toBe('The Shop')
		expect(english.profile.bio).toBe('手沖咖啡')
		expect(english.items[0]).toMatchObject({ title: 'Menu', url: 'https://example.com/menu', slug: 'menu' })
		expect(english.items[3]).toMatchObject({ note: 'Closed on Mondays', address: '台北市中山區南京東路一段 1 號' })
	})

	it('leaves the source and other languages alone', () => {
		expect(localizedContent(content, 'ja')).toBe(content)
		localizedContent(content, 'en')
		expect(content.profile.name).toBe('小店')
	})

	it('never takes a blank translation or something off the prototype', () => {
		const odd = emptyContent('constructor')
		odd.profile.bio = 'toString'
		expect(untranslated(odd, ['en']).en).toEqual(['constructor', 'toString'])
		expect(localizedContent({ ...odd, translations: { en: {} } }, 'en').profile.name).toBe('constructor')
		const blank = { ...emptyContent('小店'), translations: { en: { 小店: '  ' } } }
		expect(localizedContent(blank, 'en').profile.name).toBe('小店')
		expect(untranslated(blank, ['en']).en).toEqual(['小店'])
	})

	it('shows a text as untranslated again once it changes', () => {
		const words = Object.fromEntries(pageTexts(shop()).map((text) => [text, `${text} EN`]))
		const done: PageContent = { ...shop(), translations: { en: words } }
		expect(untranslated(done, ['en']).en).toEqual([])
		expect(translatedLocales(done, ['en', 'ja'])).toEqual(['en'])
		done.profile.bio = '手沖咖啡與甜點'
		expect(untranslated(done, ['en']).en).toEqual(['手沖咖啡與甜點'])
		expect(translatedLocales(done, ['en'])).toEqual([])
	})

	it('drops texts no longer on the page, and keeps languages turned off', () => {
		const stale: PageContent = { ...emptyContent('小店'), translations: { en: { 小店: 'Shop', 舊標題: 'Old' }, ja: { 舊標題: '古い' }, ko: { 小店: '가게' } } }
		expect(usedTranslations(stale)).toEqual({ en: { 小店: 'Shop' }, ko: { 小店: '가게' } })
		expect(usedTranslations(emptyContent('小店'))).toBeUndefined()
	})

	it('accepts long translations, up to a limit', () => {
		const ok = (translations: unknown) => PageContentSchema.safeParse({ ...emptyContent('x'), translations }).success
		expect(ok({ de: { 短: 'x'.repeat(1000) } })).toBe(true)
		expect(ok({ de: { 短: 'x'.repeat(1001) } })).toBe(false)
		expect(ok({ de: { ['x'.repeat(281)]: 'y' } })).toBe(false)
		expect(ok({ tlh: { 短: 'y' } })).toBe(false)
		expect(PageContentSchema.parse(emptyContent('x'))).not.toHaveProperty('translations')
	})

	it('asks for the characters of its translations when fonts are copied', () => {
		const chars = new Set(pageCharacters({ ...emptyContent('小店'), translations: { ko: { 小店: '가게' } } }, ['zh-TW', 'ko']))
		for (const char of '小店가게') expect(chars.has(char), char).toBe(true)
	})
})

describe('through the API and on the public page', () => {
	let pageId = ''
	const publish = () => apiJson<PublishResponse>(`/pages/${pageId}/publish`, { method: 'POST' })
	const draft = async () => (await apiJson<{ page: PageJson }>(`/pages/${pageId}`)).page
	const browse = (path: string, language?: string) => visit(path, undefined, language ? { headers: { 'accept-language': language } } : {})

	beforeAll(async () => {
		const { settings } = await apiJson<StateResponse>('/state')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, locale: 'zh-TW', languages: ['en', 'ja'] } })
		// The first page becomes the home page, whose address is "/".
		await apiJson('/pages', { method: 'POST', json: { handle: 'first', name: 'First' } })
		pageId = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'cafe', name: '小店' } })).page.id
		await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: shop() })
	})

	it('says what is left to translate, per language', async () => {
		const { untranslated: left } = await draft()
		expect(left?.en).toContain('菜單')
		expect(left?.ja).toContain('菜單')
		expect(left).not.toHaveProperty('zh-TW')
		const { pages } = await apiJson<StateResponse>('/state')
		expect(pages.find((page) => page.id === pageId)?.untranslated).toBe(pageTexts(shop()).length * 2)
		expect((await publish()).untranslated.en).toContain('菜單')
	})

	it('serves visitors their language, and the original for what has no translation', async () => {
		const words = Object.fromEntries(pageTexts(shop()).map((text) => [text, `${text}-EN`]))
		const page = await draft()
		await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: { ...page.draft, translations: { en: { ...words, 小店: 'The <b>Shop</b>' }, ja: { 小店: '小さな店' } } } })

		// A draft is not public until it is published, but its preview shows it.
		expect(await (await browse('/cafe', 'en')).text()).not.toContain('The &lt;b&gt;Shop')
		expect(await (await api(`/pages/${pageId}/preview?lang=en`)).text()).toContain('The &lt;b&gt;Shop')
		const { url } = await apiJson<PreviewLinkResponse>(`/pages/${pageId}/preview-link`, { method: 'POST', json: {} })
		expect(await (await browse(`${new URL(url).pathname}?lang=ja`)).text()).toContain('小さな店')

		const { untranslated: left } = await publish()
		expect(left.en).toEqual([])
		expect(left.ja).toContain('菜單')

		const english = await (await browse('/cafe', 'en-GB,en;q=0.9')).text()
		expect(english).toContain('<html lang="en">')
		expect(english).toContain('The &lt;b&gt;Shop&lt;/b&gt;')
		expect(english).toContain('菜單-EN')
		expect(english).not.toContain('<b>Shop')
		// The address and the map still use what was written.
		expect(english).toContain('href="https://example.com/menu')
		expect(english).toContain('台北市中山區南京東路一段 1 號')

		const japanese = await (await browse('/cafe', 'ja')).text()
		expect(japanese).toContain('小さな店')
		expect(japanese).toContain('菜單')
		expect(await (await browse('/cafe', 'de')).text()).toMatch(/<h1>小店<\/h1>/)
	})

	it('shows the language ?lang= names, if it is turned on', async () => {
		expect(await (await browse('/cafe?lang=ja', 'en')).text()).toContain('小さな店')
		expect(await (await browse('/cafe?lang=en')).text()).toContain('The &lt;b&gt;Shop')
		expect(await (await browse('/cafe?lang=ko')).text()).toMatch(/<h1>小店<\/h1>/)
		expect(await (await browse('/cafe?lang=%3Cscript%3Ealert(1)')).text()).not.toContain('<script>alert')
	})

	it('tells search engines only about languages with every text translated', async () => {
		const plain = await (await browse('/cafe')).text()
		expect(plain).toContain('<link rel="canonical" href="https://bio.example/cafe">')
		expect(plain).toContain('<link rel="alternate" hreflang="zh-TW" href="https://bio.example/cafe">')
		expect(plain).toContain('<link rel="alternate" hreflang="en" href="https://bio.example/cafe?lang=en">')
		expect(plain).toContain('<link rel="alternate" hreflang="x-default" href="https://bio.example/cafe">')
		expect(plain).not.toContain('hreflang="ja"')
		expect(await (await browse('/cafe?lang=en')).text()).toContain('<link rel="canonical" href="https://bio.example/cafe?lang=en">')
		// Half translated: still shown, but not offered as a page of its own.
		expect(await (await browse('/cafe?lang=ja')).text()).toContain('<link rel="canonical" href="https://bio.example/cafe">')

		const sitemap = await (await browse('/sitemap.xml')).text()
		const entries = sitemap.split('<url>').filter((entry) => entry.includes('/cafe'))
		expect(entries).toHaveLength(2)
		expect(entries[0]).toContain('<loc>https://bio.example/cafe</loc>')
		expect(entries[1]).toContain('<loc>https://bio.example/cafe?lang=en</loc>')
		for (const entry of entries) {
			expect(entry).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T/)
			expect(entry).toContain('hreflang="zh-TW" href="https://bio.example/cafe"')
			expect(entry).toContain('hreflang="en" href="https://bio.example/cafe?lang=en"')
			expect(entry).not.toContain('hreflang="ja"')
		}
	})

	it('survives a backup and a dashboard-style save', async () => {
		const backup = await apiJson<{ pages: { handle: string; draft: PageContent; published: PageContent | null }[] }>('/export')
		const saved = backup.pages.find((page) => page.handle === 'cafe')
		expect(saved?.published?.translations?.ja).toEqual({ 小店: '小さな店' })
		const page = await draft()
		page.draft.profile.bio = '手沖咖啡與甜點'
		await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: page.draft })
		const after = await draft()
		expect(after.draft.translations?.ja).toEqual({ 小店: '小さな店' })
		expect(after.untranslated?.en).toEqual(['手沖咖啡與甜點'])
	})
})

describe('for search engines', () => {
	const read = async (path: string) => {
		const response = await visit(path)
		return { response, text: await response.text() }
	}

	it('robots.txt keeps crawlers out of the dashboard, API and counted clicks, and names the sitemap', async () => {
		const { response, text } = await read('/robots.txt')
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('text/plain')
		for (const line of ['Disallow: /admin/', 'Disallow: /api/', 'Disallow: /_c/', 'Allow: /api/openapi.json', 'Sitemap: https://bio.example/sitemap.xml']) expect(text).toContain(line)
	})

	it('sitemap.xml lists published pages at their canonical address, not drafts or short links', async () => {
		const { settings } = await apiJson<StateResponse>('/state')
		const home = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'welcome', name: 'Welcome' } })).page.id
		const hidden = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'secret-draft', name: 'Secret' } })).page.id
		const chinese = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: '咖啡', name: '咖啡' } })).page.id
		expect(hidden).toBeTruthy()
		const single = { ...settings, home, languages: [] }
		await apiJson('/settings', { method: 'PUT', json: single })
		await apiJson(`/pages/${home}/publish`, { method: 'POST' })
		await apiJson(`/pages/${chinese}/publish`, { method: 'POST' })
		await apiJson('/links', { method: 'POST', json: { url: 'https://example.com/x', slug: 'solo-link' } })

		const { response, text } = await read('/sitemap.xml')
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('application/xml')
		expect(text.startsWith('<?xml')).toBe(true)
		expect(text.match(/<loc>[^<]+<\/loc>/)?.[0]).toBe('<loc>https://bio.example/</loc>')
		expect(text).toContain(`<loc>https://bio.example/${encodeURIComponent('咖啡')}</loc>`)
		expect(text).not.toContain('/welcome<')
		expect(text).not.toContain('secret-draft')
		expect(text).not.toContain('solo-link')
		expect(text).not.toContain('xhtml:link rel')
		// Nothing to tell apart with one language, so the page says nothing either.
		expect(await (await visit('/咖啡')).text()).not.toContain('hreflang')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, languages: ['en', 'ja'] } })
	})
})
