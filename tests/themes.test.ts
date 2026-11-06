import { describe, expect, it } from 'vitest'
import { CommunityListSchema } from '../src/shared/community'
import { STARTER_IDS } from '../src/shared/starters'
import {
	appearanceFromPreset,
	defaultAppearance,
	defaultContent,
	PageContentSchema,
	presetFromAppearance,
	samePreset,
	THEME_IDS,
	type PageContent,
	type ThemeId,
} from '../src/shared/content'
import { THEME_CSS } from '../src/templates/compositions'
import { renderBioPage } from '../src/templates/render'
import { contrast, fitBackground, resolveAppearance, TEXT_ON_SECOND_COLOR, THEMES } from '../src/templates/themes'
import list from '../themes/community.json'

// The theme library sorts color sets by theme and use, so every listed set needs a use.

describe('community themes', () => {
	const { themes } = CommunityListSchema.parse(list)

	it('stay few, give every set the kinds of page it suits, and a unique id', () => {
		for (const theme of themes) expect(theme.uses?.length, theme.id).toBeGreaterThan(0)
		for (const id of THEME_IDS) {
			const sets = themes.filter((theme) => theme.base === id)
			expect(sets.length, id).toBeGreaterThan(0)
			expect(sets.length, id).toBeLessThanOrEqual(6)
			// The first is the theme's own, so a page with no colors of its own is in a set.
			expect(sets[0], id).toMatchObject({ bg: THEMES[id].bg, fg: THEMES[id].fg, accent: THEMES[id].accent, accent2: THEMES[id].accent2 })
		}
		expect(new Set(themes.map((theme) => theme.id)).size).toBe(themes.length)
	})

	it('offer every kind of page more than a couple of sets', () => {
		for (const id of STARTER_IDS) expect(themes.filter((theme) => theme.uses?.includes(id)).length, id).toBeGreaterThan(4)
	})

	it('drop what this version does not know instead of failing the list', () => {
		const newer = { themes: [{ ...themes[0], style: 'holographic', uses: ['shop', 'museum'], coverImage: 'someone-elses.webp' }] }
		const [theme] = CommunityListSchema.parse(newer).themes
		expect(theme).not.toHaveProperty('style')
		expect(theme).not.toHaveProperty('coverImage')
		expect(theme?.uses).toBeUndefined()
	})

	it('use backgrounds and text colors that fit their base theme as they are', () => {
		for (const theme of themes) {
			const look = resolveAppearance(appearanceFromPreset(theme, defaultAppearance()))
			if (theme.bg) expect(look.theme.bg, theme.id).toBe(theme.bg.toUpperCase())
			if (theme.fg) expect(look.theme.fg, theme.id).toBe(theme.fg.toUpperCase())
		}
	})

	it('look different from each other', () => {
		const looks = themes.map((theme) => {
			const look = resolveAppearance(appearanceFromPreset(theme, defaultAppearance()))
			return `${look.theme.id} ${look.theme.bg} ${look.accent}`
		})
		expect(new Set(looks).size).toBe(themes.length)
	})
})

describe('background and text colors', () => {
	const ofTheme = (theme: (typeof THEME_IDS)[number], colors: { bg?: string; fg?: string; accent?: string }) =>
		resolveAppearance({ ...defaultAppearance(), theme, ...colors })

	it('leave every theme as it is without colors of its own', () => {
		for (const id of THEME_IDS) {
			expect(ofTheme(id, {}).theme).toBe(THEMES[id])
			// Pages stored before v0.3 have no bg or fg at all.
			const { bg: _bg, fg: _fg, ...legacy } = defaultAppearance()
			expect(resolveAppearance({ ...legacy, theme: id }).theme).toBe(THEMES[id])
		}
	})

	it('keep dark themes dark and light themes light', () => {
		expect(fitBackground('#0a1a2f', true)).toBe('#0A1A2F')
		expect(fitBackground('#FFDCE8', false)).toBe('#FFDCE8')
		const darkened = fitBackground('#FFDCE8', true)
		const lightened = fitBackground('#0A1A2F', false)
		expect(contrast(darkened, '#FFFFFF')).toBeGreaterThan(8)
		expect(contrast(lightened, '#000000')).toBeGreaterThan(7)
		// The hue stays: a pink background on Liquid becomes a dark pink, not gray.
		const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(darkened.slice(at, at + 2), 16)) as [number, number, number]
		expect(r).toBeGreaterThan(g)
		expect(r).toBeGreaterThan(b)
	})

	it('keep every text color readable on any background', () => {
		const backgrounds = ['#000000', '#FFFFFF', '#FF0000', '#00FF66', '#3355FF', '#FFE14D', '#777777', '#24090F', '#D6E9FF']
		for (const id of THEME_IDS) {
			for (const bg of backgrounds) {
				for (const accent of ['', '#FFB020', '#1E3A8A']) {
					const look = ofTheme(id, { bg, accent })
					const { vars } = look
					const label = `${id} on ${bg} with ${accent || 'its accent'}`
					expect(look.theme.dark, label).toBe(THEMES[id].dark)
					expect(contrast(vars['--fg'] ?? '', vars['--bg'] ?? ''), label).toBeGreaterThanOrEqual(id === 'aurora' ? 4.5 : 7)
					expect(contrast(vars['--muted'] ?? '', vars['--bg'] ?? ''), label).toBeGreaterThanOrEqual(4.5)
					expect(contrast(vars['--accent-text'] ?? '', vars['--bg'] ?? ''), label).toBeGreaterThanOrEqual(3)
					expect(contrast(vars['--error'] ?? '', vars['--bg'] ?? ''), label).toBeGreaterThanOrEqual(4.5)
					expect(contrast(vars['--ok'] ?? '', vars['--bg'] ?? ''), label).toBeGreaterThanOrEqual(4.5)
				}
			}
		}
	})

	it('use the text color picked, unless it is hard to read', () => {
		expect(ofTheme('minimal', { bg: '#F5EFE2', fg: '#3b2f22' }).vars['--fg']).toBe('#3B2F22')
		// Rules follow the text color.
		expect(ofTheme('minimal', { fg: '#3B2F22' }).vars['--line']).not.toBe(THEMES.minimal.line)
		expect(ofTheme('minimal', { fg: '#DDDDDD' }).vars['--fg']).toBe(THEMES.minimal.fg)
		expect(ofTheme('liquid', { fg: '#333333' }).vars['--fg']).toBe(THEMES.liquid.fg)
	})

	it('render the page in the colors picked', () => {
		const content = defaultContent()
		content.appearance = { ...content.appearance, theme: 'jelly', bg: '#FFDCE8' }
		const html = renderBioPage(content, { mode: 'live', mediaUrl: (id) => `/media/${id}`, linkHref: (link) => `/${link.slug}` })
		expect(html).toContain('--bg:#FFDCE8')
		expect(html).toContain('<meta name="theme-color" content="#FFDCE8">')
		expect(html).toContain(`--fg:${THEMES.jelly.fg}`)
	})

	it('carry over into saved themes and back', () => {
		const appearance = { ...defaultAppearance(), theme: 'jelly' as const, accent: '#FF5FA2', bg: '#D3F3E3', fg: '' }
		const preset = presetFromAppearance('Mint', appearance)
		expect(preset).toEqual({ name: 'Mint', base: 'jelly', accent: '#FF5FA2', bg: '#D3F3E3', font: 'auto', button: 'auto' })
		expect(samePreset(preset, appearance)).toBe(true)
		expect(samePreset(preset, { ...appearance, bg: '' })).toBe(false)
		expect(appearanceFromPreset({ ...preset, bg: undefined }, appearance).bg).toBe('')
	})

	it('default to the theme colors in drafts saved before v0.3', () => {
		const content = defaultContent()
		const { bg: _bg, fg: _fg, ...legacy } = content.appearance
		const parsed = PageContentSchema.parse({ ...content, appearance: legacy })
		expect(parsed.appearance.bg).toBe('')
		expect(parsed.appearance.fg).toBe('')
	})
})

const DASHBOARD = import.meta.glob<string>('../admin/index.html', { query: '?raw', import: 'default', eager: true })['../admin/index.html']!
const THUMBNAILS = import.meta.glob<string>('../src/admin/components/MiniBio.tsx', { query: '?raw', import: 'default', eager: true })['../src/admin/components/MiniBio.tsx']!
const familiesIn = (source: string) => [...(/https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s]+/.exec(source)?.[0] ?? '').matchAll(/family=([^:&]+)/g)].map((match) => match[1]!.replaceAll('+', ' '))

it('the dashboard loads each theme’s fonts with its thumbnails, so they look like the theme', () => {
	const loaded = familiesIn(THUMBNAILS)
	for (const id of THEME_IDS) {
		const head = THEMES[id].head
		if (head) expect(loaded, id).toContain(head.family)
	}
	for (const family of ['Noto Sans TC', 'Noto Serif TC', 'LXGW WenKai TC', 'JetBrains Mono']) expect(loaded, family).toContain(family)
})

it('the dashboard’s own page loads only the fonts its screens are set in: a stylesheet in its head holds up the first paint', () => {
	// The first stylesheet there. Noto Sans TC comes after it, without being waited for: tests/dashboard.test.ts.
	expect(familiesIn(DASHBOARD)).toEqual(['IBM Plex Sans', 'IBM Plex Sans Arabic', 'IBM Plex Mono'])
})

describe('compositions', () => {
	const page = (appearance: Partial<PageContent['appearance']>, name = '阿光咖啡') => {
		const content = defaultContent()
		content.profile.name = name
		content.appearance = { ...content.appearance, ...appearance }
		return renderBioPage(content, { mode: 'live', mediaUrl: (id) => `/media/${id}`, linkHref: (link) => `/${link.slug}` })
	}

	it('give every theme a layout of its own, and a page only its own', () => {
		for (const id of THEME_IDS) {
			const css = THEME_CSS[id]
			expect(css.length, id).toBeGreaterThan(200)
			expect(page({ theme: id })).toContain(css)
			for (const other of THEME_IDS) if (other !== id) expect(css, `${id} ${other}`).not.toBe(THEME_CSS[other])
		}
		expect(page({ theme: 'liquid' })).not.toContain(THEME_CSS.brutal)
	})

	it('color everything through the page variables, so an AI can recolor them', () => {
		for (const id of THEME_IDS) {
			const css = THEME_CSS[id]
			expect(css.match(/#[0-9a-fA-F]{6}\b/g) ?? [], id).toEqual([])
		}
	})

	it('leave out monospace and the old decorations on a page', () => {
		for (const id of THEME_IDS) {
			const html = page({ theme: id })
			expect(html, id).not.toContain('JetBrains')
			expect(html, id).not.toContain('class="blobs"')
		}
	})

	it('load each theme’s own heading face, unless a font was picked', () => {
		const families = (appearance: Partial<PageContent['appearance']>) =>
			resolveAppearance({ ...defaultAppearance(), ...appearance }).webFonts.map((font) => font.family)
		for (const id of THEME_IDS) {
			const head = THEMES[id].head
			if (head) expect(families({ theme: id }), id).toContain(head.family)
		}
		expect(families({ theme: 'brutal', headFont: 'Inter' })).not.toContain('Plus Jakarta Sans')
		expect(families({ theme: 'brutal', font: 'serif' })).not.toContain('Plus Jakarta Sans')
	})

	it('draw the pictures an AI set, escaped, and nothing without them', () => {
		const plain = page({})
		expect(plain).not.toContain('class="cover"')
		expect(plain).not.toContain('class="page-bg"')
		const html = page({ coverImage: 'a1.webp', bgImage: 'b2.webp', bgDim: 0.6 })
		expect(html).toContain('<figure class="cover"><img src="/media/a1.webp" alt=""></figure>')
		expect(html).toContain('<div class="page-bg" style="--dim:0.6" aria-hidden="true"><img src="/media/b2.webp" alt=""></div>')
	})

	it('keep pictures with a saved look, and leave the cover to one that has none', () => {
		const appearance = { ...defaultAppearance(), theme: 'jelly' as const, coverImage: 'a1.webp', bgImage: 'b2.webp', bgDim: 0.6 }
		const preset = presetFromAppearance('Mine', appearance)
		expect(preset).toMatchObject({ coverImage: 'a1.webp', bgImage: 'b2.webp', bgDim: 0.6 })
		expect(samePreset(preset, appearance)).toBe(true)
		expect(samePreset(preset, { ...appearance, coverImage: null })).toBe(false)
		expect(appearanceFromPreset(preset, defaultAppearance())).toMatchObject({ coverImage: 'a1.webp', bgImage: 'b2.webp', bgDim: 0.6 })
		// The cover is the page's own: a look without one leaves it, and takes its own background away.
		const bare = presetFromAppearance('Bare', defaultAppearance())
		expect(appearanceFromPreset(bare, appearance)).toMatchObject({ coverImage: 'a1.webp', bgImage: null })
	})

	it('read stored appearances from before pictures existed', () => {
		const { coverImage: _c, bgImage: _b, bgDim: _d, ...old } = defaultAppearance()
		const stored = { ...defaultContent(), appearance: old }
		expect(PageContentSchema.parse(stored).appearance).toMatchObject({ coverImage: null, bgImage: null, bgDim: 0.75 })
		// KV copies aren't parsed.
		expect(renderBioPage(stored as PageContent, { mode: 'live', mediaUrl: (id) => id })).not.toContain('class="cover"')
	})
})

describe('colors an AI picks', () => {
	const COLORS = ['#000000', '#111111', '#2F4F4F', '#808080', '#9B2C2C', '#1D4ED8', '#D7263D', '#FDE047', '#FDE68A', '#F5F5F5', '#FFFFFF']
	const GROUNDS = [['', ''], ['#FBF7EE', '#2B2118'], ['#101820', '#F7F3E9']] as const
	const look = (theme: ThemeId, colors: Partial<ReturnType<typeof defaultAppearance>>) => resolveAppearance({ ...defaultAppearance(), theme, ...colors }).vars

	it('leave text readable where it sits on the second color', () => {
		for (const theme of TEXT_ON_SECOND_COLOR) {
			for (const accent2 of COLORS) {
				for (const [bg, fg] of GROUNDS) {
					const vars = look(theme, { accent2, bg, fg })
					const label = `${theme} ${accent2} on ${bg || 'its own'}`
					expect(contrast(vars['--fg'] ?? '', vars['--accent2'] ?? ''), label).toBeGreaterThanOrEqual(4.5)
					expect(contrast(vars['--muted'] ?? '', vars['--accent2'] ?? ''), label).toBeGreaterThanOrEqual(3)
				}
			}
		}
	})

	it('leave text readable on tinted buttons', () => {
		for (const theme of ['minimal', 'bento'] as const) {
			for (const accent of COLORS) {
				for (const [bg, fg] of GROUNDS) {
					const vars = look(theme, { accent, bg, fg })
					const label = `${theme} ${accent} on ${bg || 'its own'}`
					expect(contrast(vars['--fg'] ?? '', vars['--accent-tint'] ?? ''), label).toBeGreaterThanOrEqual(4.5)
					expect(contrast(vars['--muted'] ?? '', vars['--accent-tint'] ?? ''), label).toBeGreaterThanOrEqual(3)
				}
			}
		}
	})

	it('stay as chosen where no text depends on them', () => {
		for (const theme of THEME_IDS.filter((id) => !TEXT_ON_SECOND_COLOR.includes(id))) {
			expect(look(theme, { accent2: '#2F4F4F' })['--accent2'], theme).toBe('#2F4F4F')
		}
		// Even in a theme with text on it, a color that already reads is left alone.
		expect(look('minimal', { accent2: '#FDE68A' })['--accent2']).toBe('#FDE68A')
	})

	it('reach every theme with text on the second color', () => {
		const buttonsOrPanels = /\.(?:link|panel|product|items)[^{}]*\{[^}]*background:(?:var\(--accent2\)|color-mix\(in srgb,var\(--accent2\) (?:[3-9]\d|100)%)/
		for (const theme of THEME_IDS) {
			const onIt = /linear-gradient\([^;}]*var\(--accent2\)/.test(THEME_CSS[theme]) || buttonsOrPanels.test(THEME_CSS[theme])
			expect(TEXT_ON_SECOND_COLOR.includes(theme), theme).toBe(onIt)
		}
	})

	it('get a readable ink on the full accent color, not the page text', () => {
		for (const theme of THEME_IDS) {
			for (const rule of THEME_CSS[theme].match(/[^{}]*\{[^{}]*\}/g) ?? []) {
				if (/background:var\(--accent\)[;}]/.test(rule)) expect(rule, theme).not.toContain('color:var(--fg)')
			}
		}
	})
})
