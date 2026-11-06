import type { Locale } from './content'
import { GOOGLE_FONTS } from './googleFonts'

/**
 * Google Fonts families pages can use. The list (googleFonts.ts) is generated
 * by scripts/google-fonts.mjs; public pages don't load them from Google: the
 * Worker copies the characters a page needs when it is published (see
 * src/worker/lib/fonts.ts).
 */

export const FONT_CATEGORIES = ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'] as const
export type FontCategory = (typeof FONT_CATEGORIES)[number]

/** The writing systems of the page languages. */
export const FONT_SCRIPTS = ['latin', 'vietnamese', 'thai', 'chinese-traditional', 'chinese-simplified', 'japanese', 'korean', 'arabic'] as const
export type FontScript = (typeof FONT_SCRIPTS)[number]

const CATEGORY_CODES: Record<string, FontCategory> = { s: 'sans-serif', r: 'serif', d: 'display', h: 'handwriting', m: 'monospace' }
// Keep in sync with SCRIPTS in scripts/google-fonts.mjs.
const SCRIPT_CODES: Record<string, FontScript> = {
	l: 'latin',
	v: 'vietnamese',
	t: 'thai',
	T: 'chinese-traditional',
	S: 'chinese-simplified',
	j: 'japanese',
	k: 'korean',
	a: 'arabic',
}

export interface GoogleFont {
	family: string
	category: FontCategory
	scripts: FontScript[]
	/** Upright weights, 100 to 900. */
	weights: number[]
	/** Weight is a variable axis: one file covers every weight in between. */
	variable: boolean
}

/** Google family names are letters, digits and spaces; checked before a name goes into CSS or a URL. */
export const FONT_FAMILY = /^[A-Za-z0-9](?:[A-Za-z0-9 ]{0,58}[A-Za-z0-9])?$/

export const LOCALE_SCRIPTS: Record<Locale, FontScript> = {
	'zh-TW': 'chinese-traditional',
	'zh-CN': 'chinese-simplified',
	en: 'latin',
	ja: 'japanese',
	ko: 'korean',
	es: 'latin',
	'pt-BR': 'latin',
	fr: 'latin',
	de: 'latin',
	id: 'latin',
	th: 'thai',
	vi: 'vietnamese',
	ar: 'arabic',
}

function parse(line: string): GoogleFont | null {
	const [family, category, scripts, weights, variable] = line.split('|')
	const kind = CATEGORY_CODES[category ?? '']
	if (!family || !kind || !scripts || !weights) return null
	return {
		family,
		category: kind,
		scripts: [...scripts].flatMap((code) => SCRIPT_CODES[code] ?? []),
		weights: [...weights].map((digit) => Number(digit) * 100),
		variable: variable === 'v',
	}
}

const found = new Map<string, GoogleFont>()

/**
 * A family by its exact name, or null. Reads one line of the list, and a family that is there is remembered:
 * a page asks for its few on every request, and looking through the whole list each time was a tenth of a page view.
 * Names that aren't on the list aren't kept, since anyone can make those up. Callers share what this returns, so
 * they don't change it.
 */
export function findFont(family: string): GoogleFont | null {
	const known = found.get(family)
	if (known) return known
	if (!FONT_FAMILY.test(family)) return null
	const at = GOOGLE_FONTS.indexOf(`\n${family}|`)
	if (at < 0) return null
	const font = parse(GOOGLE_FONTS.slice(at + 1, GOOGLE_FONTS.indexOf('\n', at + 1)))
	if (font) found.set(family, font)
	return font
}

let all: GoogleFont[] | null = null

/** Every family, by name. */
export function googleFonts(): GoogleFont[] {
	all ??= GOOGLE_FONTS.split('\n').flatMap((line) => parse(line) ?? [])
	return all
}

/** Shown first when nothing is searched: well-known families, and some for each page language. */
export const FEATURED_FONTS: readonly string[] = [
	'Inter',
	'Poppins',
	'Montserrat',
	'DM Sans',
	'Space Grotesk',
	'Outfit',
	'Manrope',
	'Syne',
	'Playfair Display',
	'Fraunces',
	'Cormorant Garamond',
	'DM Serif Display',
	'Lora',
	'Libre Baskerville',
	'Bebas Neue',
	'Archivo Black',
	'Righteous',
	'Caveat',
	'Pacifico',
	'Permanent Marker',
	'Special Elite',
	'Press Start 2P',
	'VT323',
	'Space Mono',
	'IBM Plex Mono',
	'Noto Sans TC',
	'Noto Serif TC',
	'LXGW WenKai TC',
	'Chiron GoRound TC',
	'Huninn',
	'Noto Sans SC',
	'ZCOOL KuaiLe',
	'Noto Sans JP',
	'Zen Maru Gothic',
	'M PLUS Rounded 1c',
	'Noto Sans KR',
	'Black Han Sans',
	'Kanit',
	'Prompt',
	'Be Vietnam Pro',
	'Noto Sans Arabic',
	'Cairo',
	'Tajawal',
	'Amiri',
]

export interface FontQuery {
	q?: string
	category?: FontCategory
	/** Only families that have this script's characters. */
	script?: FontScript
}

/** Families matching a search: exact name first, then names starting with it, then the rest; featured ones first when nothing is typed. */
export function searchFonts({ q = '', category, script }: FontQuery): GoogleFont[] {
	const needle = q.trim().toLowerCase().replace(/\s+/g, ' ')
	const matches = googleFonts().filter(
		(font) => (!category || font.category === category) && (!script || font.scripts.includes(script)) && (!needle || font.family.toLowerCase().includes(needle)),
	)
	const rank = (font: GoogleFont) => {
		const name = font.family.toLowerCase()
		if (!needle) {
			const featured = FEATURED_FONTS.indexOf(font.family)
			return featured < 0 ? FEATURED_FONTS.length : featured
		}
		return name === needle ? 0 : name.startsWith(needle) ? 1 : name.split(' ').some((word) => word.startsWith(needle)) ? 2 : 3
	}
	// Within a rank, featured families, then shorter names: "Playfair Display" before "Playfair Display SC".
	const featured = (font: GoogleFont) => (FEATURED_FONTS.includes(font.family) ? 0 : 1)
	return matches
		.map((font) => ({ font, rank: rank(font) }))
		.sort((a, b) => a.rank - b.rank || (needle ? featured(a.font) - featured(b.font) || a.font.family.length - b.font.family.length : 0))
		.map(({ font }) => font)
}

function nearest(weights: number[], wanted: number): number {
	return weights.reduce((best, weight) => {
		const [distance, bestDistance] = [Math.abs(weight - wanted), Math.abs(best - wanted)]
		return distance < bestDistance || (distance === bestDistance && weight > best) ? weight : best
	})
}

/** The weight headings use: bold when the family has it, else the closest it has. */
export function headingWeight(font: GoogleFont): number {
	return font.variable ? Math.min(Math.max(700, Math.min(...font.weights)), Math.max(...font.weights)) : nearest(font.weights, 700)
}

/**
 * The weights to load for a family as a Google Fonts css2 axis, e.g. "400..700"
 * for a variable family or "400;700" for one with separate files. Weights it
 * doesn't have become the closest it has; asking Google for a weight a family
 * lacks fails the whole request.
 */
export function fontAxis(font: GoogleFont, wanted: readonly number[]): string {
	if (font.variable) {
		const [low, high] = [Math.min(...font.weights), Math.max(...font.weights)]
		const clamp = (weight: number) => Math.min(Math.max(weight, low), high)
		const [from, to] = [clamp(Math.min(...wanted)), clamp(Math.max(...wanted))]
		return from === to ? String(from) : `${from}..${to}`
	}
	return [...new Set(wanted.map((weight) => nearest(font.weights, weight)))].sort((a, b) => a - b).join(';')
}

/** A family copied to this Worker when the page was published, as stored with the page. */
export interface HostedFont {
	family: string
	/** The css2 axis it was asked for, e.g. "400..700". */
	axis: string
	/** Fingerprint of the family, axis and characters; while it stays the same, the files are kept. */
	key: string
	/** One per weight Google answered with; weights of one variable file share it. */
	faces: { weight: string; file: string }[]
}

/** The address of a hosted font file. */
export const fontFileUrl = (file: string): string => `/_fonts/${file}.woff2`
export const FONT_FILE = /^[A-Za-z0-9-]{8,80}$/

/**
 * What a Chinese web font is for on a page in a language written without Chinese characters: those characters, kana,
 * and the punctuation and full-width forms set with them. Everything else on such a page is drawn by the fonts
 * named before it (fontStack in templates/themes.ts). It is asked about one character at a time, so it has no `g`.
 */
export const CHINESE_FONT_CHARACTER = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u{20000}-\u{3FFFF}]/u

/**
 * How many different characters Google Fonts cuts a font down to (`&text=`). Asked for one more, it says nothing and
 * sends the whole font, a hundred files for a Chinese one.
 */
export const GOOGLE_TEXT_LIMIT = 800

/** A family Google serves cut into a hundred files or so: Chinese, Japanese and Korean ones. Its stylesheet alone is tens of kilobytes. */
export const isSlicedFont = (font: GoogleFont): boolean => font.scripts.some((script) => script.startsWith('chinese') || script === 'japanese' || script === 'korean')

/** Every string in a value, functions included as their source text (which holds the words of a template). */
export function textOf(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'function') return String(value)
	if (value && typeof value === 'object') return Object.values(value).map(textOf).join('')
	return ''
}
