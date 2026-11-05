// The fluxbio.link landing page in each language, as static files. template.html
// has {{key}} for text (locales/<code>.json) and {{@name}} for values that depend
// on the language. build.mjs writes the result; nothing runs on a server.

/// <reference types="vite/client" />
import { LOCALES, type Locale } from '../src/shared/content'
import { dirAttribute } from '../src/shared/locale'
import { logoSvg } from '../src/templates/icons'
import { THEME_LIST } from '../src/templates/themes'

// Theme names are translated once, for the dashboard.
const DASHBOARD = import.meta.glob<Record<string, string>>('../src/admin/i18n/locales/*.json', { import: 'default', eager: true })

const NAMES: Record<Locale, string> = {
	'zh-TW': '繁體中文',
	'zh-CN': '简体中文',
	en: 'English',
	ja: '日本語',
	ko: '한국어',
	es: 'Español',
	'pt-BR': 'Português (Brasil)',
	fr: 'Français',
	de: 'Deutsch',
	id: 'Bahasa Indonesia',
	th: 'ไทย',
	vi: 'Tiếng Việt',
	ar: 'العربية',
}

const HTML_LANG: Partial<Record<Locale, string>> = { 'zh-TW': 'zh-Hant-TW', 'zh-CN': 'zh-Hans-CN' }

const REPO = 'https://github.com/0t2/flux-bio'

/** The README in that language: README.md is English, the others are in docs/. */
function readmeUrl(locale: Locale): string {
	return locale === 'en' ? `${REPO}#readme` : `${REPO}/blob/main/docs/README.${locale}.md`
}

/** Where the site lives. Share cards and search engines need whole addresses. */
export const SITE = 'https://fluxbio.link'

/** A language's address. English is also "/", which sends other browsers to their language (languageScript). */
const pagePath = (code: Locale) => (code === 'en' ? '/' : `/${code}/`)

function languageLinks(current: Locale): string {
	// English goes to /en/ from the menu: "/" would send someone who just picked it back to their browser's language.
	return LOCALES.map(
		(code) => `<a href="/${code}/" lang="${code}" hreflang="${code}"${code === current ? ' aria-current="true"' : ''}>${NAMES[code]}</a>`,
	).join('')
}

function themeName(label: string, locale: Locale): string {
	return locale === 'zh-TW' ? label : (DASHBOARD[`../src/admin/i18n/locales/${locale}.json`]?.[label] ?? label)
}

/** Every theme's place on the page, generated so a new theme only has to be added to src/templates/themes.ts. */
function themeParts(locale: Locale): Record<string, string> {
	const rows = THEME_LIST.map((theme) => {
		const name = themeName(theme.label, locale)
		return { id: theme.id, name, en: name === theme.en ? '' : `<span class="mono">${theme.en}</span>` }
	})
	return {
		themeTiles: rows
			.map(
				({ id, name, en }, index) =>
					`<figure data-in style="--i:${index % 6}"><div class="tile" data-scale><iframe src="/preview/${locale}/${id}" title="${name}" loading="lazy" tabindex="-1" scrolling="no"></iframe></div><figcaption><span class="tile-name"><b>${name}</b>${en}</span></figcaption></figure>`,
			)
			.join('\n'),
	}
}

/** The keys a language file must have: every {{key}} in the template. */
export function templateKeys(template: string): string[] {
	return [...new Set([...template.matchAll(/\{\{(s\d+)\}\}/g)].map((match) => match[1]!))].sort()
}

/** The page in one language. Texts are trusted HTML from this repository. */
export function renderLanding(template: string, words: Record<string, string>, locale: Locale, { home = false } = {}): string {
	const alternates = LOCALES.map((code) => `<link rel="alternate" hreflang="${code}" href="${SITE}${pagePath(code)}">`).join('')
	const head = [
		`<link rel="canonical" href="${SITE}${pagePath(locale)}">`,
		alternates,
		`<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
		`<meta property="og:image" content="${SITE}/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${SITE}/og.jpg">`,
		home ? '<script src="/language.js"></script>' : '',
	].join('\n')
	const special: Record<string, string> = {
		head,
		lang: locale,
		htmlLang: HTML_LANG[locale] ?? locale,
		dir: dirAttribute(locale),
		logo: logoSvg(30),
		readme: readmeUrl(locale),
		languages: languageLinks(locale),
		languageName: NAMES[locale],
		...themeParts(locale),
	}
	const withText = template.replace(/\{\{(s\d+)\}\}/g, (match, key: string) => words[key] ?? match)
	return withText.replace(/\{\{@(\w+)\}\}/g, (match, name: string) => special[name] ?? match)
}

/**
 * The page a browser should go to from "/", or null to stay on the English one: the first language it asks for that the
 * site has. The same rules as matchLanguageTag in src/shared/locale.ts. Its source is what language.js holds, so it has
 * to run as it is in any browser.
 */
export function pickLanguage(tags: readonly string[], plain: readonly string[]): string | null {
	for (var i = 0; i < tags.length; i++) {
		var tag = String(tags[i]).trim().toLowerCase().replace(/_/g, '-')
		var parts = tag.split('-')
		var first = parts[0]
		var match = null
		if (first === 'zh') match = parts.indexOf('hant') >= 0 ? 'zh-TW' : parts.indexOf('hans') >= 0 ? 'zh-CN' : /-(tw|hk|mo)(-|$)/.test(tag) ? 'zh-TW' : 'zh-CN'
		else if (first === 'pt') match = 'pt-BR'
		else if (first === 'in') match = 'id'
		else if (first && plain.indexOf(first) >= 0) match = first
		if (match) return match === 'en' ? null : match
	}
	return null
}

/** For "/". It runs before anything is drawn, and without JavaScript "/" simply stays English. */
export function languageScript(): string {
	const plain = LOCALES.filter((code) => !code.includes('-'))
	return `(function(){var to=(${pickLanguage.toString()})(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''],${JSON.stringify(plain)});if(to)location.replace('/'+to+'/')})();\n`
}

/** Crawlers need no previews, which are only ever seen framed. */
export function robotsTxt(): string {
	return `User-agent: *\nDisallow: /preview/\n\nSitemap: ${SITE}/sitemap.xml\n`
}

/** Each language is a <url> of its own that lists all of them, as hreflang in a sitemap has to be. */
export function sitemapXml(): string {
	const links = [
		...LOCALES.map((code) => `<xhtml:link rel="alternate" hreflang="${code}" href="${SITE}${pagePath(code)}"/>`),
		`<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`,
	].join('')
	const urls = LOCALES.map((code) => `<url><loc>${SITE}${pagePath(code)}</loc>${links}</url>`)
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
}
