// The changelog page of fluxbio.link, made from CHANGELOG.md in the repository root, which is its only source.
// CHANGELOG.md has one narrow format, so that a line nobody can read stops the build with its number, not the page with a guess:
//
//   ## 2026-11-17            one heading a day, newest first
//   ### Fixed               a category from CATEGORIES, in that order, each at most once a day
//   - An entry on one line, with `code` and [links](https://example.com) as its only markup.
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

export interface ChangelogDay {
	date: string
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

/** The days in CHANGELOG.md, newest first. Throws with the line number of the first thing it can't read. */
export function parseChangelog(source: string, labels: CategoryLabels = Object.fromEntries(CATEGORIES.map((name) => [name, name])) as CategoryLabels, file = 'CHANGELOG.md'): ChangelogDay[] {
	const days: ChangelogDay[] = []
	let day: ChangelogDay | null = null
	let section: ChangelogDay['sections'][number] | null = null
	const closeSection = (line: number) => {
		if (section && !section.items.length) throw new Error(`${file} line ${line}: "### ${labels[section.category]}" has no entries.`)
	}
	const closeDay = (line: number) => {
		closeSection(line)
		if (day && !day.sections.length) throw new Error(`${file} line ${line}: "## ${day.date}" has no categories.`)
	}
	const lines = source.split(/\r?\n/)
	for (const [index, text] of lines.entries()) {
		const line = index + 1
		if (text.startsWith('## ')) {
			closeDay(line)
			const date = text.slice(3).trim()
			if (!isRealDate(date)) throw new Error(`${file} line ${line}: "${date}" is not a date written YYYY-MM-DD.`)
			const previous = days.at(-1)
			if (previous && date >= previous.date) throw new Error(`${file} line ${line}: ${date} comes after ${previous.date}: days go newest first, each once.`)
			day = { date, sections: [] }
			days.push(day)
			section = null
		} else if (text.startsWith('### ')) {
			if (!day) throw new Error(`CHANGELOG.md line ${line}: a category before the first "## YYYY-MM-DD".`)
			closeSection(line)
			const name = text.slice(4).trim()
			const category = CATEGORIES.find((candidate) => labels[candidate] === name)
			const rank = category ? CATEGORIES.indexOf(category) : -1
			if (rank < 0) throw new Error(`${file} line ${line}: "${name}" is not a category. They are ${CATEGORIES.map((candidate) => labels[candidate]).join(', ')}.`)
			const before = day.sections.at(-1)
			if (before && CATEGORIES.indexOf(before.category) >= rank) throw new Error(`${file} line ${line}: "${name}" is out of order or repeated in ${day.date}. The order is ${CATEGORIES.map((candidate) => labels[candidate]).join(', ')}.`)
			section = { category: category!, items: [] }
			day.sections.push(section)
		} else if (text.startsWith('- ')) {
			if (!section) throw new Error(`${file} line ${line}: an entry before any "### category" of a day.`)
			if (!text.slice(2).trim()) throw new Error(`${file} line ${line}: an empty entry.`)
			const source = text.slice(2).trim()
			try { section.items.push({ html: inlineHtml(source, line), source, line }) }
			catch (error) { throw new Error(String(error).replaceAll('CHANGELOG.md', file)) }
		} else if (text.trim() && day) {
			throw new Error(`${file} line ${line}: can't read "${text.slice(0, 40)}". Under a day there are only "### category" lines and "- entry" lines.`)
		} else if (text.trim() && /^\s*[-*+]\s|^#{1,6}\s/.test(text) && !text.startsWith('# ')) {
			throw new Error(`${file} line ${line}: an entry or heading before the first "## YYYY-MM-DD".`)
		}
	}
	closeDay(lines.length)
	if (!days.length) throw new Error(`${file} has no days: it needs "## YYYY-MM-DD" headings.`)
	return days
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
		let days: ChangelogDay[]
		try { days = parseChangelog(translation.source, translation.labels, file) }
		catch (error) { throw new Error(`${locale}: ${error instanceof Error ? error.message : String(error)}`) }
		const mismatch = (line: number, reason: string): never => { throw new Error(`${locale}: ${file} line ${line}: ${reason}`) }
		if (days.length !== english.length) mismatch(days.at(-1)?.sections[0]?.items[0]?.line ?? 1, `has ${days.length} days; CHANGELOG.md has ${english.length}.`)
		for (let d = 0; d < english.length; d++) {
			const expected = english[d]!, actual = days[d]!
			const line = actual.sections[0]?.items[0]?.line ?? 1
			if (actual.date !== expected.date) mismatch(line, `date ${actual.date} does not match ${expected.date}.`)
			if (actual.sections.length !== expected.sections.length) mismatch(line, `${actual.date} has ${actual.sections.length} categories; expected ${expected.sections.length}.`)
			for (let s = 0; s < expected.sections.length; s++) {
				const expectedSection = expected.sections[s]!, actualSection = actual.sections[s]!
				const sectionLine = actualSection.items[0]?.line ?? line
				if (actualSection.category !== expectedSection.category) mismatch(sectionLine, `${actual.date} category ${actualSection.category} does not match ${expectedSection.category}.`)
				if (actualSection.items.length !== expectedSection.items.length) mismatch(sectionLine, `${actual.date} ${actualSection.category} has ${actualSection.items.length} entries; expected ${expectedSection.items.length}.`)
				for (let i = 0; i < expectedSection.items.length; i++) {
					const expectedTokens = markup(expectedSection.items[i]!.source), actualTokens = markup(actualSection.items[i]!.source)
					if (JSON.stringify(actualTokens) !== JSON.stringify(expectedTokens)) mismatch(actualSection.items[i]!.line, `inline code or links differ from CHANGELOG.md entry ${i + 1} in ${actual.date} ${actualSection.category}.`)
				}
			}
		}
	}
}

function daysHtml(days: ChangelogDay[], labels: CategoryLabels): string {
	return days
		.map(
			(day) =>
				`<section class="day" id="${day.date}">\n<h2><time datetime="${day.date}">${day.date}</time></h2>\n${day.sections
					.map(
						(section) =>
							`<div class="cat${section.category === 'Action needed' ? ' act' : ''}"><h3>${escapeHtml(labels[section.category])}</h3><ul>${section.items.map((item) => `<li>${item.html}</li>`).join('')}</ul></div>`,
					)
					.join('\n')}\n</section>`,
		)
		.join('\n')
}

/** Render a changelog page with the selected locale's framing, categories and entries. */
export function renderChangelog(template: string, words: Record<string, string>, locale: Locale, days: ChangelogDay[], labels: CategoryLabels): string {
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
		days: daysHtml(days, labels),
	}
	const withText = template.replace(/\{\{(s\d+)\}\}/g, (match, key: string) => words[key] ?? match)
	return withText.replace(/\{\{@(\w+)\}\}/g, (match, name: string) => special[name] ?? match)
}
