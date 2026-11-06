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
import { charactersBeyondAscii, coversPage, PLEX, plexFiles, type ChineseFont } from '../landing/fonts'
import landingHeaders from '../landing/public/_headers?raw'
import landingBuild from '../landing/build.mjs?raw'
import landingOwner from '../scripts/landing-owner.mjs?raw'
import { scripts } from '../package.json'
import { THEME_IDS } from '../src/shared/content'
import { previewPage, previewsIn } from '../landing/previews'

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

	it('lets a browser keep its pictures for a day and the sample pages for an hour, and asks again for the pages themselves', () => {
		const rule = (pattern: string) => landingHeaders.split(/\n(?=\S)/).find((block) => block.split('\n')[0] === pattern) ?? ''
		for (const pattern of ['/images/*', '/:language/dash-*']) expect(rule(pattern), pattern).toMatch(/Cache-Control: public, max-age=86400\b/)
		expect(rule('/preview/*')).toMatch(/Cache-Control: public, max-age=3600\b/)
		for (const pattern of ['/', '/:language/', '/*']) expect(rule(pattern), pattern).not.toContain('Cache-Control')
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

	it('loads a Chinese font in a sample page only where the page is in Chinese', () => {
		const chinese = /family=(Noto\+Sans\+TC|Noto\+Serif\+TC|LXGW\+WenKai\+TC)/
		for (const theme of THEME_IDS) {
			expect(previewPage('en', theme), theme).not.toMatch(chinese)
			expect(previewPage('zh-TW', theme), theme).toMatch(chinese)
		}
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

	it("can't deploy the project's site by mistake: the command first checks the account serves fluxbio.link", () => {
		expect(scripts['landing:deploy']).toMatch(/^node scripts\/landing-owner\.mjs && /)
		// The check and the build have to mean the same Worker and domain.
		for (const name of ["'fluxbio-showcase'", "'fluxbio.link'"]) {
			expect(landingOwner, name).toContain(name)
			expect(landingBuild, name).toContain(name)
		}
		expect(landingOwner).toContain('process.exit(1)')
	})

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
	it('moves between things with a finger, leaving up and down to the browser', () => {
		expect(motion).toContain("swipe(templates,")
		expect(template).toMatch(/\.tpls\{[^}]*touch-action:pan-y pinch-zoom/)
	})

	it('holds still for someone who has asked for less motion', () => {
		expect(template).toContain('@media (prefers-reduced-motion:reduce){*{animation:none!important')
	})

	it('has the headline, then the terminal and the octopus, first on a phone', () => {
		const phone = template.slice(template.indexOf('/* On a phone: the headline'))
		expect(phone).toMatch(/\.hero h1\{order:-2\}/)
		expect(phone).toMatch(/\.octo\{order:-1/)
	})
})

describe('the logo', () => {
	it('comes from one place', () => {
		const page = renderLanding(template, words['../landing/locales/en.json']!, 'en')
		// The header, the footer, and the octopus bot at the end of the headline.
		expect(page.match(new RegExp(LOGO_PATH.slice(0, 40), 'g'))).toHaveLength(3)
		expect(template).not.toContain('<path d="M16 3c6.5')
		expect(favicon).toContain(LOGO_PATH)
	})
})

describe('the hero', () => {
	const hero = template.slice(template.indexOf('<section class="hero"'), template.indexOf('id="features"'))

	// The terminal types what an owner says to their AI, in words every language already has from the AI section, and
	// ticks off steps that are translated too.
	it('asks for what the AI section offers, and ticks off translated steps', () => {
		const asked = [...hero.matchAll(/\{\{(s14[2-6])\}\}/g)].map((match) => match[1])
		expect(asked.length).toBeGreaterThanOrEqual(3)
		for (const key of asked) expect(template.indexOf(`{{${key}}}`)).toBeLessThan(template.indexOf('id="features"'))
		const steps = [...hero.matchAll(/\{\{(s(?:19[4-9]|20[01]))\}\}/g)].map((match) => match[1])
		expect(new Set(steps).size).toBe(8)
	})

	it('types with a script from this site, and reads whole without it', () => {
		expect(template).toContain('<script src="/terminal.js" defer></script>')
		expect(template.match(/<script(?![^>]*\bsrc=)[^>]*>/g)).toBeNull()
		expect(hero).toMatch(/<span class="t-say">\{\{s14\d\}\}/)
	})

	it('puts the words first, then the terminal, then what the octopus holds', () => {
		const order = ['class="hero-copy"', '<h1 id="hero-title"', 'class="lead"', 'class="btn primary"', 'class="octo"', 'class="term"', 'class="octo-fit"']
		const places = order.map((text) => hero.indexOf(text))
		expect(places).not.toContain(-1)
		expect(places).toEqual([...places].sort((a, b) => a - b))
	})

	it('leaves the whole gallery, with every theme, to its own section', () => {
		expect(renderLanding(template, words['../landing/locales/en.json']!, 'en').match(/class="tile"/g)).toHaveLength(THEME_IDS.length)
	})

	// What the octopus holds sticks out past the page's column. Cutting it with anything but a full-width section slices
	// a card in mid-air on a wide screen, and leaving it to the body lets the whole page be dragged sideways.
	it('cuts what the octopus holds with a section as wide as the window', () => {
		expect(template).toContain('<section class="hero" aria-labelledby="hero-title">\n<div class="hero-row wrap">')
		expect(template).toMatch(/\.hero\{[^}]*overflow:clip/)
	})

	it('names the product once in the footer', () => {
		for (const [file, text] of Object.entries(words)) expect(text.s106, file).not.toContain('FluxBio')
	})

	// Picking one used to pull the page back up, because focus went to a radio that had scrolled out of view.
	it('keeps its hidden radios in the viewport, so picking one never scrolls the page', () => {
		expect(template).toContain('input.vh{position:fixed;top:50%;left:50%}')
	})
})

describe("the pages' own fonts", () => {
	const shipped = Object.keys(import.meta.glob('../landing/public/fonts/**/*.woff2', { query: '?url', import: 'default', eager: true })).map((path) => path.replace('../landing/public/fonts/', ''))
	const licences = import.meta.glob<string>('../landing/public/fonts/**/*.txt', { query: '?raw', import: 'default', eager: true })
	const page = (locale: (typeof LOCALES)[number], chinese?: ChineseFont) => renderLanding(template, words[`../landing/locales/${locale}.json`]!, locale, { chinese })
	const linked = (html: string) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]!)
	const made = (html: string): ChineseFont => ({ family: 'Noto Sans TC', characters: charactersBeyondAscii(html), faces: [{ weight: '400 600', file: '0123456789abcdef.woff2', range: 'U+4e00-9fff' }] })

	it('are IBM Plex from this site in every language, each file under its licence', () => {
		expect(plexFiles().sort()).toEqual(shipped.sort())
		for (const font of PLEX) expect(licences[`../landing/public/fonts/${font.folder}/LICENSE.txt`], font.family).toContain('SIL Open Font License')
		expect(licences['../landing/public/fonts/noto-sans-tc/OFL.txt']).toContain('SIL OPEN FONT LICENSE')
		for (const locale of LOCALES) {
			const html = page(locale)
			for (const font of PLEX) expect(html, `${locale} ${font.family}`).toContain(`@font-face{font-family:'${font.family}';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/${font.folder}/${font.file}-Regular-Latin1.woff2)`)
			expect(html, locale).not.toContain('family=IBM+Plex+Sans:')
			expect(html, locale).not.toContain('family=IBM+Plex+Mono')
		}
	})

	it('reach Google from two pages only: Arabic for its script, and Traditional Chinese until its font is made', () => {
		for (const locale of LOCALES) {
			const html = page(locale)
			const expected = locale === 'ar' ? ['https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600&amp;display=swap'] : locale === 'zh-TW' ? ['https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600&amp;display=swap'] : []
			expect(linked(html), locale).toEqual(expected)
			expect(html.includes('fonts.gstatic.com'), locale).toBe(expected.length > 0)
		}
	})

	it('serve the Traditional Chinese page its font from here once it is made, cut to the characters the page shows', () => {
		const plain = page('zh-TW')
		const font = made(plain)
		expect(coversPage(font, plain)).toBe(true)
		const html = page('zh-TW', font)
		expect(linked(html)).toEqual([])
		expect(html).not.toContain('fonts.g')
		expect(html).toContain("@font-face{font-family:'Noto Sans TC';font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/noto-sans-tc/0123456789abcdef.woff2) format('woff2');unicode-range:U+4e00-9fff}")
		// Only that page: the others never showed Chinese in it.
		expect(page('en', font)).not.toContain('noto-sans-tc')
	})

	it('go back to Google for it when the copy has a character the font was not made with', () => {
		const plain = page('zh-TW')
		const font = made(plain)
		expect(coversPage(font, plain.replace('</h1>', '龘</h1>'))).toBe(false)
		expect(coversPage({ ...font, faces: [] }, plain)).toBe(false)
		expect(coversPage(null, plain)).toBe(false)
		expect(charactersBeyondAscii('aé中中 →b')).toBe('é→中')
	})

	it('may be kept for a year, and are allowed by the pages that load them', () => {
		const rule = (pattern: string) => landingHeaders.split(/\n(?=\S)/).find((block) => block.split('\n')[0] === pattern) ?? ''
		expect(rule('/fonts/*')).toContain('Cache-Control: public, max-age=31536000, immutable')
		for (const pattern of ['/', '/:language/']) expect(rule(pattern), pattern).toContain("font-src 'self' https://fonts.gstatic.com;")
	})
})
