import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson, StateResponse } from '../src/shared/api'
import { defaultAppearance, emptyContent, emptyLink, LOCALES, newItem, type Locale, type PageContent } from '../src/shared/content'
import { statusText, weekRows } from '../src/shared/hours'
import { matchLanguageTag, negotiateLocale, resolveLocale } from '../src/shared/locale'
import { renderBioPage } from '../src/templates/render'
import { renderSystemPage, type SystemPageKind } from '../src/templates/system'
import { resolveAppearance } from '../src/templates/themes'
import { api, apiJson, IPHONE, visit } from './helpers'

// Public pages speak 12 languages: the page language, or one of the languages the owner turned
// on, picked per visitor from Accept-Language.

const HAN = /[㐀-鿿]/
const CJK: Locale[] = ['zh-TW', 'zh-CN', 'ja', 'ko']
const LANG: Record<Locale, string> = {
	'zh-TW': 'zh-Hant-TW',
	en: 'en',
	'zh-CN': 'zh-Hans-CN',
	ja: 'ja',
	ko: 'ko',
	es: 'es',
	'pt-BR': 'pt-BR',
	fr: 'fr',
	de: 'de',
	id: 'id',
	th: 'th',
	vi: 'vi',
	ar: 'ar',
}

describe('resolveLocale', () => {
	it('uses the page language alone when no others are turned on', () => {
		expect(resolveLocale('ja', [], 'en-US,en;q=0.9')).toBe('ja')
		expect(resolveLocale('zh-TW', [], null)).toBe('zh-TW')
	})

	it('picks among the page language and the ones turned on', () => {
		expect(resolveLocale('zh-TW', ['en', 'ja'], 'ja-JP')).toBe('ja')
		expect(resolveLocale('zh-TW', ['en'], 'ko-KR')).toBe('zh-TW')
		expect(resolveLocale('zh-TW', ['en'], 'ko, en;q=0.5')).toBe('en')
		expect(resolveLocale('en', ['ja'], null)).toBe('en')
	})
})

describe('negotiateLocale', () => {
	it('matches exact tags without regard to case', () => {
		expect(negotiateLocale('pt-br')).toBe('pt-BR')
		expect(negotiateLocale('ZH-tw')).toBe('zh-TW')
		expect(negotiateLocale('en-US')).toBe('en')
	})

	it('reads Chinese by script, then region', () => {
		for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-HK', 'zh_TW']) expect(matchLanguageTag(tag), tag).toBe('zh-TW')
		for (const tag of ['zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN', 'zh', 'zh-MY']) expect(matchLanguageTag(tag), tag).toBe('zh-CN')
	})

	it('maps any Portuguese to pt-BR and other languages by their primary subtag', () => {
		expect(negotiateLocale('pt-PT')).toBe('pt-BR')
		expect(negotiateLocale('pt')).toBe('pt-BR')
		expect(negotiateLocale('es-419')).toBe('es')
		expect(negotiateLocale('fr-CA')).toBe('fr')
		expect(negotiateLocale('de-AT')).toBe('de')
		expect(negotiateLocale('ja-JP')).toBe('ja')
		expect(negotiateLocale('ko-KR')).toBe('ko')
		expect(negotiateLocale('in-ID')).toBe('id')
	})

	it('honors q-values, keeping header order on a tie', () => {
		expect(negotiateLocale('en;q=0.5, ja;q=0.9, fr;q=0.7')).toBe('ja')
		expect(negotiateLocale('it-IT, it;q=0.9, de;q=0.8, en;q=0.7')).toBe('de')
		expect(negotiateLocale('ko;q=0.8, th;q=0.8')).toBe('ko')
		expect(negotiateLocale('ja;q=0, vi;q=0.1')).toBe('vi')
		expect(negotiateLocale('th;q=abc, id')).toBe('id')
	})

	it('falls back to English', () => {
		expect(negotiateLocale(null)).toBe('en')
		expect(negotiateLocale('')).toBe('en')
		expect(negotiateLocale('it, nl;q=0.8, *;q=0.5')).toBe('en')
		expect(negotiateLocale('ja;q=0')).toBe('en')
	})

	it('reads only the start of a huge header', () => {
		expect(negotiateLocale(`${'xx-YY;q=0.1, '.repeat(20_000)}ja`)).toBe('en')
		expect(negotiateLocale(`ko, ${'x'.repeat(100_000)}`)).toBe('ko')
	})
})

describe('opening hours in other languages', () => {
	const week = [[], ...Array.from({ length: 6 }, () => [{ open: '10:00', close: '18:00' }])]

	it('groups days in each language’s own style', () => {
		expect(weekRows(week, 'ja', 1).map((row) => row.days)).toEqual(['月曜', '火曜〜日曜（今日）'])
		expect(weekRows(week, 'fr', 0).map((row) => [row.days, row.hours])).toEqual([
			['lundi (aujourd’hui)', 'Fermé'],
			['du mardi au dimanche', '10:00–18:00'],
		])
	})

	it('says when a place opens next', () => {
		const opens = { open: false as const, opensAt: { inDays: 2, day: 2, time: '10:00' } }
		expect(statusText(opens, 'ja').detail).toBe('水曜日 10:00に開店')
		expect(statusText(opens, 'ko').detail).toBe('수요일 10:00에 영업 시작')
		expect(statusText(opens, 'de').detail).toBe('Öffnet Mi. um 10:00')
		expect(statusText(opens, 'vi').detail).toBe('Mở cửa lúc 10:00 Thứ Tư')
		expect(statusText({ open: true, closesAt: '02:00', closesToday: false }, 'es').detail).toBe('Cierra mañana a las 02:00')
	})
})

describe('every language', () => {
	// Tuesday noon in Taipei: the default week is open until 18:00.
	const now = Date.parse('2026-11-03T12:00:00+08:00')
	const options = {
		mode: 'live' as const,
		mediaUrl: (id: string) => `/media/${id}`,
		linkHref: (l: { slug: string }) => `/${l.slug}`,
		blockHref: (item: { id: string }, part: string) => `/_c/me/${item.id}/${part}`,
		timeZone: 'Asia/Taipei',
		now,
	}

	// Only Latin text from the owner, so any Chinese on the page would be built-in text left untranslated.
	function page(): PageContent {
		const content = emptyContent('Mei')
		content.profile.bio = 'Coffee and code'
		content.socials = [
			{ id: 'social-ig', platform: 'instagram', url: 'instagram.com/jesse' },
			{ id: 'social-web', platform: 'website', url: 'https://jesse.example' },
			{ id: 'social-mail', platform: 'email', url: 'jesse@example.com' },
		]
		content.items = [
			{ ...emptyLink(), id: 'link-1', title: 'Shop', url: 'https://shop.example', slug: 'shop' },
			{ ...newItem('heading'), id: 'head-1', title: 'Picks' },
			{ ...newItem('video'), id: 'video-1', url: 'https://youtu.be/dQw4w9WgXcQ' },
			{
				...newItem('gallery'),
				id: 'gallery-1',
				images: [
					{ id: 'img-1', image: 'a.webp', alt: '', url: '' },
					{ id: 'img-2', image: 'b.webp', alt: '', url: '' },
				],
			},
			{ ...newItem('product'), id: 'prod-1', products: [{ id: 'bean-1', name: 'Beans', price: '$12', image: null, url: '' }], moreUrl: 'https://shop.example' },
			{ ...newItem('hours'), id: 'hours-1', title: '', address: '1 Main St', phone: '+1 555 0100' },
		]
		return content
	}

	for (const locale of LOCALES) {
		it(`renders a bio page in ${locale}`, () => {
			const html = renderBioPage(page(), { ...options, locale })
			expect(html).toContain(`<html lang="${LANG[locale]}"${locale === 'ar' ? ' dir="rtl"' : ''}>`)
			expect(html).not.toMatch(/undefined|NaN|\[object /)
			expect(html).toContain('class="open-pill"')
			expect(html).toContain('class="hint-line"')
			if (!CJK.includes(locale)) expect(html).not.toMatch(HAN)
		})

		it(`renders every system page in ${locale}`, () => {
			const kinds: SystemPageKind[] = ['password', 'scheduled', 'expired', 'not-found', 'unpublished', 'in-app']
			for (const kind of kinds) {
				const html = renderSystemPage({
					kind,
					locale,
					host: 'bio.example',
					meta: 'bio.example/talk',
					opensAt: now + 86_400_000,
					expiredAt: now - 86_400_000,
					timeZone: 'Asia/Taipei',
					page: { href: '/', name: 'Mei' },
					suggestions: ['shop'],
					continueHref: '/talk?go=1',
					shareUrl: 'https://bio.example/talk',
					nonce: 'nonce-0123456789',
				})
				expect(html, kind).toContain(`<html lang="${LANG[locale]}"${locale === 'ar' ? ' dir="rtl"' : ''}>`)
				expect(html, kind).not.toMatch(/undefined|NaN|\[object /)
				if (!CJK.includes(locale)) expect(html, kind).not.toMatch(HAN)
			}
		})
	}

	it('dates system pages in the page’s language', () => {
		const expired = (locale: Locale) => renderSystemPage({ kind: 'expired', locale, host: 'bio.example', expiredAt: now, timeZone: 'Asia/Taipei' })
		expect(expired('zh-TW')).toContain('2026年11月3日 到期')
		expect(expired('en')).toContain('expired Nov 3, 2026')
		expect(expired('de')).toContain('abgelaufen am 03.11.2026')
		expect(expired('ja')).toContain('2026/11/03 に期限切れ')
	})

	it('uses fonts that suit Japanese, Korean and Simplified Chinese', () => {
		const appearance = defaultAppearance()
		const tw = resolveAppearance(appearance)
		expect(tw.vars['--body-font']).toContain("'Noto Sans TC'")
		expect(tw.fontsHref).toContain('Noto+Sans+TC')
		for (const locale of ['ja', 'ko', 'zh-CN'] as const) {
			const look = resolveAppearance(appearance, locale)
			expect(look.vars['--body-font'], locale).not.toContain(' TC')
			expect(look.fontsHref, locale).not.toContain('Noto+Sans+TC')
		}
		expect(resolveAppearance(appearance, 'th').vars['--body-font']).toMatch(/system-ui.*Noto Sans Thai.*Noto Sans TC/)
		// Latin text before the Chinese fonts, whose ’ “ ” are full-width.
		for (const locale of ['en', 'de', 'vi'] as const) expect(resolveAppearance(appearance, locale).vars['--body-font'], locale).toMatch(/^'[\w ]+', system-ui.*Noto Sans TC/)
		expect(resolveAppearance({ ...appearance, font: 'mono' }, 'ja').fontsHref).toContain('JetBrains+Mono')
	})
})

describe('page languages on the Worker', () => {
	let pageId = ''
	const ja = { 'accept-language': 'ja,en-US;q=0.9,en;q=0.8' }

	beforeAll(async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'me', name: 'Mei' } })
		pageId = page.id
		const content = emptyContent('Mei')
		content.items = [{ ...emptyLink(), id: 'link-1', title: 'Shop', url: 'https://shop.example', slug: 'shop' }]
		expect((await api(`/pages/${pageId}/draft`, { method: 'PUT', json: content })).status).toBe(200)
		expect((await api(`/pages/${pageId}/publish`, { method: 'POST' })).status).toBe(200)
		const { settings } = await apiJson<StateResponse>('/state')
		// New installs show English alone until the owner picks.
		expect(settings.locale).toBe('en')
		expect(settings.languages).toEqual([])
		expect((await api('/settings', { method: 'PUT', json: { ...settings, locale: 'it' } })).status).toBe(400)
		expect((await api('/settings', { method: 'PUT', json: { ...settings, locale: 'auto' } })).status).toBe(400)
		expect((await api('/settings', { method: 'PUT', json: { ...settings, languages: LOCALES.filter((code) => code !== 'en') } })).status).toBe(200)
	})

	it('serves the bio page in the visitor’s language and says it varies', async () => {
		const response = await visit('/', IPHONE, { headers: ja })
		expect(response.status).toBe(200)
		expect(response.headers.get('vary')).toContain('Accept-Language')
		const html = await response.text()
		expect(html).toContain('<html lang="ja">')
		expect(html).toContain('♥️ と FluxBio で作りました')
		expect(await (await visit('/me', IPHONE, { headers: { 'accept-language': 'pt-PT' } })).text()).toContain('Feito com ♥️ e FluxBio')
		expect(await (await visit('/me')).text()).toContain('Made with ♥️ and FluxBio')
	})

	it('serves system pages in the visitor’s language too', async () => {
		const missing = await visit('/no-such-link', IPHONE, { headers: { 'accept-language': 'ko-KR,ko;q=0.9' } })
		expect(missing.status).toBe(404)
		expect(missing.headers.get('vary')).toContain('Accept-Language')
		expect(await missing.text()).toContain('링크를 찾을 수 없어요')

		await api('/links', { method: 'POST', json: { url: 'https://example.com/over', slug: 'over', expiresAt: Date.now() - 1000 } })
		const expired = await visit('/over', IPHONE, { headers: { 'accept-language': 'de-DE' } })
		expect(expired.status).toBe(410)
		const text = await expired.text()
		expect(text).toContain('Dieser Link ist abgelaufen')
		expect(text).toContain('abgelaufen am')
		expect(text).not.toContain('到期')
	})

	it('previews drafts in the browser’s language', async () => {
		const html = await (await api(`/pages/${pageId}/preview`, { headers: { 'accept-language': 'th-TH' } })).text()
		expect(html).toContain('<html lang="th">')
	})

	it('uses a fixed language for everyone, with no Vary', async () => {
		const { settings } = await apiJson<StateResponse>('/state')
		await api('/settings', { method: 'PUT', json: { ...settings, locale: 'ja', languages: [] } })
		const response = await visit('/', IPHONE, { headers: { 'accept-language': 'en' } })
		expect(response.headers.get('vary') ?? '').not.toContain('Accept-Language')
		expect(await response.text()).toContain('♥️ と FluxBio で作りました')
		await api('/settings', { method: 'PUT', json: settings })
	})

	it('shows visitors whose language is not turned on the page language', async () => {
		const { settings } = await apiJson<StateResponse>('/state')
		await api('/settings', { method: 'PUT', json: { ...settings, locale: 'zh-TW', languages: ['ja'] } })
		const korean = await visit('/', IPHONE, { headers: { 'accept-language': 'ko-KR' } })
		expect(korean.headers.get('vary')).toContain('Accept-Language')
		expect(await korean.text()).toContain('<html lang="zh-Hant-TW">')
		expect(await (await visit('/', IPHONE, { headers: ja })).text()).toContain('♥️ と FluxBio で作りました')
		// Leaving out languages keeps the ones turned on; the page language is never listed twice.
		await api('/settings', { method: 'PUT', json: { ...settings, locale: 'zh-TW', languages: ['ja', 'en'] } })
		const { home, timezone, domain } = settings
		const { settings: kept } = await apiJson<StateResponse>('/settings', { method: 'PUT', json: { home, timezone, domain, locale: 'ja' } })
		expect(kept.languages).toEqual(['en'])
		await api('/settings', { method: 'PUT', json: settings })
	})
})
