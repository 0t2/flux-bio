import { LOCALES, type Locale, type LocaleSetting } from './content'

/**
 * The language of the built-in text on public pages for one visitor: the
 * page language, unless the owner turned on more languages and the visitor's
 * browser prefers one of them.
 */
export function resolveLocale(locale: Locale, languages: readonly Locale[], acceptLanguage: string | null | undefined): Locale {
	if (!languages.length) return locale
	return negotiateLocale(acceptLanguage, [locale, ...languages], locale)
}

/** As resolveLocale, but `?lang=<code>` names one of the languages turned on outright: search engines and the owner's own checks use it. */
export function requestedLocale(asked: string | null | undefined, locale: Locale, languages: readonly Locale[], acceptLanguage: string | null | undefined): Locale {
	return [locale, ...languages].find((code) => code === asked) ?? resolveLocale(locale, languages, acceptLanguage)
}

/**
 * The page language and the languages turned on, from settings, a KV copy or
 * a backup. Before v0.3 these said "auto" for every language, English first;
 * anything unknown falls back to English alone.
 */
export function pageLanguages(locale: LocaleSetting | string | undefined, languages?: readonly string[]): { locale: Locale; languages: Locale[] } {
	if (locale === 'auto') return { locale: 'en', languages: LOCALES.filter((code) => code !== 'en') }
	const main: Locale = KNOWN.has(locale ?? '') ? (locale as Locale) : 'en'
	return { locale: main, languages: otherLanguages(main, languages ?? []) }
}

/** The turned-on languages without the page language or repeats, in the order of LOCALES. */
export function otherLanguages(locale: Locale, languages: readonly string[]): Locale[] {
	const wanted = new Set(languages)
	return LOCALES.filter((code) => code !== locale && wanted.has(code))
}

/** Languages written right to left, by their primary subtag. */
const RIGHT_TO_LEFT = new Set(['ar'])

/** Which way a language runs, for `dir` on a page. Layouts use logical CSS, so they follow it by themselves. */
export function textDirection(language: string): 'rtl' | 'ltr' {
	return RIGHT_TO_LEFT.has(language.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr'
}

/** The `dir` attribute for a page's <html>, empty for the default direction so those pages' markup stays as it was. */
export function dirAttribute(language: string): string {
	return textDirection(language) === 'rtl' ? ' dir="rtl"' : ''
}

/** A language tag for Intl. Arabic keeps the digits 0-9, as everywhere else in FluxBio, where Intl would use ٠-٩. */
export function intlTag(language: string): string {
	return language.split('-')[0]!.toLowerCase() === 'ar' ? `${language}-u-nu-latn` : language
}

/** Used when the visitor's browser asks for none of the supported languages. */
const FALLBACK: Locale = 'en'
// Real headers are a few dozen characters; anything longer is cut, never parsed in full.
const MAX_HEADER = 512
const MAX_RANGES = 24

const KNOWN = new Set<string>(LOCALES)
const EXACT = new Map<string, Locale>(LOCALES.map((locale) => [locale.toLowerCase(), locale]))
/** Primary language subtag → locale, for languages with one locale. Chinese and Portuguese are matched apart. */
const PRIMARY = new Map<string, Locale>([
	...LOCALES.filter((locale) => !locale.includes('-')).map((locale): [string, Locale] => [locale, locale]),
	// The old code for Indonesian, still sent by some Android versions.
	['in', 'id'],
])
const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo'])

/**
 * The supported locale a language tag stands for, or null. Chinese goes by
 * script (Hant, Hans), then region: Taiwan, Hong Kong and Macau read
 * Traditional, everywhere else (and bare "zh") Simplified. Any Portuguese
 * gets pt-BR; other languages match on their primary subtag.
 */
export function matchLanguageTag(tag: string): Locale | null {
	const lower = tag.trim().toLowerCase().replace(/_/g, '-')
	const exact = EXACT.get(lower)
	if (exact) return exact
	const subtags = lower.split('-')
	const primary = subtags[0] ?? ''
	if (primary === 'zh') {
		if (subtags.includes('hant')) return 'zh-TW'
		if (subtags.includes('hans')) return 'zh-CN'
		return subtags.some((subtag) => TRADITIONAL_REGIONS.has(subtag)) ? 'zh-TW' : 'zh-CN'
	}
	if (primary === 'pt') return 'pt-BR'
	return PRIMARY.get(primary) ?? null
}

/**
 * The best of `allowed` for an Accept-Language header: highest q wins, the
 * earlier one on a tie; `fallback` when the browser asks for none of them.
 */
export function negotiateLocale(header: string | null | undefined, allowed: readonly Locale[] = LOCALES, fallback: Locale = FALLBACK): Locale {
	if (!header) return fallback
	const permitted = new Set(allowed)
	let best: Locale | null = null
	let bestQ = 0
	for (const range of header.slice(0, MAX_HEADER).split(',', MAX_RANGES)) {
		const [tag = '', ...params] = range.split(';')
		let q = 1
		for (const param of params) {
			const [key = '', value = ''] = param.split('=')
			if (key.trim().toLowerCase() === 'q') q = quality(value)
		}
		if (q <= bestQ) continue
		const locale = matchLanguageTag(tag)
		if (!locale || !permitted.has(locale)) continue
		best = locale
		bestQ = q
		if (q >= 1) break
	}
	return best ?? fallback
}

/** "0.8" → 0.8; anything that isn't a number from 0 to 1 counts as 0, "not wanted". */
function quality(value: string): number {
	const q = Number(value.trim() || 'x')
	return Number.isFinite(q) && q >= 0 ? Math.min(q, 1) : 0
}
