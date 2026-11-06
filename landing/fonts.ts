import type { Locale } from '../src/shared/content'

/**
 * The fonts of the fluxbio.link pages themselves (not of the sample pages in the phones, which load each theme's own
 * from Google as any FluxBio page does). They come from this site, so a visit connects to nobody else for them, no
 * stylesheet from elsewhere holds up the first paint, and a browser keeps each file for a year.
 *
 * IBM Plex is IBM's own web font files, unchanged, from the npm packages named below, with their licence beside
 * them in public/fonts/. They are under the SIL Open Font License with the reserved name "Plex": a file cut down
 * here could not keep the name, so these are the files IBM cut, by range of characters.
 *
 * Noto Sans TC is for the Traditional Chinese page alone. Whole, it is a hundred files a weight, so
 * `pnpm landing:fonts` asks Google Fonts for one file with only the characters that page shows and keeps it in
 * landing/.fonts/, out of git: a deploy makes it afresh, so new copy needs nothing done. Its reserved name is
 * "Source", which it doesn't use, so a cut-down file may keep its own. Without that file, or once the page shows a
 * character it lacks, the page links the font at Google as it always did.
 */

interface PlexFamily {
	family: string
	/** Under /fonts/: the package and its version, so a file's address never changes what it holds. */
	folder: string
	file: string
	weights: Record<number, string>
	/** The characters in each file, as IBM's own stylesheet gives them. A browser fetches a file only for a character in it. */
	ranges: Record<string, string>
}

export const PLEX: PlexFamily[] = [
	{
		family: 'IBM Plex Sans',
		// @ibm/plex-sans 1.1.0, fonts/split/woff2
		folder: 'plex-sans-1.1.0',
		file: 'IBMPlexSans',
		weights: { 400: 'Regular', 500: 'Medium', 600: 'SemiBold' },
		ranges: {
			Latin1: 'U+0000, U+000D, U+0020-007E, U+00A0-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2013-2014, U+2018-201A, U+201C-201E, U+2020-2022, U+2026, U+2030, U+2039-203A, U+2044, U+20AC, U+2122, U+2212, U+FB01-FB02',
			Latin2: 'U+0100-0101, U+0104-0130, U+0132-0151, U+0154-017F, U+018F, U+0192, U+01A0-01A1, U+01AF-01B0, U+01FA-01FF, U+0218-021B, U+0237, U+0259, U+1E80-1E85, U+1E9E, U+20A1, U+20A4, U+20A6, U+20A8-20AA, U+20AD-20AE, U+20B1-20B2, U+20B4-20B5, U+20B8-20BA, U+20BD, U+20BF',
			Latin3: 'U+0102-0103, U+01CD-01DC, U+1EA0-1EF9, U+20AB',
			Pi: 'U+0E3F, U+2000-200D, U+2015, U+2028-2029, U+202F, U+2032-2033, U+2070, U+2074-2079, U+2080-2089, U+2113, U+2116, U+2126, U+212E, U+2150-2151, U+2153-215E, U+2190-2199, U+21A9-21AA, U+21B0-21B3, U+21B6-21B7, U+21BA-21BB, U+21C4, U+21C6, U+2202, U+2206, U+220F, U+2211, U+2215, U+221A, U+221E, U+222B, U+2248, U+2260, U+2264-2265, U+25CA, U+2713, U+274C, U+2B0E-2B11, U+ECE0, U+EFCC, U+FEFF, U+FFFD',
		},
	},
	{
		family: 'IBM Plex Mono',
		// @ibm/plex-mono 2.5.0, fonts/split/woff2
		folder: 'plex-mono-2.5.0',
		file: 'IBMPlexMono',
		weights: { 400: 'Regular', 500: 'Medium' },
		ranges: {
			Latin1: 'U+0020-007E, U+00A0-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2013-2014, U+2018-201A, U+201C-201E, U+2020-2022, U+2026, U+2030, U+2039-203A, U+2044, U+20AC, U+2122, U+2212, U+FB01-FB02',
			Latin2: 'U+0100-0101, U+0104-0130, U+0132-0151, U+0154-017F, U+018F, U+0192, U+01A0-01A1, U+01AF-01B0, U+01FA-01FF, U+0218-021B, U+0237, U+0259, U+1E80-1E85, U+1E9E, U+20A1, U+20A4, U+20A6, U+20A8-20AA, U+20AD-20AE, U+20B1-20B2, U+20B4-20B5, U+20B8-20BA, U+20BD, U+20BF',
			Latin3: 'U+0102-0103, U+01CD-01DC, U+1E0C-1E0D, U+1E12-1E13, U+1E24-1E25, U+1E36-1E37, U+1E3C-1E3D, U+1E40-1E47, U+1E4A-1E4B, U+1E62-1E63, U+1E6C-1E6D, U+1E70-1E71, U+1E92-1E93, U+1EA0-1EF9, U+20AB',
			Pi: 'U+03C0, U+0E3F, U+2000-200D, U+2010-2012, U+2015, U+2028-2029, U+202F, U+2032-2033, U+203E, U+205F, U+2070, U+2074-2079, U+2080-2089, U+2113, U+2116, U+2126, U+212E, U+2150-2151, U+2153-215E, U+2190-2199, U+21A9-21AA, U+21B0-21B3, U+21B6-21B7, U+21BA-21BB, U+21C4, U+21C6, U+2202, U+2206, U+220F, U+2211, U+2215, U+2219-221A, U+221E, U+222B, U+2236, U+2248, U+2260, U+2264-2265, U+2400-2421, U+2500-259F, U+25CA, U+2713, U+274C, U+2B0E-2B11, U+3000, U+FEFF, U+FFFD',
		},
	},
]

/** Every file the pages may ask for, as build.mjs finds them in public/fonts/. */
export const plexFiles = (): string[] =>
	PLEX.flatMap((font) => Object.values(font.weights).flatMap((weight) => Object.keys(font.ranges).map((range) => `${font.folder}/${font.file}-${weight}-${range}.woff2`)))

const face = (family: string, weight: string, url: string, range: string) =>
	`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${url}) format('woff2');unicode-range:${range}}`

const plexCss = (): string =>
	PLEX.flatMap((font) =>
		Object.entries(font.weights).flatMap(([weight, name]) => Object.entries(font.ranges).map(([range, characters]) => face(font.family, weight, `/fonts/${font.folder}/${font.file}-${name}-${range}.woff2`, characters))),
	).join('\n')

/** What `pnpm landing:fonts` leaves in landing/.fonts/fonts.json. */
export interface ChineseFont {
	family: string
	/** Every character it was asked to hold; Google leaves out the ones the font has no drawing of. */
	characters: string
	faces: { weight: string; file: string; range: string }[]
}

/**
 * The characters in a page beyond plain ASCII, each once, in order: what the Chinese font is asked for. All of the
 * file, not only what is between tags: a few too many cost nothing, and one too few shows in another font.
 */
export function charactersBeyondAscii(html: string): string {
	return [...new Set(html)].filter((character) => character.codePointAt(0)! > 0x7e).sort().join('')
}

/** Whether a font made earlier still has every character the page shows now. */
export function coversPage(font: ChineseFont | null | undefined, html: string): font is ChineseFont {
	if (!font?.faces.length) return false
	const held = new Set(font.characters)
	return [...charactersBeyondAscii(html)].every((character) => held.has(character))
}

const GOOGLE = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
const google = (family: string) => `${GOOGLE}\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}&amp;display=swap">`

/**
 * The fonts in a page's head. IBM Plex is always from here. The Arabic page still links IBM Plex Sans Arabic at
 * Google: IBM ships it whole, 70 KB a weight, where Google serves the Arabic alone at half that. The Traditional
 * Chinese page has Noto Sans TC from here when `chinese` is given, and from Google when it isn't.
 */
export function fontsHtml(locale: Locale, chinese?: ChineseFont | null): string {
	const own = [plexCss(), ...(locale === 'zh-TW' && chinese ? chinese.faces.map((entry) => face(chinese.family, entry.weight, `/fonts/noto-sans-tc/${entry.file}`, entry.range)) : [])]
	const elsewhere = locale === 'ar' ? google('IBM+Plex+Sans+Arabic:wght@400;500;600') : locale === 'zh-TW' && !chinese ? google('Noto+Sans+TC:wght@400;500;600') : ''
	return `${elsewhere ? `${elsewhere}\n` : ''}<style>${own.join('\n')}</style>`
}
