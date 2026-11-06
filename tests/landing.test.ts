/// <reference types="vite/client" />
import { STARTER_IDS } from '../src/shared/starters'
import { describe, expect, it } from 'vitest'
import { LOCALES, PageContentSchema } from '../src/shared/content'
import { matchLanguageTag } from '../src/shared/locale'
import { personaContent, type SampleWords } from '../landing/fixtures'
import { languageScript, pickLanguage, renderLanding, robotsTxt, sitemapXml, SITE, templateKeys } from '../landing/render'
import favicon from '../public/favicon.svg?raw'
import { LOGO_PATH } from '../src/templates/icons'
import motion from '../landing/public/motion.js?raw'
import template from '../landing/template.html?raw'
import landingHeaders from '../landing/public/_headers?raw'
import { THEME_IDS, type ThemeId } from '../src/shared/content'
import { previewPage, previewsIn, THEME_SAMPLES } from '../landing/previews'

// The fluxbio.link landing page, its sample pages and the README come in every language.
const words = import.meta.glob<Record<string, string>>('../landing/locales/*.json', { import: 'default', eager: true })
const samples = import.meta.glob<SampleWords>('../landing/sample/*.json', { import: 'default', eager: true })
const readmes = import.meta.glob<string>(['../docs/README.*.md', '../README.md'], { query: '?raw', import: 'default', eager: true })

const tags = (html: string) => [...html.matchAll(/<\/?([a-z0-9]+)/g)].map((match) => match[0]).join(' ')
const source = words['../landing/locales/zh-TW.json']!

describe('landing page', () => {
	for (const locale of LOCALES) {
		describe(locale, () => {
			const text = words[`../landing/locales/${locale}.json`]
			it('has every text, with the same markup as the source', () => {
				expect(text).toBeDefined()
				for (const key of templateKeys(template)) {
					expect(text![key], key).toBeTruthy()
					// Theme captions may drop the English name when it would repeat.
					if (!/<span class="mono">/.test(source[key]!)) expect(tags(text![key]!), key).toBe(tags(source[key]!))
				}
			})
			it('has the words of every sample page', () => {
				const sample = samples[`../landing/sample/${locale}.json`]!
				const source = samples['../landing/sample/zh-TW.json']!
				for (const id of STARTER_IDS) {
					expect(Object.keys(sample[id]).sort(), id).toEqual(Object.keys(source[id]).sort())
					for (const [key, text] of Object.entries(sample[id])) expect(text, `${id}.${key}`).toBeTruthy()
				}
			})
			it('builds sample pages an owner could publish', () => {
				for (const id of STARTER_IDS) {
					const page = JSON.parse(JSON.stringify(personaContent(id, samples[`../landing/sample/${locale}.json`]!)).replace(/"[a-z-]+\.webp"/g, '"abcd1234.webp"'))
					const parsed = PageContentSchema.safeParse(page)
					expect(parsed.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [], id).toEqual([])
				}
			})
			it('has a README that links every other language', () => {
				const path = locale === 'en' ? '../README.md' : `../docs/README.${locale}.md`
				const readme = readmes[path]
				expect(readme, path).toBeDefined()
				expect(readme, path).toMatch(/\*\*(?:[^*\n]* \()?TL;DR\)?\*\*/)
				for (const other of LOCALES.filter((code) => code !== locale)) {
					const link = other === 'en' ? (locale === 'en' ? '' : '../README.md') : locale === 'en' ? `docs/README.${other}.md` : `README.${other}.md`
					// Either a Markdown link or an HTML one (the language buttons).
					if (link) expect(readme.includes(`(${link})`) || readme.includes(`href="${link}"`), `${path} → ${other}`).toBe(true)
				}
			})
		})
	}
})

describe('the site', () => {
	const english = words['../landing/locales/en.json']!
	const allLanguages = LOCALES.filter((code) => !code.includes('-'))

	it('sends a browser to the first language it asks for that the site has, by the same rules as the product', () => {
		for (const tag of ['ja', 'ja-JP', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-CN', 'zh-Hans-TW', 'zh-CN', 'zh', 'zh_TW', 'pt', 'pt-PT', 'pt-BR', 'in', 'id-ID', 'ar', 'ar-EG', 'de-AT', 'vi', 'th-TH', 'ko-KR', 'fr-CA', 'es-419']) {
			expect(pickLanguage([tag], allLanguages), tag).toBe(matchLanguageTag(tag))
		}
		expect(pickLanguage(['sw-KE', 'ja', 'de'], allLanguages)).toBe('ja')
	})

	it('leaves English browsers, and any it has no language for, on the English page', () => {
		expect(pickLanguage(['en-US', 'zh-TW'], allLanguages)).toBeNull()
		expect(pickLanguage(['sw-KE'], allLanguages)).toBeNull()
		expect(pickLanguage([], allLanguages)).toBeNull()
		expect(pickLanguage([''], allLanguages)).toBeNull()
	})

	it('runs that from "/" only, as a file its own CSP allows', () => {
		expect(renderLanding(template, english, 'en', { home: true })).toContain('<script src="/language.js"></script>')
		expect(renderLanding(template, english, 'en')).not.toContain('language.js')
		expect(languageScript()).toContain('location.replace')
		expect(languageScript()).not.toMatch(/:\s*(readonly\s+)?string/)
	})

	it('lets a browser keep its pictures for a day and the sample pages for an hour, and asks again for the pages themselves', () => {
		const rule = (pattern: string) => landingHeaders.split(/\n(?=\S)/).find((block) => block.split('\n')[0] === pattern) ?? ''
		for (const pattern of ['/images/*', '/:language/dash-*']) expect(rule(pattern), pattern).toMatch(/Cache-Control: public, max-age=86400\b/)
		expect(rule('/preview/*')).toMatch(/Cache-Control: public, max-age=3600\b/)
		for (const pattern of ['/', '/:language/', '/*']) expect(rule(pattern), pattern).not.toContain('Cache-Control')
	})

	it('has an address per language, and English from the menu stays English', () => {
		const page = renderLanding(template, english, 'en')
		expect(page).toContain('<a href="/en/" lang="en"')
		expect(page).toContain('<a href="/zh-TW/" lang="zh-TW"')
		expect(page).not.toContain('?lang=')
		expect(page).toContain(`<link rel="canonical" href="${SITE}/">`)
		expect(renderLanding(template, words['../landing/locales/ja.json']!, 'ja')).toContain(`<link rel="canonical" href="${SITE}/ja/">`)
		expect(page).toContain(`<link rel="alternate" hreflang="zh-TW" href="${SITE}/zh-TW/">`)
		expect(page).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE}/">`)
		expect(page).toContain(`<meta property="og:image" content="${SITE}/og.jpg">`)
		expect(page).toContain(`<meta name="twitter:image" content="${SITE}/og.jpg">`)
	})

	it('tells search engines about every language, and not the previews', () => {
		expect(robotsTxt()).toContain('Disallow: /preview/')
		expect(robotsTxt()).toContain(`Sitemap: ${SITE}/sitemap.xml`)
		const xml = sitemapXml()
		expect(xml.match(/<url>/g)).toHaveLength(LOCALES.length)
		expect(xml).toContain(`<loc>${SITE}/</loc>`)
		expect(xml).toContain(`<loc>${SITE}/zh-TW/</loc>`)
		expect(xml).toContain(`hreflang="x-default" href="${SITE}/"`)
	})

	it('makes a file for every preview its pages frame', () => {
		const names = previewsIn(template).map((preview) => preview.name)
		for (const theme of THEME_IDS) expect(names).toContain(theme)
		for (const name of ['brutal-creator', 'jelly-shop', 'aurora-event', 'notebook-pro', 'minimal-org']) expect(names).toContain(name)
		expect(names).toHaveLength(THEME_IDS.length + STARTER_IDS.length)
		expect(() => previewsIn('<iframe src="/preview/{{@lang}}/nope-nobody"')).toThrow()
		const gallery = renderLanding(template, english, 'en')
		for (const match of gallery.matchAll(/src="\/preview\/en\/([\w-]+)"/g)) expect(names).toContain(match[1])
		expect(template).not.toMatch(/_preview|_landing/)
	})

	it('draws the sample page in each theme, with its pictures from the site', () => {
		const zh = previewPage('zh-TW', 'brutal')
		expect(zh).toContain('看這週的影片')
		expect(zh).toContain('/images/avatar-mika.webp')
		expect(previewPage('en', 'editorial')).toContain('<img src="/images/cover-photo.webp"')
		expect(previewPage('en', 'minimal')).not.toContain('class="cover"')
	})

	it('lets a preview be someone else\'s page, with their own picture, in any theme', () => {
		expect(previewPage('en', 'liquid', 'shop')).toContain('<img src="/images/cover-corner.webp"')
		expect(previewPage('en', 'minimal', 'pro')).not.toContain('class="cover"')
		const zh = previewPage('zh-TW', 'editorial', 'shop')
		expect(zh).toContain('線上點餐')
		expect(zh).toContain('Island Coffee')
		expect(zh).not.toContain('看這週的影片')
		expect(previewPage('ja', 'editorial', 'shop')).not.toContain('線上點餐')
	})

	it('translates the previews with the page, and they read the same whenever it is built', () => {
		const ja = previewPage('ja', 'liquid')
		expect(ja).toContain('lang="ja"')
		expect(ja).not.toContain('預約 30 分鐘諮詢')
		expect(previewPage('en', 'sheet')).toBe(previewPage('en', 'sheet'))
		// Drawn while the shop in the samples is open.
		expect(previewPage('en', 'sheet')).toContain('class="open-pill"')
	})
})

// The landing page used to ship in every deployment. Nothing of it may reach someone hosting their own.
describe('someone hosting their own FluxBio', () => {
	const shipped = import.meta.glob('../public/**/*', { query: '?url' })
	const product = import.meta.glob<string>(['../src/worker/**/*.ts', '../src/admin/**/*.{ts,tsx}', '../src/shared/*.ts', '../src/templates/*.ts', '../cloudflare.config.ts'], { query: '?raw', import: 'default', eager: true })

	it('gets none of its files', () => {
		const files = Object.keys(shipped)
		expect(files).toContain('../public/favicon.svg')
		expect(files.filter((file) => /_landing|\.webp$|\.jpg$|index\.html$/.test(file))).toEqual([])
	})

	it('runs none of its code', () => {
		expect(Object.keys(product).length).toBeGreaterThan(50)
		for (const [file, source] of Object.entries(product)) {
			expect(source, file).not.toMatch(/from '[^']*\/landing\/|SHOWCASE|isShowcase|\/_preview\//)
		}
	})
})

describe('the sections', () => {
	it('take turns: the intro has its text on the left, so the first feature starts on the right', () => {
		const flips = [...template.matchAll(/<div class="feat( flip)?">/g)].map((match) => Boolean(match[1]))
		expect(flips).toEqual([true, false, true])
	})

	it('say what to ask the AI, next to each thing it can do', () => {
		expect(template.match(/<li data-in[^>]*><b>\{\{s\d+\}\}<\/b><span>\{\{s\d+\}\}<\/span><\/li>/g)).toHaveLength(5)
	})
})

describe('the dashboard', () => {
	const section = template.slice(template.indexOf('id="dashboard"'), template.indexOf('</section>', template.indexOf('id="dashboard"')))

	it('shows every screen with its words, in the order someone uses them, with nothing to find or wait for', () => {
		const steps = section.match(/<li class="step"[\s\S]*?<\/li>/g) ?? []
		expect(steps.map((step) => step.match(/dash-(\w+)\.webp/)?.[1])).toEqual(['links', 'qr', 'stats'])
		for (const step of steps) expect(step).toMatch(/<p class="cap">\{\{s\d+\}\}<\/p>/)
		expect(section).not.toMatch(/type="range"|data-stage/)
		expect(motion).not.toMatch(/data-tour|data-stage/)
	})
})

describe('while the phones load', () => {
	it('shows an empty light screen in each, not a black one', () => {
		expect(template).toMatch(/\.phone\{[^}]*background:var\(--raised\)/)
	})
})

describe('on a touch screen', () => {
	it('moves between things with a finger, leaving up and down and zooming to the browser', () => {
		expect(motion).toContain("swipe(stage,")
		expect(motion).toContain("swipe(templates,")
		expect(template).toMatch(/\.stage\{touch-action:pan-y pinch-zoom/)
		expect(template).toMatch(/\.tpls\{[^}]*touch-action:pan-y pinch-zoom/)
	})

	it('plays the phones by itself only for someone who has not asked for less motion', () => {
		expect(motion).toContain('if (still || !seen || resting || chosen || document.hidden) return')
	})

	it('has the headline, the phones and the pills first on a phone', () => {
		const phone = template.slice(template.indexOf('/* On a phone: the headline'))
		expect(phone).toMatch(/\.hero h1\{order:-3\}/)
		expect(phone).toMatch(/\.stage\{[^}]*order:-2/)
		expect(phone).toMatch(/\.pick\{order:-1/)
	})
})

describe('the logo', () => {
	it('comes from one place', () => {
		const page = renderLanding(template, words['../landing/locales/en.json']!, 'en')
		expect(page.match(new RegExp(LOGO_PATH.slice(0, 40), 'g'))).toHaveLength(2)
		expect(template).not.toContain('<path d="M16 3c6.5')
		expect(favicon).toContain(LOGO_PATH)
	})
})

describe('the hero', () => {
	it('shows every kind of page, each in a theme whose sample is that kind', () => {
		const hero = template.slice(template.indexOf('<div class="stage"'), template.indexOf('id="features"'))
		const frames = [...hero.matchAll(/class="phone p-(\w+)" for="u-\1"><iframe src="\/preview\/\{\{@lang\}\}\/(\w+)"/g)].map((match) => [match[1], match[2]] as const)
		expect(frames.map(([kind]) => kind)).toEqual([...STARTER_IDS])
		for (const [kind, theme] of frames) {
			expect(THEME_IDS as readonly string[]).toContain(theme)
			expect(THEME_SAMPLES[theme as ThemeId]?.[0]).toBe(kind)
		}
	})

	it('links to the whole gallery, which still has every theme', () => {
		expect(template).toContain('<a class="pick-more" href="#themes">{{s140}}')
		for (const [file, text] of Object.entries(words)) expect(text.s140, file).not.toMatch(/\d/)
		expect(renderLanding(template, words['../landing/locales/en.json']!, 'en').match(/class="tile"/g)).toHaveLength(THEME_IDS.length)
	})

	// The pills and the phone are worked with ~ from the radios, and the buttons should come first for the keyboard.
	it('puts the headline with the words, and the radios after the buttons and ahead of what they control', () => {
		const order = ['class="hero-copy"', '<h1 id="hero-title"', 'class="btn primary"', 'id="u-creator"', 'id="u-org"', '<div class="pick"', '<div class="stage"', 'class="phone p-org"', 'class="pick-more"', 'id="features"']
		const hero = template.slice(template.indexOf('<section class="hero"'))
		const places = order.map((text) => hero.indexOf(text))
		expect(places).not.toContain(-1)
		expect(places).toEqual([...places].sort((a, b) => a - b))
		for (const kind of STARTER_IDS) {
			expect(template).toContain(`#u-${kind}:checked~.pick label[for=u-${kind}]`)
			expect(template).toContain(`#u-${kind}:checked~.stage .p-${kind}`)
		}
	})

	// The phones stick out past the page's column. Cutting them with anything but a full-width section slices one in mid-air on
	// a wide screen, and leaving it to the body lets the whole page be dragged sideways.
	it('cuts the phones with a section as wide as the window', () => {
		expect(template).toContain('<section class="hero" aria-labelledby="hero-title">\n<div class="hero-row wrap">')
		expect(template).toMatch(/\.hero\{[^}]*overflow:clip/)
	})

	// With z-index the picked phone jumped on top the moment it was clicked, and each switch repainted the page.
	it('stacks the phones by depth, on layers made ahead of time', () => {
		// On the layer inside .stage: on a phone .stage cuts them short, and cutting an element flattens what's in it.
		expect(template).toMatch(/\.phones\{[^}]*transform-style:preserve-3d/)
		expect(template).not.toMatch(/\.stage\{[^}]*transform-style/)
		expect(template).toMatch(/\.stage \.phone\{[^}]*will-change:transform/)
		const phones = template.slice(template.indexOf('.stage .phone{'), template.indexOf('@media (prefers-reduced-motion:reduce){.stage'))
		expect(phones).not.toContain('z-index')
	})

	it('names the product once in the footer', () => {
		for (const [file, text] of Object.entries(words)) expect(text.s106, file).not.toContain('FluxBio')
	})

	// Picking one used to pull the page back up, because focus went to a radio that had scrolled out of view.
	it('keeps its hidden radios in the viewport, so picking one never scrolls the page', () => {
		expect(template).toContain('input.vh{position:fixed;top:50%;left:50%}')
	})
})
