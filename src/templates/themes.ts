import type { Locale, StoredAppearance, ThemeId } from '../shared/content'
import { findFont, fontAxis, headingWeight, LOCALE_SCRIPTS, type GoogleFont } from '../shared/fonts'
import { msg } from './msg'

export type FontKey = 'sans' | 'serif' | 'kai' | 'mono'
export type ButtonKey = 'pill' | 'rounded' | 'square' | 'shadow'

export interface Theme {
	id: ThemeId
	label: string
	en: string
	bg: string
	fg: string
	muted: string
	cardBg: string
	accent: string
	/** The second color: bands, panels and rules, depending on the theme. */
	accent2: string
	font: FontKey
	button: ButtonKey
	/** The Google Fonts family for the name and headings, with the weights its composition uses, while no font is picked. */
	head: { family: string; weights: number[] } | null
	/** Draw an icon on every link, even one that only has the generic chain. */
	rowIcons?: boolean
	/** How light a dark theme's background may get: Aurora's is a saturated color that white text still reads on. */
	darkMax?: number
	/** Background of content blocks: products, opening hours. */
	panel: string
	/** Text inputs inside those blocks. */
	field: string
	fieldBorder: string
	/** Dividers and heading rules. */
	line: string
	/** Stand-in behind images that haven't loaded or weren't uploaded. */
	placeholder: string
	/** The accent as text on the page background, when the theme's own accent is used. */
	accentText: string
	error: string
	/** "Open now" green. */
	ok: string
	dark: boolean
}

type ThemeSeed = Pick<Theme, 'id' | 'label' | 'en' | 'bg' | 'fg' | 'accent' | 'accent2' | 'font' | 'button' | 'head' | 'dark' | 'rowIcons' | 'darkMax'>

/** Everything else a theme needs, worked out from its background and text colors. */
function colored(seed: ThemeSeed, bg: string, fg: string): Theme {
	const away = seed.dark ? '#FFFFFF' : '#000000'
	// A panel lifts off the page: lighter on a tinted page, a shade darker on one that is already white.
	const quiet = seed.dark ? mix(bg, fg, 0.12) : luminance(bg) > 0.85 ? mix(bg, fg, 0.05) : mix(bg, '#FFFFFF', 0.55)
	return {
		...seed,
		bg,
		fg,
		// Read on panels as well as on the page, whichever is the harder of the two.
		muted: mutedFor(fg, contrast(fg, quiet) < contrast(fg, bg) ? quiet : bg),
		cardBg: quiet,
		panel: quiet,
		field: bg,
		fieldBorder: `1px solid ${mix(bg, fg, 0.35)}`,
		line: mix(bg, fg, 0.2),
		placeholder: mix(bg, fg, 0.1),
		accentText: readable(seed.accent, bg, 4.5, fg),
		error: readable(seed.dark ? '#FF8A8A' : '#B3261E', bg, 4.5, away),
		ok: readable(seed.dark ? '#7CE38B' : '#0B6B2C', bg, 4.5, away),
	}
}

const SEEDS: Record<ThemeId, ThemeSeed> = {
	liquid: { id: 'liquid', label: msg('霓虹'), en: 'Neon', bg: '#15122C', fg: '#F8F5FF', accent: '#A99BFF', accent2: '#66E7C7', font: 'sans', button: 'pill', head: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800] }, dark: true },
	editorial: { id: 'editorial', label: msg('全景'), en: 'Vista', bg: '#14252E', fg: '#FFFFFF', accent: '#FFFFFF', accent2: '#3E6A78', font: 'sans', button: 'pill', head: { family: 'Manrope', weights: [400, 500, 600, 700, 800] }, dark: true },
	brutal: { id: 'brutal', label: msg('方塊'), en: 'Tiles', bg: '#171921', fg: '#FFFFFF', accent: '#FFF6E9', accent2: '#EC6097', font: 'sans', button: 'rounded', head: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800] }, dark: true },
	jelly: { id: 'jelly', label: msg('糖果'), en: 'Candy', bg: '#FFE0CD', fg: '#381128', accent: '#FFDA53', accent2: '#548EEB', font: 'sans', button: 'pill', head: { family: 'Nunito', weights: [400, 500, 600, 700, 800] }, dark: false },
	minimal: { id: 'minimal', label: msg('留白'), en: 'Airy', bg: '#FFFFFF', fg: '#384540', accent: '#EAE5FA', accent2: '#E2F2E9', font: 'sans', button: 'rounded', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	aurora: { id: 'aurora', label: msg('極光'), en: 'Aurora', bg: '#6A4BD8', fg: '#FFFFFF', accent: '#C9FFDC', accent2: '#2F7FBF', font: 'sans', button: 'rounded', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, darkMax: 0.18, dark: true },
	notebook: { id: 'notebook', label: msg('卡片'), en: 'Card', bg: '#FFF8ED', fg: '#58334F', accent: '#58334F', accent2: '#58334F', font: 'sans', button: 'rounded', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	boutique: { id: 'boutique', label: msg('霧面'), en: 'Frost', bg: '#F3E8DC', fg: '#3C342E', accent: '#3C342E', accent2: '#CEAE8B', font: 'sans', button: 'rounded', head: { family: 'Nunito Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	sunset: { id: 'sunset', label: msg('晚霞'), en: 'Sunset', bg: '#FFFFFF', fg: '#4B3643', accent: '#C93A60', accent2: '#F2F3F5', font: 'sans', button: 'rounded', head: { family: 'Nunito Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	sky: { id: 'sky', label: msg('晴空'), en: 'Sky', bg: '#FFFFFF', fg: '#15365F', accent: '#246BCE', accent2: '#B7DDF8', font: 'sans', button: 'rounded', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	pop: { id: 'pop', label: msg('繽紛'), en: 'Pop', bg: '#FFFCFD', fg: '#38243F', accent: '#D81E7C', accent2: '#F94C9F', font: 'sans', button: 'pill', head: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	portrait: { id: 'portrait', label: msg('肖像'), en: 'Portrait', bg: '#232527', fg: '#F5F5F5', accent: '#F9D65C', accent2: '#303337', font: 'sans', button: 'rounded', head: { family: 'Manrope', weights: [400, 500, 600, 700, 800] }, dark: true },
	sheet: { id: 'sheet', label: msg('半版'), en: 'Sheet', bg: '#F5D8C5', fg: '#49362E', accent: '#A34830', accent2: '#FFF5ED', font: 'sans', button: 'rounded', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	rail: { id: 'rail', label: msg('側欄'), en: 'Rail', bg: '#10201D', fg: '#F5F5EE', accent: '#BFD4C6', accent2: '#0D1916', font: 'sans', button: 'rounded', head: { family: 'Manrope', weights: [400, 500, 600, 700, 800] }, dark: true },
	duo: { id: 'duo', label: msg('雙色'), en: 'Two-tone', bg: '#FBF1D6', fg: '#234B47', accent: '#F2C867', accent2: '#1C7A73', font: 'sans', button: 'rounded', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	relief: { id: 'relief', label: msg('浮雕'), en: 'Relief', bg: '#E8ECEE', fg: '#36464E', accent: '#758E83', accent2: '#CAD2D6', font: 'sans', button: 'rounded', head: { family: 'Nunito Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	bento: { id: 'bento', label: msg('便當'), en: 'Bento', bg: '#F7F6F0', fg: '#29372F', accent: '#C5B4E7', accent2: '#DFEBC7', font: 'sans', button: 'rounded', head: { family: 'Manrope', weights: [400, 500, 600, 700, 800] }, dark: false },
	dots: { id: 'dots', label: msg('圓鈕'), en: 'Dots', bg: '#2C2036', fg: '#FFF8F0', accent: '#F3B89D', accent2: '#C6AFF0', font: 'sans', button: 'pill', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, rowIcons: true, dark: true },
	pastel: { id: 'pastel', label: msg('粉彩'), en: 'Pastel', bg: '#FAF8F7', fg: '#494054', accent: '#C9B8F0', accent2: '#D9EEE3', font: 'sans', button: 'pill', head: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	letter: { id: 'letter', label: msg('信箋'), en: 'Letter', bg: '#F5EFE5', fg: '#5A4336', accent: '#E7D5C2', accent2: '#D4C5B4', font: 'serif', button: 'rounded', head: { family: 'Lora', weights: [400, 500, 600, 700] }, dark: false },
	obsidian: { id: 'obsidian', label: msg('曜石'), en: 'Obsidian', bg: '#0C1018', fg: '#F5F7FC', accent: '#6F8BE0', accent2: '#704784', font: 'sans', button: 'rounded', head: { family: 'Manrope', weights: [400, 500, 600, 700, 800] }, dark: true },
	moon: { id: 'moon', label: msg('滿月'), en: 'Moon', bg: '#F4DA55', fg: '#4B123E', accent: '#4B123E', accent2: '#FFF8E9', font: 'sans', button: 'pill', head: { family: 'DM Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	chips: { id: 'chips', label: msg('標籤'), en: 'Chips', bg: '#D8DEFA', fg: '#292A40', accent: '#4F58A4', accent2: '#D4EBF0', font: 'sans', button: 'pill', head: { family: 'Plus Jakarta Sans', weights: [400, 500, 600, 700, 800] }, dark: false },
	tracks: { id: 'tracks', label: msg('歌單'), en: 'Tracks', bg: '#E5ECE5', fg: '#234337', accent: '#D7E9DB', accent2: '#FFFDF8', font: 'sans', button: 'rounded', head: { family: 'Manrope', weights: [400, 500, 600, 700, 800] }, dark: false },
}

/** The web fonts (FONT_FAMILIES below) and the local fonts closest to them, all Traditional Chinese. */
const FAMILIES: Record<FontKey, string> = {
	sans: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei'",
	serif: "'Noto Serif TC', 'Songti TC', 'PMingLiU'",
	kai: "'LXGW WenKai TC', 'Kaiti TC', 'BiauKai', 'DFKai-SB'",
	mono: "'JetBrains Mono', 'Noto Sans TC', 'PingFang TC'",
}
const GENERIC: Record<FontKey, string> = { sans: 'system-ui, sans-serif', serif: 'serif', kai: 'serif', mono: 'ui-monospace, monospace' }

export const FONT_STACKS: Record<FontKey, string> = {
	sans: `${FAMILIES.sans}, ${GENERIC.sans}`,
	serif: `${FAMILIES.serif}, ${GENERIC.serif}`,
	kai: `${FAMILIES.kai}, ${GENERIC.kai}`,
	mono: `${FAMILIES.mono}, ${GENERIC.mono}`,
}

/**
 * The web fonts draw Chinese characters in their Traditional Chinese forms,
 * which look wrong in Simplified Chinese, Japanese and Korean. Pages in those
 * languages use the visitor's own fonts for the language instead and don't
 * load the Chinese web fonts; where none of the named fonts exists (Android),
 * the generic family at the end follows the page's `lang`.
 */
const CJK_FAMILIES: Partial<Record<Locale, Record<FontKey, string>>> = {
	'zh-CN': {
		sans: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'Source Han Sans SC'",
		serif: "'Songti SC', STSong, SimSun, 'Noto Serif SC', 'Source Han Serif SC'",
		kai: "'Kaiti SC', STKaiti, KaiTi, 'LXGW WenKai'",
		mono: "'JetBrains Mono', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC'",
	},
	ja: {
		sans: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', Meiryo, 'Noto Sans JP'",
		serif: "'Hiragino Mincho ProN', 'Yu Mincho', YuMincho, 'Noto Serif JP'",
		kai: "'UD Digi Kyokasho NK-R', YuKyokasho, 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP'",
		mono: "'JetBrains Mono', 'Hiragino Sans', 'Yu Gothic UI', Meiryo, 'Noto Sans JP'",
	},
	ko: {
		sans: "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR'",
		serif: "AppleMyungjo, 'Nanum Myeongjo', Batang, 'Noto Serif KR'",
		kai: "AppleMyungjo, 'Nanum Myeongjo', Batang, 'Noto Serif KR'",
		mono: "'JetBrains Mono', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR'",
	},
}
/** Thai has no Chinese characters, so Thai pages keep the web fonts and name Thai fonts before the generic family. */
const THAI_FAMILIES = "'Noto Sans Thai', 'Leelawadee UI', Thonburi, Tahoma"
/** Nor has Arabic. None of the web fonts draws it, so Arabic text falls through to the fonts named here. */
const ARABIC_FAMILIES: Record<FontKey, string> = {
	sans: "'Noto Sans Arabic', 'Geeza Pro', Tahoma",
	serif: "'Noto Naskh Arabic', 'Geeza Pro', 'Times New Roman'",
	kai: "'Noto Naskh Arabic', 'Geeza Pro', 'Times New Roman'",
	mono: "'Noto Sans Arabic', 'Geeza Pro', Tahoma",
}

/**
 * Latin text first for pages in other languages: the Chinese web fonts draw
 * ’ “ ” full-width, which reads as stray spaces in English ("won’ t"). Chinese
 * characters in the owner's own text still fall through to the Chinese fonts.
 */
const LATIN_FAMILIES: Record<FontKey, string> = {
	sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
	serif: "Georgia, 'Times New Roman'",
	kai: "Georgia, 'Times New Roman'",
	mono: "'JetBrains Mono'",
}

/** The font stack for a page's text in a language. */
export function fontStack(font: FontKey, locale: Locale = 'zh-TW'): string {
	const cjk = CJK_FAMILIES[locale]
	if (cjk) return `${cjk[font]}, ${GENERIC[font]}`
	if (locale === 'zh-TW') return FONT_STACKS[font]
	if (locale === 'th') return `${LATIN_FAMILIES[font]}, ${THAI_FAMILIES}, ${FAMILIES[font]}, ${GENERIC[font]}`
	if (locale === 'ar') return `${LATIN_FAMILIES[font]}, ${ARABIC_FAMILIES[font]}, ${FAMILIES[font]}, ${GENERIC[font]}`
	return `${LATIN_FAMILIES[font]}, ${FAMILIES[font]}, ${GENERIC[font]}`
}

/** System fonts for labels inside frames, which load no web fonts. */
export function uiFontStack(locale: Locale = 'zh-TW'): string {
	const local = CJK_FAMILIES[locale]?.sans ?? (locale === 'th' ? THAI_FAMILIES : locale === 'ar' ? ARABIC_FAMILIES.sans : "'PingFang TC', 'Noto Sans TC'")
	return `system-ui, -apple-system, ${local}, sans-serif`
}


const RADIUS: Record<ButtonKey, string> = { pill: '999px', rounded: '16px', square: '0px', shadow: '10px' }
const ICON_RADIUS: Record<ButtonKey, string> = { pill: '999px', rounded: '999px', square: '0px', shadow: '10px' }
const AVATAR_RADIUS: Record<ButtonKey, string> = { pill: '999px', rounded: '999px', square: '0px', shadow: '24px' }

const HEX = /^#[0-9a-fA-F]{6}$/

/** The bright colors of the themes that take a color per social account or link, or tint a field with several. They stay the same in every color set. */
const PALETTE = ['#EC6097', '#65D6D0', '#F7786B', '#A58CEE', '#7C9AF5', '#F3CB68']
const COLORFUL: readonly ThemeId[] = ['brutal', 'jelly', 'pop', 'dots', 'pastel', 'chips']

/** `hex` with its hue turned by `degrees`, for the second color of a gradient. */
function turnHue(hex: string, degrees: number): string {
	const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number]
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const light = (max + min) / 2
	const delta = max - min
	if (!delta) return hex
	const saturation = delta / (1 - Math.abs(2 * light - 1))
	const hue = (max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60
	const turned = (hue + degrees + 360) % 360
	const channel = (n: number) => {
		const k = (n + turned / 30) % 12
		const value = light - saturation * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
		return Math.round(value * 255).toString(16).padStart(2, '0')
	}
	return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase()
}

function rgbOf(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hexOf(rgb: readonly number[]): string {
	return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** `a` moved toward `b` by `amount`, from 0 (all `a`) to 1 (all `b`). */
export function mix(a: string, b: string, amount: number): string {
	const [x, y] = [rgbOf(a), rgbOf(b)]
	return hexOf(x.map((v, i) => v + ((y[i] ?? v) - v) * amount))
}

/** Hue (0–360), saturation and lightness (0–1). */
function luminance(hex: string): number {
	const [r, g, b] = rgbOf(hex).map((v) => {
		const c = v / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}) as [number, number, number]
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)]
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Near-black or white, whichever reads better on the accent color. */
export function inkFor(accent: string): string {
	const l = luminance(accent)
	return (l + 0.05) / 0.054 >= 1.05 / (l + 0.05) ? '#0B0B12' : '#FFFFFF'
}

/**
 * How dark a dark theme's background may be at most, and how light a light
 * theme's at least (relative luminance). Both keep the theme's own text at a
 * contrast of 7:1 or more, and its cards, which are drawn for that kind of
 * background, visible.
 */
const DARK_MAX = 0.04
const LIGHT_MIN = 0.35

/**
 * A background color made dark enough for a dark theme or light enough for a
 * light one, by mixing in black or white; colors that already fit are kept.
 * A theme's look is drawn for its kind of background, so a pale color on
 * Liquid becomes a dark shade of it instead of breaking the page.
 */
export function fitBackground(hex: string, dark: boolean, darkMax = DARK_MAX): string {
	const fits = (color: string) => (dark ? luminance(color) <= darkMax : luminance(color) >= LIGHT_MIN)
	const color = hex.toUpperCase()
	if (fits(color)) return color
	const target = dark ? '#000000' : '#FFFFFF'
	let [low, high] = [0, 1]
	for (let step = 0; step < 14; step++) {
		const middle = (low + high) / 2
		if (fits(mix(color, target, middle))) high = middle
		else low = middle
	}
	return mix(color, target, high)
}

/** `color`, moved toward `toward` until it reads at `min`:1 on `bg`. */
function readable(color: string, bg: string, min: number, toward: string): string {
	for (let amount = 0; amount <= 1; amount += 0.1) {
		const candidate = mix(color, toward, amount)
		if (contrast(candidate, bg) >= min) return candidate
	}
	return toward
}

/** Secondary text: the text color faded toward the background as far as 4.5:1 allows. */
function mutedFor(fg: string, bg: string): string {
	for (let amount = 0.35; amount > 0.01; amount -= 0.05) {
		const candidate = mix(fg, bg, amount)
		if (contrast(candidate, bg) >= 4.5) return candidate
	}
	return fg
}

/**
 * Themes that put the page's text right on the second color: as the ground of its buttons and panels, or at the far
 * end of the page's gradient. In the others it stays as chosen, because no text depends on it.
 */
export const TEXT_ON_SECOND_COLOR: readonly ThemeId[] = ['editorial', 'minimal', 'aurora', 'boutique', 'sky', 'portrait', 'sheet', 'rail', 'bento', 'moon', 'chips', 'tracks']

/** How much of the accent is in the tinted buttons of the themes that have them, on the page's background. */
const ACCENT_TINT: Partial<Record<ThemeId, number>> = { minimal: 0.5, bento: 0.45 }

/** A color with the page's text on it, moved toward the page's background just as far as that text needs: the background always reads. */
function groundFor(color: string, t: Theme): string {
	for (let amount = 0; amount < 1; amount += 0.05) {
		const candidate = mix(color, t.bg, amount)
		if (contrast(t.fg, candidate) >= 4.5 && contrast(t.muted, candidate) >= 3) return candidate
	}
	return t.bg
}

/**
 * The theme in the colors an AI set through the API. Text that wouldn't read
 * at 4.5:1 on the background is replaced by the theme's own; everything else
 * is worked out from the two.
 */
export function themeWithColors(t: Theme, bgSetting: string, fgSetting: string): Theme {
	const newBg = HEX.test(bgSetting)
	if (!newBg && !HEX.test(fgSetting)) return t
	const bg = newBg ? fitBackground(bgSetting, t.dark, t.darkMax) : t.bg
	const ink = bg === t.bg ? t.fg : readable(t.fg, bg, 7, t.dark ? '#FFFFFF' : '#000000')
	const fg = HEX.test(fgSetting) && contrast(fgSetting, bg) >= 4.5 ? fgSetting.toUpperCase() : ink
	return bg === t.bg && fg === t.fg ? t : colored(SEEDS[t.id], bg, fg)
}

/** A Google Fonts family a page uses, with the weights to load as a css2 axis ("700", "400;700", "400..700"). */
export interface WebFont {
	family: string
	axis: string
}

/** The built-in fonts' web families, with the weights each needs; the serif reads better from 500. */
const FONT_FAMILIES: Record<FontKey, [string, number[]][]> = {
	sans: [['Noto Sans TC', [400, 800]]],
	serif: [['Noto Serif TC', [500, 700]]],
	kai: [['LXGW WenKai TC', [400, 700]]],
	mono: [
		['JetBrains Mono', [400, 700]],
		['Noto Sans TC', [400, 700]],
	],
}
const BODY_WEIGHTS = [400, 500, 600, 700]

/** The css2 address that loads these families from Google, for the dashboard preview and pages published before fonts were hosted. */
export function googleFontsHref(fonts: readonly WebFont[]): string {
	if (!fonts.length) return ''
	const families = fonts.map((font) => `family=${font.family.replaceAll(' ', '+')}:wght@${font.axis}`)
	return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

/** A picked family on the list, or null when none is picked or it isn't on the list (anymore). */
function picked(name: string | undefined): GoogleFont | null {
	return name ? findFont(name) : null
}

export interface ResolvedAppearance {
	theme: Theme
	accent: string
	ink: string
	font: FontKey
	button: ButtonKey
	/** CSS custom properties for the page. */
	vars: Record<string, string>
	/** The heading family's boldest weight up to 700, for drawing the name on share cards. */
	headWeight: number
	/** Families to load: the theme's and the picked ones, by weights needed. */
	webFonts: WebFont[]
	/**
	 * Those of them that only draw what the fonts before them can't: the built-in Chinese font on a page in a
	 * language written without Chinese characters, whose stack names the visitor's own fonts first. A live page
	 * loads these for the Chinese it actually shows, if any (fontsHtml in render.ts).
	 */
	fallbackFonts: string[]
	/** The same families from Google (googleFontsHref), "" when there are none. */
	fontsHref: string
}

/** Applies the person's choices on top of the theme's defaults; `locale` picks fonts that suit the page's language. */
export function resolveAppearance(appearance: StoredAppearance, locale: Locale = 'zh-TW'): ResolvedAppearance {
	const base = THEMES[appearance.theme] ?? THEMES.liquid
	const accent = HEX.test(appearance.accent) ? appearance.accent.toUpperCase() : base.accent
	// Pages saved before v0.3 have no colors of their own.
	const t = themeWithColors(base, appearance.bg ?? '', appearance.fg ?? '')
	const second = HEX.test(appearance.accent2 ?? '') ? (appearance.accent2 as string).toUpperCase() : base.accent2
	const accent2 = TEXT_ON_SECOND_COLOR.includes(t.id) ? groundFor(second, t) : second
	// On the accent, the page's own colors read better than plain black or white when they can.
	const ink = [t.bg, t.fg, accent2].find((color) => contrast(color, accent) >= 4.5) ?? inkFor(accent)
	const onAccent2 = contrast(t.bg, accent2) >= 4.5 ? t.bg : contrast(t.fg, accent2) >= 4.5 ? t.fg : inkFor(accent2)
	const font: FontKey = appearance.font === 'auto' ? t.font : appearance.font
	const button: ButtonKey = appearance.button === 'auto' ? t.button : appearance.button
	// Picked Google fonts go first; characters they lack fall through to the built-in font for the language.
	const bodyFont = picked(appearance.bodyFont)
	const pickedHead = picked(appearance.headFont)
	// The theme's own heading face goes with its own font; any font the owner or their AI chose replaces it.
	const themeHead = !pickedHead && !bodyFont && appearance.font === 'auto' ? t.head : null
	const headFont = pickedHead ?? bodyFont ?? picked(themeHead?.family)
	const stack = fontStack(font, locale)
	// The theme's family sets Latin text too; Chinese, Japanese and Korean fall through to the stack.
	const bodyFamily = bodyFont?.family ?? themeHead?.family
	const body = bodyFamily ? `'${bodyFamily}', ${stack}` : stack
	const head = headFont ? `'${headFont.family}', ${body}` : body
	const webFonts = webFontsFor(font, locale, bodyFont, pickedHead, themeHead)
	const leading = [bodyFont?.family, pickedHead?.family, themeHead?.family]
	const fallbackFonts =
		locale === 'zh-TW' || CJK_FAMILIES[locale]
			? []
			: FONT_FAMILIES[font].map(([family]) => family).filter((family) => family !== 'JetBrains Mono' && !leading.includes(family) && webFonts.some((web) => web.family === family))
	const hard = button === 'shadow'
	const border = hard ? `2px solid ${t.fg}` : '0 solid transparent'
	const shadow = hard ? `4px 4px 0 ${t.fg}` : 'none'

	const vars: Record<string, string> = {
		'--bg': t.bg,
		'--fg': t.fg,
		'--muted': t.muted,
		'--card-bg': t.cardBg,
		'--card-border': border,
		'--card-shadow': shadow,
		'--accent': accent,
		'--ink': ink,
		'--accent2': accent2,
		'--on-accent2': onAccent2,
		'--radius': RADIUS[button],
		'--icon-radius': ICON_RADIUS[button],
		'--avatar-radius': AVATAR_RADIUS[button],
		'--avatar-border': border,
		'--avatar-shadow': hard ? `4px 4px 0 ${t.fg}` : 'none',
		'--feat-border': border,
		'--feat-shadow': shadow,
		'--body-font': body,
		'--head-font': head,
	}
	vars['--panel'] = t.panel
	vars['--field'] = t.field
	vars['--field-border'] = hard ? `2px solid ${t.fg}` : t.fieldBorder
	vars['--line'] = t.line
	vars['--ph'] = t.placeholder
	vars['--accent-text'] = accent === t.accent ? t.accentText : contrast(accent, t.bg) >= 3 ? accent : t.fg
	// Display and script families often have one weight. Headings stay bold, so characters from the
	// fallback font (Chinese next to a Latin script face) are bold, but the family isn't faked bold.
	const headWeight = themeHead ? (themeHead.weights.at(-1) ?? 700) : headFont ? headingWeight(headFont) : 700
	if (headWeight !== 700) vars['--head-synthesis'] = 'none'
	vars['--accent-shift'] = turnHue(accent, 38)
	const tint = ACCENT_TINT[t.id]
	if (tint) vars['--accent-tint'] = groundFor(mix(t.bg, accent, tint), t)
	if (COLORFUL.includes(t.id)) {
		PALETTE.forEach((color, index) => {
			vars[`--c${index + 1}`] = color
			vars[`--on-c${index + 1}`] = contrast(t.fg, color) >= 4.5 ? t.fg : inkFor(color)
		})
	}
	vars['--error'] = t.error
	vars['--ok'] = t.ok
	return { theme: t, accent, ink, font, button, vars, headWeight, webFonts, fallbackFonts, fontsHref: googleFontsHref(webFonts) }
}

function webFontsFor(font: FontKey, locale: Locale, body: GoogleFont | null, head: GoogleFont | null, themeHead: Theme['head']): WebFont[] {
	const wanted = new Map<string, number[]>()
	const add = (family: string, weights: number[]) => wanted.set(family, [...(wanted.get(family) ?? []), ...weights])
	// The built-in font stays for the characters a picked body font lacks. Pages that use the
	// visitor's own fonts for their language (see CJK_FAMILIES) leave the Chinese web fonts out.
	if (!body || !body.scripts.includes(LOCALE_SCRIPTS[locale])) {
		for (const [family, weights] of FONT_FAMILIES[font]) if (!CJK_FAMILIES[locale] || family === 'JetBrains Mono') add(family, weights)
	}
	if (themeHead) add(themeHead.family, themeHead.weights)
	if (body) add(body.family, BODY_WEIGHTS)
	if (head) add(head.family, [headingWeight(head)])
	return [...wanted].flatMap(([family, weights]) => {
		const known = findFont(family)
		return known ? [{ family, axis: fontAxis(known, weights) }] : []
	})
}

export const THEMES = Object.fromEntries(Object.values(SEEDS).map((seed) => [seed.id, colored(seed, seed.bg, seed.fg)])) as Record<ThemeId, Theme>

export const THEME_LIST: Theme[] = Object.values(THEMES)
