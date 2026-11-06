import { describe, expect, it } from 'vitest'
import { emptyContent, emptyLink, type Locale, type PageContent } from '../src/shared/content'
import { GOOGLE_TEXT_LIMIT } from '../src/shared/fonts'
import { renderBioPage } from '../src/templates/render'
import { resolveAppearance, THEMES } from '../src/templates/themes'

// A Chinese font's stylesheet at Google is about 35 KB of rules that hold up the first paint, and a page of Chinese
// then pulls dozens of files from it. A live page asks for such a font with the characters it shows and no others:
// every character where the font is the page's own, and only the Chinese where it stands behind the visitor's fonts.

const links = (html: string) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]!.replaceAll('&amp;', '&'))
const textOf = (href: string) => new URL(href).searchParams.get('text') ?? ''

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
		const [chinese, ...more] = links(live(content, 'zh-TW'))
		expect(more).toEqual([])
		for (const character of '林美食市場還有日常') expect(textOf(chinese!), character).toContain(character)
	})

	it('ask for every character shown when the owner chose the Chinese font for the page, since it then draws them all', () => {
		const [only, ...more] = links(live(page(plain({ bodyFont: 'Noto Sans TC' })), 'en'))
		expect(more).toEqual([])
		expect(only).toMatch(/family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap&text=/)
		for (const character of 'Mei Lin Cooking, markets’') expect(textOf(only!), character).toContain(character)
	})

	it('load the whole font past the 800 characters Google cuts one to: asked for more, it would send all of it anyway', () => {
		const many = (count: number) => page({ ...plain(), items: [{ ...emptyLink(), id: 'font-many', title: Array.from({ length: count }, (_, i) => String.fromCodePoint(0x4e00 + i)).join(''), url: 'https://example.com', slug: 'many' }] })
		expect(GOOGLE_TEXT_LIMIT).toBe(800)
		expect([...textOf(links(live(many(800), 'en'))[0]!)]).toHaveLength(800)
		expect(links(live(many(801), 'en'))).toEqual([expect.stringMatching(/family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap$/)])
	})
})

describe('the fonts a page in Traditional Chinese links', () => {
	const chinese = (patch: Partial<PageContent> = {}) =>
		page({ ...themed(withHead), profile: { name: '島嶼咖啡', bio: '台南巷子裡的自家烘焙咖啡。豆子每週二、五新鮮烘，也開手沖課。', avatar: null }, ...patch })

	it('are the theme’s own, whole, and the Chinese font with every character the page shows', () => {
		const html = live(chinese(), 'zh-TW')
		const [theme, own, ...more] = links(html)
		expect(more).toEqual([])
		expect(theme).toBe(`https://fonts.googleapis.com/css2?family=${withHead.head!.family.replaceAll(' ', '+')}:wght@${theme!.split('wght@')[1]!.split('&')[0]}&display=swap`)
		expect(own).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap&text=/)
		const asked = new Set(textOf(own!))
		// Everything in the page beyond what a keyboard types, the words the page adds itself among them, and all of that too.
		const body = html.slice(html.indexOf('<body'))
		for (const character of new Set(body)) if (character > '~') expect(asked.has(character), character).toBe(true)
		for (const character of '島嶼咖啡台南。、用和打造 Watch’0129azAZ') expect(asked.has(character), character).toBe(true)
		expect([...textOf(own!)]).toEqual([...textOf(own!)].sort())
		expect(asked.size).toBeLessThan(200)
	})

	it('do the same in the serif and the brush font, and for a Chinese font the owner picked', () => {
		for (const [appearance, family] of [[{ font: 'serif' }, 'Noto+Serif+TC'], [{ font: 'kai' }, 'LXGW+WenKai+TC'], [{ font: 'sans', headFont: 'Noto Serif TC' }, 'Noto+Sans+TC'], [{ font: 'sans', headFont: 'Noto Serif TC' }, 'Noto+Serif+TC']] as const) {
			const all = links(live(chinese(plain(appearance)), 'zh-TW'))
			expect(all, family).toHaveLength(1)
			expect(all[0], family).toContain(`family=${family}:`)
			expect(textOf(all[0]!), family).toContain('島')
		}
	})

	it('load the whole font for a page with more characters than Google cuts one to', () => {
		const title = (count: number) => Array.from({ length: count }, (_, i) => String.fromCodePoint(0x5000 + i)).join('')
		const within = live(chinese({ ...plain(), profile: { name: 'Mei', bio: '', avatar: null }, items: [{ ...emptyLink(), id: 'font-many', title: title(600), url: 'https://example.com', slug: 'many' }] }), 'zh-TW')
		expect(links(within)).toEqual([expect.stringContaining('&text=')])
		const past = live(chinese({ ...plain(), profile: { name: 'Mei', bio: '', avatar: null }, items: [{ ...emptyLink(), id: 'font-many', title: title(720), url: 'https://example.com', slug: 'many' }] }), 'zh-TW')
		expect(links(past)).toEqual([expect.stringMatching(/family=Noto\+Sans\+TC:wght@[\d.;]+&display=swap$/)])
	})
})

describe('everything else', () => {
	it('cuts a Japanese or Korean font the owner picked the same way, on a page in any language', () => {
		for (const [locale, family] of [['ja', 'Noto Sans JP'], ['ko', 'Noto Sans KR'], ['en', 'Noto Sans JP']] as const) {
			const all = links(live(page(plain({ bodyFont: family }), '東京 Tokyo'), locale))
			const picked = all.find((href) => href.includes(family.replaceAll(' ', '+')))
			expect(picked, `${locale} ${family}`).toContain('&text=')
			expect(textOf(picked!), `${locale} ${family}`).toContain('東')
		}
	})

	it('links as before: a preview, whose text changes with every key', () => {
		const content = page({ ...themed(withHead), profile: { name: '林美', bio: '', avatar: null } })
		expect(links(preview(content, 'zh-TW'))).toEqual([resolveAppearance(content.appearance, 'zh-TW').fontsHref])
		expect(links(preview(content, 'zh-TW'))[0]).not.toContain('text=')
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
