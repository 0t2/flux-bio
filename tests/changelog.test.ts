/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../src/shared/content'
import { CATEGORIES, categoryLabels, inlineHtml, parseChangelog, renderChangelog, validateTranslations } from '../landing/changelog'
import { changelogPath, renderLanding, sitemapXml, SITE, templateKeys } from '../landing/render'
import changelog from '../CHANGELOG.md?raw'
import changelogTemplate from '../landing/changelog.html?raw'
import template from '../landing/template.html?raw'
import landingHeaders from '../landing/public/_headers?raw'
import landingBuild from '../landing/build.mjs?raw'

const words = import.meta.glob<Record<string, string>>('../landing/locales/*.json', { import: 'default', eager: true })
const translations = import.meta.glob<string>('../landing/changelog/*.md', { query: '?raw', import: 'default', eager: true })
const of = (code: string) => words[`../landing/locales/${code}.json`]!
const translation = (code: string) => translations[`../landing/changelog/${code}.md`]!

describe('CHANGELOG.md', () => {
	it('is read by the build: days newest first, each category once, in order, with entries', () => {
		const days = parseChangelog(changelog)
		expect(days.length).toBeGreaterThan(3)
		expect(days.at(-1)!.date).toBe('2026-11-05')
		for (const day of days) {
			expect(day.sections.length, day.date).toBeGreaterThan(0)
			const ranks = day.sections.map((section) => CATEGORIES.indexOf(section.category))
			expect(ranks, day.date).toEqual([...ranks].sort((a, b) => a - b))
			for (const section of day.sections) expect(section.items.length, `${day.date} ${section.category}`).toBeGreaterThan(0)
		}
	})
})

describe('localized changelogs', () => {
	it('checks every real translation against the English source', () => {
		const input = Object.fromEntries(LOCALES.filter((code) => code !== 'en').map((code) => [code, { source: translation(code), labels: categoryLabels(of(code)) }]))
		expect(Object.keys(input)).toHaveLength(12)
		expect(() => validateTranslations(changelog, input)).not.toThrow()
		const english = parseChangelog(changelog)
		const prose = (text: string) => text.replace(/`[^`]+`|\[[^\]]+\]\(https:\/\/[^)]+\)/g, '').trim()
		for (const code of LOCALES.filter((locale) => locale !== 'en')) {
			const localized = parseChangelog(translation(code), categoryLabels(of(code)), `landing/changelog/${code}.md`)
			for (let d = 0; d < english.length; d++) for (let s = 0; s < english[d]!.sections.length; s++) {
				for (let i = 0; i < english[d]!.sections[s]!.items.length; i++) {
					expect(prose(localized[d]!.sections[s]!.items[i]!.source), `${code} ${english[d]!.date} entry ${i + 1}`).not.toBe(prose(english[d]!.sections[s]!.items[i]!.source))
				}
			}
		}
	})

	it.each([
		['a missing entry', (text: string) => text.replace(/^- .+\n/m, '')],
		['an extra entry', (text: string) => text.replace(/(^- .+\n)/m, '$1$1')],
		['a mismatched date', (text: string) => text.replace('## 2026-11-17', '## 2026-11-16')],
		['a mismatched category', (text: string) => text.replace(/^### (.+)$/m, '### Unknown category')],
		['a changed link', (text: string) => text.replace('https://fluxbio.link/en/changelog/', 'https://example.com/')],
		['changed inline code', (text: string) => text.replace('`/_c/<handle>/<id>/link`', '`/changed`')],
	])('%s names its locale and source line', (_name, change) => {
		const source = change(translation('zh-TW'))
		try {
			validateTranslations(changelog, { 'zh-TW': { source, labels: categoryLabels(of('zh-TW')) } })
			expect.fail('expected a translation mismatch')
		} catch (error) {
			expect(String(error)).toMatch(/zh-TW: landing\/changelog\/zh-TW\.md line \d+/)
		}
	})
})

describe('a CHANGELOG.md that is written wrong stops the build, naming the line', () => {
	const day = (date: string, body = '### Fixed\n- An entry.') => `## ${date}\n\n${body}\n`
	it.each([
		['a date that is not YYYY-MM-DD', `## 2026-1-5\n### Fixed\n- x\n`, /line 1: .*not a date/],
		['a date that does not exist', day('2026-02-30'), /line 1: .*not a date/],
		['days not newest first', `${day('2026-11-05')}\n${day('2026-11-06')}`, /line 6: .*comes after/],
		['the same day twice', `${day('2026-11-05')}\n${day('2026-11-05')}`, /line 6: .*comes after/],
		['an entry before any heading', `- An entry.\n${day('2026-11-05')}`, /line 1: an entry before any/],
		['an entry under a day but before a category', `## 2026-11-05\n- An entry.\n`, /line 2: .*before any/],
		['a category before any day', `### Fixed\n- x\n`, /line 1: .*before the first/],
		['a category that is not known', day('2026-11-05', '### Bugs\n- x'), /line 3: "Bugs" is not a category/],
		['categories out of order', day('2026-11-05', '### Fixed\n- x\n### New\n- y'), /line 5: .*out of order/],
		['a category twice', day('2026-11-05', '### New\n- x\n### New\n- y'), /line 5: .*out of order or repeated/],
		['a category with no entries', day('2026-11-05', '### New\n### Fixed\n- y'), /line 4: .*"### New" has no entries/],
		['a day with no category', `## 2026-11-06\n\n${day('2026-11-05')}`, /line 3: .*no categories/],
		['a line it cannot read', day('2026-11-05', '### New\nplain words\n- x'), /line 4: can't read/],
		['a link that is not https', day('2026-11-05', '### New\n- [a](http://example.com)'), /line 4: .*bracket/],
		['code that is never closed', day('2026-11-05', '### New\n- `oops'), /line 4: .*backtick/],
		['nothing at all', '# Changelog\n', /no days/],
	])('%s', (_name, source, message) => {
		expect(() => parseChangelog(source)).toThrow(message)
	})

	it('allows only `code` and https links as markup, and escapes the rest', () => {
		expect(inlineHtml('Use `a<b` & [the docs](https://example.com/a?b=1&c=2) <script>', 1)).toBe(
			'Use <code>a&lt;b</code> &amp; <a href="https://example.com/a?b=1&amp;c=2" rel="noopener">the docs</a> &lt;script&gt;',
		)
	})
})

describe('the changelog page', () => {
	const days = parseChangelog(changelog)
	it('has every text in every language, with no markup of its own in them', () => {
		for (const code of LOCALES) for (const key of templateKeys(changelogTemplate)) {
			expect(of(code)[key], `${code} ${key}`).toBeTruthy()
			expect(of(code)[key], `${code} ${key}`).not.toMatch(/[<>]/)
		}
	})
	it('is one page a language, with localized entries and the right direction', () => {
		for (const code of LOCALES) {
			const labels = categoryLabels(of(code))
			const localized = code === 'en' ? days : parseChangelog(translation(code), labels, `landing/changelog/${code}.md`)
			const page = renderChangelog(changelogTemplate, of(code), code, localized, labels)
			expect(page, code).toContain(`<link rel="canonical" href="${SITE}${changelogPath(code)}">`)
			expect(page, code).toContain(`<a href="${changelogPath(code)}" lang="${code}" hreflang="${code}" aria-current="true">`)
			expect(page, code).toContain(`<div class="col log" lang="${code}"${code === 'ar' ? ' dir="rtl"' : ''}>`)
			for (const label of Object.values(labels)) expect(page, code).toContain(`<h3>${label}</h3>`)
			expect(page, code).toContain(code === 'ar' ? 'dir="rtl"' : '<html')
			expect(page, code).not.toMatch(/\{\{/)
		}
		expect(renderChangelog(changelogTemplate, of('ar'), 'ar', parseChangelog(translation('ar'), categoryLabels(of('ar')), 'landing/changelog/ar.md'), categoryLabels(of('ar')))).toMatch(/<html lang="ar" dir="rtl">/)
	})
	it('has no script and asks nobody else for anything, in any language', () => {
		for (const code of LOCALES) {
			const labels = categoryLabels(of(code))
			const localized = code === 'en' ? days : parseChangelog(translation(code), labels, `landing/changelog/${code}.md`)
			const page = renderChangelog(changelogTemplate, of(code), code, localized, labels)
			expect(page, code).not.toMatch(/<script|<iframe|<img|<link rel="(stylesheet|preconnect)"/)
			expect(page, code).not.toMatch(/googleapis|gstatic/)
			expect([...page.matchAll(/(?:src|url\()=?["']?(https?:)?\/\/[^"')\s>]+/g)], code).toEqual([])
		}
		const rule = landingHeaders.split(/\n(?=\S)/).find((block) => block.split('\n')[0] === '/:language/changelog/') ?? ''
		expect(rule).toContain("default-src 'none'")
		expect(rule).not.toMatch(/script-src|https:/)
	})
	it('is linked from the landing page footer, in each language, and listed in the sitemap', () => {
		for (const code of LOCALES) expect(renderLanding(template, of(code), code), code).toContain(`<a href="${changelogPath(code)}">${of(code).s210}</a>`)
		const xml = sitemapXml()
		for (const code of LOCALES) expect(xml).toContain(`<loc>${SITE}${changelogPath(code)}</loc>`)
		expect(xml).toContain(`hreflang="x-default" href="${SITE}/en/changelog/"`)
	})
	it('is built from CHANGELOG.md in the build', () => {
		expect(landingBuild).toContain("'CHANGELOG.md'")
		expect(landingBuild).toContain('/changelog/index.html')
	})
})
