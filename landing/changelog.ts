// The changelog page of fluxbio.link, made from CHANGELOG.md in the repository root, which is its only source.
// CHANGELOG.md has one narrow format, so that a line nobody can read stops the build with its number, not the page with a guess:
//
//   ## 0.3.1 - 2026-11-20   one heading a release, newest first: its version, and the day it reached main
//   ### Fixed               a category from CATEGORIES, in that order, each at most once a release
//   - An entry on one line, with `code` and [links](https://example.com) as its only markup.
//
// The version says whether updating takes more than a deploy: a release with "Action needed" is the next minor
// (0.3.4 → 0.4.0), any other the next patch (0.3.4 → 0.3.5), and a new major may come at any time. nextVersion() is
// that rule, and a heading that breaks it stops the build. The headings from before 0.3.0 are a day each, with no
// version ("## 2026-11-17"): every site of those days called itself 0.2.1, so they stay as they were, below the rest.
//
// Anything before the first "## " is for people reading the file on GitHub, and is not on the page.

import { LOCALES, type Locale } from '../src/shared/content'
import { dirAttribute } from '../src/shared/locale'
import { logoSvg } from '../src/templates/icons'
import { fontsHtml } from './fonts'
import { changelogPath, languageLinks, pagePath, readmeUrl, SITE } from './render'

export { LOCALES }

/** The categories, in the order a day lists them. What a self-hosting owner has to do comes first. */
export const CATEGORIES = ['Action needed', 'Security', 'New', 'Changed', 'Fixed'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Release {
	/** Null for the days before 0.3.0, which had no version of their own. */
	version: string | null
	date: string
	/** The line of its heading. */
	line: number
	sections: { category: Category; items: { html: string; source: string; line: number }[] }[]
}

export type CategoryLabels = Record<Category, string>

export function categoryLabels(words: Record<string, string>): CategoryLabels {
	return Object.fromEntries(CATEGORIES.map((category, index) => [category, words[`s${214 + index}`] ?? ''])) as CategoryLabels
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** One entry as HTML: `code` and [text](https://…) are the markup, and everything else is text. */
export function inlineHtml(entry: string, line: number): string {
	let html = ''
	let last = 0
	const text = (part: string) => {
		if (/[`\[\]]/.test(part)) throw new Error(`CHANGELOG.md line ${line}: a backtick or bracket that is not part of \`code\` or [text](https://…).`)
		return escapeHtml(part)
	}
	for (const match of entry.matchAll(/`([^`]+)`|\[([^\[\]`]+)\]\((https:\/\/[^\s)"<>]+)\)/g)) {
		html += text(entry.slice(last, match.index))
		html += match[1] !== undefined ? `<code>${escapeHtml(match[1])}</code>` : `<a href="${escapeHtml(match[3]!)}" rel="noopener">${escapeHtml(match[2]!)}</a>`
		last = match.index + match[0].length
	}
	return html + text(entry.slice(last))
}

function isRealDate(date: string): boolean {
	const parsed = new Date(`${date}T00:00:00Z`)
	return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

/** What a heading calls its release: "0.3.1 - 2026-11-20", or the day alone for those before versions. */
export const releaseName = (release: Pick<Release, 'version' | 'date'>) => (release.version ? `${release.version} - ${release.date}` : release.date)

/** The version that follows `version`: the next minor when the release has something for an owner to do, else the next patch. */
export function nextVersion(version: string, actionNeeded: boolean): string {
	const [major, minor, patch] = version.split('.').map(Number) as [number, number, number]
	return actionNeeded ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
}

const nextMajor = (version: string) => `${Number(version.split('.')[0]) + 1}.0.0`

/** The releases in CHANGELOG.md, newest first. Throws with the line number of the first thing it can't read. */
export function parseChangelog(source: string, labels: CategoryLabels = Object.fromEntries(CATEGORIES.map((name) => [name, name])) as CategoryLabels, file = 'CHANGELOG.md'): Release[] {
	const releases: Release[] = []
	let release: Release | null = null
	let section: Release['sections'][number] | null = null
	const closeSection = (line: number) => {
		if (section && !section.items.length) throw new Error(`${file} line ${line}: "### ${labels[section.category]}" has no entries.`)
	}
	const closeRelease = (line: number) => {
		closeSection(line)
		if (release && !release.sections.length) throw new Error(`${file} line ${line}: "## ${releaseName(release)}" has no categories.`)
	}
	const lines = source.split(/\r?\n/)
	for (const [index, text] of lines.entries()) {
		const line = index + 1
		if (text.startsWith('## ')) {
			closeRelease(line)
			const heading = text.slice(3).trim()
			const parts = heading.split(' - ')
			const date = parts.at(-1)!
			const version = parts.length === 2 ? parts[0]! : null
			if (parts.length > 2 || (version !== null && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))) throw new Error(`${file} line ${line}: "${heading}" is not a version and a date, written like 0.3.1 - 2026-11-20.`)
			if (!isRealDate(date)) throw new Error(`${file} line ${line}: "${date}" is not a date written YYYY-MM-DD.`)
			const newer = releases.at(-1)
			if (newer) {
				if (version && !newer.version) throw new Error(`${file} line ${line}: ${version} is below ${newer.date}, a day from before versions: releases go newest first.`)
				// Two releases can reach main on one day; two of the old days can't be the same day.
				if (date > newer.date || (date === newer.date && !newer.version)) throw new Error(`${file} line ${line}: ${date} comes after ${newer.date}: releases go newest first, and each day from before versions once.`)
				if (version && newer.version) {
					const action = newer.sections.some((candidate) => candidate.category === 'Action needed')
					const expected = nextVersion(version, action)
					if (newer.version !== expected && newer.version !== nextMajor(version)) {
						throw new Error(`${file} line ${newer.line}: ${newer.version} can't follow ${version}. ${action ? `It has "${labels['Action needed']}", so it is the next minor` : `It has no "${labels['Action needed']}", so it is the next patch`}: ${expected}.`)
					}
				}
			}
			release = { version, date, line, sections: [] }
			releases.push(release)
			section = null
		} else if (text.startsWith('### ')) {
			if (!release) throw new Error(`CHANGELOG.md line ${line}: a category before the first "## " heading.`)
			closeSection(line)
			const name = text.slice(4).trim()
			const category = CATEGORIES.find((candidate) => labels[candidate] === name)
			const rank = category ? CATEGORIES.indexOf(category) : -1
			if (rank < 0) throw new Error(`${file} line ${line}: "${name}" is not a category. They are ${CATEGORIES.map((candidate) => labels[candidate]).join(', ')}.`)
			const before = release.sections.at(-1)
			if (before && CATEGORIES.indexOf(before.category) >= rank) throw new Error(`${file} line ${line}: "${name}" is out of order or repeated in ${releaseName(release)}. The order is ${CATEGORIES.map((candidate) => labels[candidate]).join(', ')}.`)
			section = { category: category!, items: [] }
			release.sections.push(section)
		} else if (text.startsWith('- ')) {
			if (!section) throw new Error(`${file} line ${line}: an entry before any "### category" of a release.`)
			if (!text.slice(2).trim()) throw new Error(`${file} line ${line}: an empty entry.`)
			const source = text.slice(2).trim()
			try { section.items.push({ html: inlineHtml(source, line), source, line }) }
			catch (error) { throw new Error(String(error).replaceAll('CHANGELOG.md', file)) }
		} else if (text.trim() && release) {
			throw new Error(`${file} line ${line}: can't read "${text.slice(0, 40)}". Under a release there are only "### category" lines and "- entry" lines.`)
		} else if (text.trim() && /^\s*[-*+]\s|^#{1,6}\s/.test(text) && !text.startsWith('# ')) {
			throw new Error(`${file} line ${line}: an entry or heading before the first "## " heading.`)
		}
	}
	closeRelease(lines.length)
	if (!releases.length) throw new Error(`${file} has no releases: it needs "## 0.3.1 - 2026-11-20" headings.`)
	return releases
}

const markup = (source: string) => ({
	code: [...source.matchAll(/`([^`]+)`/g)].map((match) => match[1]).sort(),
	links: [...source.matchAll(/\[[^\]]+\]\((https:\/\/[^\s)]+)\)/g)].map((match) => match[1]).sort(),
})

/** Compare all translation structure and protected inline tokens against the English source. */
export function validateTranslations(source: string, translations: Record<string, { source: string; labels: CategoryLabels }>): void {
	const english = parseChangelog(source)
	for (const [locale, translation] of Object.entries(translations)) {
		const file = `landing/changelog/${locale}.md`
		let releases: Release[]
		try { releases = parseChangelog(translation.source, translation.labels, file) }
		catch (error) { throw new Error(`${locale}: ${error instanceof Error ? error.message : String(error)}`) }
		const mismatch = (line: number, reason: string): never => { throw new Error(`${locale}: ${file} line ${line}: ${reason}`) }
		if (releases.length !== english.length) mismatch(releases.at(-1)?.line ?? 1, `has ${releases.length} releases; CHANGELOG.md has ${english.length}.`)
		for (let r = 0; r < english.length; r++) {
			const expected = english[r]!, actual = releases[r]!
			const name = releaseName(actual)
			if (name !== releaseName(expected)) mismatch(actual.line, `heading ${name} does not match ${releaseName(expected)}.`)
			if (actual.sections.length !== expected.sections.length) mismatch(actual.line, `${name} has ${actual.sections.length} categories; expected ${expected.sections.length}.`)
			for (let s = 0; s < expected.sections.length; s++) {
				const expectedSection = expected.sections[s]!, actualSection = actual.sections[s]!
				const sectionLine = actualSection.items[0]?.line ?? actual.line
				if (actualSection.category !== expectedSection.category) mismatch(sectionLine, `${name} category ${actualSection.category} does not match ${expectedSection.category}.`)
				if (actualSection.items.length !== expectedSection.items.length) mismatch(sectionLine, `${name} ${actualSection.category} has ${actualSection.items.length} entries; expected ${expectedSection.items.length}.`)
				for (let i = 0; i < expectedSection.items.length; i++) {
					const expectedTokens = markup(expectedSection.items[i]!.source), actualTokens = markup(actualSection.items[i]!.source)
					if (JSON.stringify(actualTokens) !== JSON.stringify(expectedTokens)) mismatch(actualSection.items[i]!.line, `inline code or links differ from CHANGELOG.md entry ${i + 1} in ${name} ${actualSection.category}.`)
				}
			}
		}
	}
}

/** A release's place on the page: /en/changelog/#v0.3.1, or the day for those before versions. */
export const releaseAnchor = (release: Pick<Release, 'version' | 'date'>) => (release.version ? `v${release.version}` : release.date)

function releasesHtml(releases: Release[], labels: CategoryLabels): string {
	return releases
		.map(
			(release) =>
				`<section class="rel" id="${releaseAnchor(release)}">\n<h2>${release.version ? `<span class="ver">${release.version}</span> ` : ''}<time datetime="${release.date}">${release.date}</time></h2>\n${release.sections
					.map(
						(section) =>
							`<div class="cat${section.category === 'Action needed' ? ' act' : ''}"><h3>${escapeHtml(labels[section.category])}</h3><ul>${section.items.map((item) => `<li>${item.html}</li>`).join('')}</ul></div>`,
					)
					.join('\n')}\n</section>`,
		)
		.join('\n')
}

/** Render a changelog page with the selected locale's framing, categories and entries. */
export function renderChangelog(template: string, words: Record<string, string>, locale: Locale, releases: Release[], labels: CategoryLabels): string {
	const head = [
		`<link rel="canonical" href="${SITE}${changelogPath(locale)}">`,
		...LOCALES.map((code) => `<link rel="alternate" hreflang="${code}" href="${SITE}${changelogPath(code)}">`),
		`<link rel="alternate" hreflang="x-default" href="${SITE}${changelogPath('en')}">`,
	].join('\n')
	const special: Record<string, string> = {
		head,
		lang: locale,
		htmlLang: locale === 'zh-TW' ? 'zh-Hant-TW' : locale === 'zh-CN' ? 'zh-Hans-CN' : locale,
		dir: dirAttribute(locale),
		// Never Google's fonts: this page asks nobody else for anything. Arabic and Chinese are drawn in the visitor's own.
		fonts: fontsHtml('en'),
		logo: logoSvg(30),
		home: pagePath(locale),
		readme: readmeUrl(locale),
		languages: languageLinks(locale, 'changelog/'),
		releases: releasesHtml(releases, labels),
	}
	const withText = template.replace(/\{\{(s\d+)\}\}/g, (match, key: string) => words[key] ?? match)
	return withText.replace(/\{\{@(\w+)\}\}/g, (match, name: string) => special[name] ?? match)
}
