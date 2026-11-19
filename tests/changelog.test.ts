/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../src/shared/content'
import { CATEGORIES, categoryLabels, inlineHtml, nextVersion, parseChangelog, renderChangelog, validateTranslations } from '../landing/changelog'
import { VERSION } from '../src/worker/lib/version'
import { version as packageVersion } from '../package.json'
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
	it('is read by the build: releases newest first, each category once, in order, with entries', () => {
		const releases = parseChangelog(changelog)
		expect(releases.length).toBeGreaterThan(3)
		expect(releases.at(-1)!.date).toBe('2026-11-05')
		for (const release of releases) {
			expect(release.sections.length, release.date).toBeGreaterThan(0)
			const ranks = release.sections.map((section) => CATEGORIES.indexOf(section.category))
			expect(ranks, release.date).toEqual([...ranks].sort((a, b) => a - b))
			for (const section of release.sections) expect(section.items.length, `${release.date} ${section.category}`).toBeGreaterThan(0)
		}
	})

	// A site says which version it runs, and its owner's AI reads the releases above that one after an update. That only
	// works while the code, package.json and the newest heading agree, which is why a release and its number go in together.
	it('has the version the code calls itself as its newest heading', () => {
		const releases = parseChangelog(changelog)
		expect(releases[0]!.version, 'the newest heading in CHANGELOG.md is the version in package.json').toBe(packageVersion)
		expect(VERSION).toBe(packageVersion)
	})

	it('has a version on every release since 0.3.0, and only days before it', () => {
		const releases = parseChangelog(changelog)
		const versioned = releases.filter((release) => release.version)
		expect(versioned.at(-1)!.version).toBe('0.3.0')
		// Every day from before versions is already in the file: a new heading without one is a mistake.
		expect(releases.filter((release) => !release.version).map((release) => release.date)).toEqual(['2026-11-17', '2026-11-11', '2026-11-09', '2026-11-07', '2026-11-06', '2026-11-05'])
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
			for (let r = 0; r < english.length; r++) for (let s = 0; s < english[r]!.sections.length; s++) {
				for (let i = 0; i < english[r]!.sections[s]!.items.length; i++) {
					expect(prose(localized[r]!.sections[s]!.items[i]!.source), `${code} ${english[r]!.date} entry ${i + 1}`).not.toBe(prose(english[r]!.sections[s]!.items[i]!.source))
				}
			}
		}
	})

	it.each([
		['a missing entry', (text: string) => text.replace(/^- .+\n/m, '')],
		['an extra entry', (text: string) => text.replace(/(^- .+\n)/m, '$1$1')],
		['a mismatched date', (text: string) => text.replace('## 2026-11-17', '## 2026-11-16')],
		['a mismatched version', (text: string) => text.replace('## 0.3.0 - ', '## 0.2.2 - ')],
		['a missing version', (text: string) => text.replace('## 0.3.0 - ', '## ')],
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
		['nothing at all', '# Changelog\n', /no releases/],
		['a version that is not three numbers', day('0.3 - 2026-11-20'), /line 1: .*not a version and a date/],
		['a version with a letter in front', day('v0.3.1 - 2026-11-20'), /line 1: .*not a version and a date/],
		['a version after its date', day('2026-11-20 - 0.3.1'), /line 1: .*not a version and a date/],
		['a version below a day from before versions', `${day('2026-11-20')}\n${day('0.3.0 - 2026-11-19')}`, /line 6: 0\.3\.0 is below 2026-11-20/],
		['a newer release below an older one', `${day('0.3.1 - 2026-11-19')}\n${day('0.3.0 - 2026-11-20')}`, /line 6: .*comes after/],
		['the same version twice', `${day('0.3.1 - 2026-11-20')}\n${day('0.3.1 - 2026-11-20')}`, /line 1: 0\.3\.1 can't follow 0\.3\.1/],
		['a version that skips one', `${day('0.3.2 - 2026-11-20')}\n${day('0.3.0 - 2026-11-19')}`, /line 1: 0\.3\.2 can't follow 0\.3\.0\. .*next patch: 0\.3\.1/],
		['a patch with something for the owner to do', `${day('0.3.1 - 2026-11-20', '### Action needed\n- Redeploy.')}\n${day('0.3.0 - 2026-11-19')}`, /line 1: 0\.3\.1 can't follow 0\.3\.0\. It has "Action needed", so it is the next minor: 0\.4\.0/],
		['a minor with nothing for the owner to do', `${day('0.4.0 - 2026-11-20')}\n${day('0.3.0 - 2026-11-19')}`, /line 1: 0\.4\.0 can't follow 0\.3\.0\. It has no "Action needed", so it is the next patch: 0\.3\.1/],
		['a minor that keeps its patch', `${day('0.4.1 - 2026-11-20', '### Action needed\n- Redeploy.')}\n${day('0.3.5 - 2026-11-19')}`, /line 1: .*next minor: 0\.4\.0/],
	])('%s', (_name, source, message) => {
		expect(() => parseChangelog(source)).toThrow(message)
	})

	it('reads versions that follow each other, two on one day, a new major, and the days from before versions below', () => {
		const releases = parseChangelog(
			[
				day('1.0.0 - 2026-11-22'),
				day('0.4.1 - 2026-11-21'),
				day('0.4.0 - 2026-11-21', '### Action needed\n- Redeploy.\n### Fixed\n- An entry.'),
				day('0.3.10 - 2026-11-20'),
				day('0.3.9 - 2026-11-19'),
				day('2026-11-19'),
				day('2026-11-17'),
			].join('\n'),
		)
		expect(releases.map((release) => release.version)).toEqual(['1.0.0', '0.4.1', '0.4.0', '0.3.10', '0.3.9', null, null])
		expect(releases[2]!.line).toBe(11)
	})

	it('names the next version by what the release asks of an owner', () => {
		expect(nextVersion('0.3.4', false)).toBe('0.3.5')
		expect(nextVersion('0.3.4', true)).toBe('0.4.0')
		expect(nextVersion('0.9.9', true)).toBe('0.10.0')
		expect(nextVersion('1.2.3', false)).toBe('1.2.4')
	})

	it('allows only `code` and https links as markup, and escapes the rest', () => {
		expect(inlineHtml('Use `a<b` & [the docs](https://example.com/a?b=1&c=2) <script>', 1)).toBe(
			'Use <code>a&lt;b</code> &amp; <a href="https://example.com/a?b=1&amp;c=2" rel="noopener">the docs</a> &lt;script&gt;',
		)
	})
})

describe('the changelog page', () => {
	const releases = parseChangelog(changelog)
	it('has every text in every language, with no markup of its own in them', () => {
		for (const code of LOCALES) for (const key of templateKeys(changelogTemplate)) {
			expect(of(code)[key], `${code} ${key}`).toBeTruthy()
			expect(of(code)[key], `${code} ${key}`).not.toMatch(/[<>]/)
		}
	})
	it('is one page a language, with localized entries and the right direction', () => {
		for (const code of LOCALES) {
			const labels = categoryLabels(of(code))
			const localized = code === 'en' ? releases : parseChangelog(translation(code), labels, `landing/changelog/${code}.md`)
			const page = renderChangelog(changelogTemplate, of(code), code, localized, labels)
			expect(page, code).toContain(`<link rel="canonical" href="${SITE}${changelogPath(code)}">`)
			expect(page, code).toContain(`<a href="${changelogPath(code)}" lang="${code}" hreflang="${code}" aria-current="true">`)
			expect(page, code).toContain(`<div class="col log" lang="${code}"${code === 'ar' ? ' dir="rtl"' : ''}>`)
			for (const label of Object.values(labels)) expect(page, code).toContain(`<h3>${label}</h3>`)
			// A release is found by its version, a day from before versions by its date.
			expect(page, code).toContain('<section class="rel" id="v0.3.0">\n<h2><span class="ver">0.3.0</span> <time datetime=')
			expect(page, code).toContain('<section class="rel" id="2026-11-17">\n<h2><time datetime="2026-11-17">2026-11-17</time></h2>')
			expect(page, code).toContain(code === 'ar' ? 'dir="rtl"' : '<html')
			expect(page, code).not.toMatch(/\{\{/)
		}
		expect(renderChangelog(changelogTemplate, of('ar'), 'ar', parseChangelog(translation('ar'), categoryLabels(of('ar')), 'landing/changelog/ar.md'), categoryLabels(of('ar')))).toMatch(/<html lang="ar" dir="rtl">/)
	})
	it('has no script and asks nobody else for anything, in any language', () => {
		for (const code of LOCALES) {
			const labels = categoryLabels(of(code))
			const localized = code === 'en' ? releases : parseChangelog(translation(code), labels, `landing/changelog/${code}.md`)
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
