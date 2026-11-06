import { describe, expect, it } from 'vitest'
import { emptyContent, emptyLink, type Locale, type PageContent } from '../src/shared/content'
import { renderBioPage } from '../src/templates/render'
import { resolveAppearance, THEMES } from '../src/templates/themes'

// A Chinese font's stylesheet at Google is about 35 KB of rules that hold up the first paint. A page in a language
// written without Chinese characters names the visitor's own fonts first, so the Chinese font there only draws the
// Chinese in the owner's own text: it is asked for with those characters alone, or not at all.

const links = (html: string) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]!.replaceAll('&amp;', '&'))
const textOf = (href: string) => decodeURIComponent(new URL(href).searchParams.get('text') ?? '')

function page(patch: Partial<PageContent> = {}, name = 'Mei Lin'): PageContent {
	const content = emptyContent(name)
	return {
		...content,
		profile: { ...content.profile, bio: 'Cooking, markets and everyday things.' },
		items: [{ ...emptyLink(), id: 'font-link', title: 'Watch this week’s video', url: 'https://example.com/watch', slug: 'watch' }],
		...patch,
	}
}

const live = (content: PageContent, locale: Locale) => renderBioPage(content, { mode: 'live', locale, mediaUrl: (id) => `/media/${id}`, linkHref: (link) => `/${link.slug}` })
const preview = (content: PageContent, locale: Locale) => renderBioPage(content, { mode: 'preview', locale, mediaUrl: (id) => `/media/${id}` })

/** A theme with a heading family of its own. Choosing a font for the page puts that family aside, which leaves the built-in font alone. */
const withHead = Object.values(THEMES).find((theme) => theme.head && theme.font === 'sans')!
const themed = (theme: typeof withHead, patch: Partial<PageContent['appearance']> = {}): Partial<PageContent> => ({ appearance: { ...emptyContent('x').appearance, theme: theme.id, ...patch } })
const plain = (patch: Partial<PageContent['appearance']> = {}) => themed(withHead, { font: 'sans', ...patch })

describe('the fonts a page in English links', () => {
	it('leave the Chinese font out when the page shows no Chinese, and keep the theme’s own', () => {
		const html = live(page(themed(withHead)), 'en')
		expect(links(html)).toEqual([expect.stringContaining(`family=${withHead.head!.family.replaceAll(' ', '+')}`)])
		expect(html).not.toContain('Noto+Sans+TC')
	})

	it('are none at all when the page has no font but the built-in one: nothing to wait for, and no connection to Google', () => {
		const html = live(page(plain()), 'en')
		expect(links(html)).toEqual([])
		expect(html).not.toContain('fonts.googleapis.com')
		expect(html).not.toContain('fonts.gstatic.com')
	})

	it('ask for the Chinese font with exactly the Chinese the page shows, each character once and in order', () => {
		const content = page({ ...themed(withHead), profile: { name: '林美 Mei', bio: '美食、市場，還有日常。', avatar: null } })
		const [theme, chinese, ...more] = links(live(content, 'en'))
		expect(more).toEqual([])
		expect(theme).not.toContain('Noto+Sans+TC')
		expect(theme).not.toContain('text=')
		expect(chinese).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap&text=/)
		expect(textOf(chinese!)).toBe([...new Set('林美美食、市場，還有日常。')].sort().join(''))
	})

	it('do the same for the serif and the brush font', () => {
		for (const [font, family] of [['serif', 'Noto+Serif+TC'], ['kai', 'LXGW+WenKai+TC']] as const) {
			const without = live(page(plain({ font })), 'en')
			expect(without, font).not.toContain(family)
			const [only] = links(live(page(plain({ font }), '王小明'), 'en'))
			expect(only, font).toContain(`family=${family}`)
			expect(textOf(only!)).toBe('小明王')
		}
	})

	it('count what this visitor is shown, not the other languages the page is translated into', () => {
		const content = page({ ...plain(), translations: { 'zh-TW': { 'Mei Lin': '林美', 'Cooking, markets and everyday things.': '美食、市場，還有日常。' } } })
		expect(links(live(content, 'en'))).toEqual([])
		expect(links(live(content, 'zh-TW'))).toEqual([expect.stringMatching(/family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap$/)])
	})

	it('load the whole font when the owner chose it for the page, since it then draws everything', () => {
		const html = live(page(plain({ bodyFont: 'Noto Sans TC' })), 'en')
		expect(links(html)).toEqual([expect.stringMatching(/family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap$/)])
	})

	it('load the whole font for a page that is really in Chinese: past a few hundred characters the list would outgrow what it saves', () => {
		const many = Array.from({ length: 401 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('')
		const content = page({ ...plain(), profile: { name: 'Mei', bio: many.slice(0, 280), avatar: null }, items: [{ ...emptyLink(), id: 'font-many', title: many.slice(280), url: 'https://example.com', slug: 'many' }] })
		expect(links(live(content, 'en'))).toEqual([expect.stringMatching(/family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap$/)])
	})
})

describe('everything else', () => {
	it('links as before: a page in Traditional Chinese, which is set in the font', () => {
		const html = live(page(themed(withHead)), 'zh-TW')
		expect(links(html)).toEqual([resolveAppearance(page(themed(withHead)).appearance, 'zh-TW').fontsHref])
		expect(links(html)[0]).toContain('Noto+Sans+TC')
		expect(links(html)[0]).not.toContain('text=')
	})

	it('links as before: a preview, whose text changes with every key', () => {
		const content = page({ ...themed(withHead), profile: { name: '林美', bio: '', avatar: null } })
		expect(links(preview(content, 'en'))).toEqual([resolveAppearance(content.appearance, 'en').fontsHref])
		expect(links(preview(page(plain()), 'en'))[0]).toContain('Noto+Sans+TC')
	})

	it('links as before: pages in Japanese, Korean and Simplified Chinese, which never loaded the Chinese font', () => {
		for (const locale of ['ja', 'ko', 'zh-CN'] as const) {
			const html = live(page(themed(withHead), '林美'), locale)
			expect(links(html), locale).toEqual([resolveAppearance(page(themed(withHead)).appearance, locale).fontsHref])
			expect(html, locale).not.toContain('Noto+Sans+TC')
		}
	})
})
