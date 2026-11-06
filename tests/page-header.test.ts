import { describe, expect, it } from 'vitest'
import type { PageJson } from '../src/shared/api'
import { defaultContent, emptyLink, THEME_IDS, type PageContent } from '../src/shared/content'
import { THEME_CSS } from '../src/templates/compositions'
import { BOTTOM_SOCIALS_CSS, renderBioPage } from '../src/templates/render'
import { apiJson, visit } from './helpers'

// What the owner can change about the top of a page without CSS: where the social icons go, and whether the name shows.
// Both keep the page's order the order it is read in, by a keyboard and a screen reader as much as by eye.

function page(appearance: Partial<PageContent['appearance']> = {}, extra: Partial<PageContent> = {}): string {
	const content: PageContent = {
		...defaultContent(),
		profile: { name: 'Mei Lin', bio: 'Coffee', avatar: null },
		socials: [
			{ id: 'social-ig', platform: 'instagram', url: 'https://instagram.com/mei' },
			{ id: 'social-x', platform: 'x', url: 'https://x.com/mei' },
		],
		items: [{ ...emptyLink(), id: 'link-shop', title: 'Shop', url: 'https://shop.example', slug: 'shop' }],
		...extra,
	}
	content.appearance = { ...content.appearance, ...appearance }
	return renderBioPage(content, { mode: 'live', mediaUrl: (id) => `/media/${id}`, linkHref: (link) => `/${link.slug}` })
}

/** Where each part starts in the page's body, which is the order a keyboard goes through it. */
function order(html: string): Record<'head' | 'headEnd' | 'socials' | 'items' | 'footer', number> {
	const body = html.slice(html.indexOf('<body'))
	return {
		head: body.indexOf('<header class="head">'),
		headEnd: body.indexOf('</header>'),
		socials: body.indexOf('<nav class="socials"'),
		items: body.indexOf('<div class="items">'),
		footer: body.indexOf('<footer>'),
	}
}

describe('the social icons', () => {
	it('go under the bio by default, in the header', () => {
		const at = order(page())
		expect(at.socials).toBeGreaterThan(at.head)
		expect(at.socials).toBeLessThan(at.headEnd)
		expect(at.socials).toBeLessThan(at.items)
	})

	it('go after the items when the owner puts them at the bottom, where a keyboard reaches them after the links too', () => {
		const html = page({ socialPlace: 'bottom' })
		const at = order(html)
		expect(at.socials).toBeGreaterThan(at.headEnd)
		expect(at.socials).toBeGreaterThan(at.items)
		expect(at.socials).toBeLessThan(at.footer)
		expect(html.match(/<nav class="socials"/g)).toHaveLength(1)
		// Taps on them are counted the same wherever they are.
		const counted = renderBioPage(
			{ ...defaultContent(), socials: [{ id: 'social-ig', platform: 'instagram', url: 'https://instagram.com/mei' }], countSocials: true, appearance: { ...defaultContent().appearance, socialPlace: 'bottom' } },
			{ mode: 'live', mediaUrl: (id) => id, blockHref: (item, part) => `/_c/mei/${item.id}/${part}` },
		)
		expect(counted).toContain('ping="/_c/mei/social-ig/social"')
		expect(counted).toContain('<script>')
	})

	it('stay out of the page when they are switched off, wherever they would go', () => {
		expect(page({ showSocial: false, socialPlace: 'bottom' })).not.toContain('<nav class="socials"')
	})

	it('are laid out in the header by rules that only reach them there, in every theme', () => {
		// A theme places its icons in its header: a rail down the side, a grid cell beside the avatar. At the bottom they are a
		// row after the links, so a rule that places them has to name the header, or it would carry them back up.
		const placing = /(?:^|;)\s*(?:position|inset[\w-]*|top|grid-column|grid-row|justify-self)\s*:/
		for (const id of THEME_IDS) {
			for (const [, selectors, body] of THEME_CSS[id].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
				const loose = selectors!.split(',').map((selector) => selector.trim()).filter((selector) => /(^|[\s>])\.socials$/.test(selector) && !selector.startsWith('.head'))
				if (loose.length && !loose.every((selector) => selector === ':where(main)>.socials')) expect(body, `${id}: ${loose.join(', ')}`).not.toMatch(placing)
			}
		}
	})

	it('are a row the width of the page at the bottom, in every theme, which the page’s own CSS can still change', () => {
		for (const id of THEME_IDS) {
			const html = page({ theme: id, socialPlace: 'bottom' })
			const at = order(html)
			expect(at.socials, id).toBeGreaterThan(at.items)
			// After the theme's rules, which space and align the icons for the header, and before the page's own CSS.
			const row = html.indexOf(BOTTOM_SOCIALS_CSS)
			expect(row, id).toBeGreaterThan(html.indexOf(THEME_CSS[id]))
			expect(page({ theme: id, socialPlace: 'bottom', css: '.socials{margin-top:40px}' }).indexOf('.socials{margin-top:40px}'), id).toBeGreaterThan(row)
		}
		// As light as a theme's own rule for the icons, so `.socials` in a page's CSS wins.
		expect(BOTTOM_SOCIALS_CSS).toMatch(/^:where\(main\)>\.socials\{/)
		// Only where they are at the bottom.
		expect(page()).not.toContain(BOTTOM_SOCIALS_CSS)
		expect(page({ showSocial: false, socialPlace: 'bottom' })).not.toContain(BOTTOM_SOCIALS_CSS)
		// Bento's page is a grid that orders its tiles: the icons go after the links and before the footer.
		expect(THEME_CSS.bento).toContain(':where(main)>.socials{grid-column:1/-1;order:4}')
	})
})

describe('the name', () => {
	it('shows by default', () => {
		expect(page()).toContain('<h1>Mei Lin</h1>')
	})

	it('stays the page’s heading when hidden from sight, for screen readers and search engines', () => {
		const html = page({ showName: false })
		expect(html).toContain('<h1 class="visually-hidden">Mei Lin</h1>')
		expect(html).toMatch(/\.visually-hidden\{position:absolute!important;[^}]*clip-path:inset\(50%\)!important/)
		// Its title, initials and share preview keep it.
		expect(html).toContain('<title>Mei Lin</title>')
		expect(html).toContain('>ML</div>')
	})

	it('is hidden in every theme, whatever a theme does with headings', () => {
		// A theme's own rules for h1 come after the base sheet; !important is what keeps the name out of sight anyway.
		for (const id of THEME_IDS) expect(page({ theme: id, showName: false }), id).toContain('<h1 class="visually-hidden">')
	})

	it('is shown, and the icons are at the top, on a page saved without either field', async () => {
		const { page: made } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'header-fields', name: 'Mei' } })
		const draft = structuredClone(made.draft) as { appearance: Record<string, unknown> }
		delete draft.appearance.showName
		delete draft.appearance.socialPlace
		const saved = await apiJson<{ draftUpdatedAt: number }>(`/pages/${made.id}/draft`, { method: 'PUT', json: draft })
		await apiJson(`/pages/${made.id}/publish`, { method: 'POST', headers: { 'if-match': String(saved.draftUpdatedAt) } })
		const { page: read } = await apiJson<{ page: PageJson }>(`/pages/${made.id}`)
		expect(read.draft.appearance).toMatchObject({ showName: true, socialPlace: 'top' })
		expect(await (await visit('/header-fields')).text()).toContain('<h1>Mei</h1>')
	})
})

describe('floating buttons', () => {
	/** The room main keeps at its end, and how far up the button reaches: its distance from the bottom plus its height. */
	function room(html: string, bodyClass: string): { kept: number; reach: number } {
		const css = html.slice(html.indexOf('<style>'), html.indexOf('</head>'))
		const rule = (selector: string) => css.match(new RegExp(`(?:^|[}\\n])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? ''
		const px = (text: string, property: string) => Number(text.match(new RegExp(`(?:^|;)${property}:calc\\((\\d+)px \\+ env\\(safe-area-inset-bottom\\)\\)`))?.[1] ?? NaN)
		const kept = px(rule(`${bodyClass} main`), 'padding-bottom')
		const line = rule('.line-button')
		const embed = rule('.embed-button')
		const lineReach = px(line, 'bottom') + Number(line.match(/(?:^|;)height:(\d+)px/)?.[1] ?? 0)
		const embedBottom = bodyClass.includes('has-line') ? px(rule('.has-line .embed-button'), 'bottom') : px(embed, 'bottom')
		const embedReach = embedBottom + Number(embed.match(/(?:^|;)min-height:(\d+)px/)?.[1] ?? 0)
		return { kept, reach: Math.max(bodyClass.includes('has-line') ? lineReach : 0, bodyClass.includes('has-embed') ? embedReach : 0) }
	}

	it('leave room at the end of the page for the last thing on it to scroll clear of them, home indicator included', () => {
		const line = { lineButton: '@mei' }
		const embed = { embedButton: { provider: 'kofi' as const, account: 'mei' } }
		for (const [extra, bodyClass] of [
			[line, '.has-line'],
			[embed, '.has-embed'],
			[{ ...line, ...embed }, '.has-embed.has-line'],
		] as const) {
			const html = page({}, extra)
			expect(html).toContain(`<body class="${bodyClass.slice(1).split('.').reverse().join(' ')}">`)
			const { kept, reach } = room(html, bodyClass)
			expect(reach, bodyClass).toBeGreaterThan(40)
			// The room is measured from the same place as the buttons, the home indicator, and leaves a gap above them.
			expect(kept - reach, bodyClass).toBeGreaterThanOrEqual(12)
		}
	})

	it('keep that room in every theme: a theme that sets main’s padding is less specific than the room', () => {
		for (const id of THEME_IDS) expect(THEME_CSS[id], id).not.toMatch(/\.has-(line|embed)|padding-bottom|main\{[^}]*padding:[^};]*!important/)
	})
})
