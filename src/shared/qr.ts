/**
 * Styled QR Codes for print. Shared by the dashboard (live preview and
 * downloads) and the Worker, so nothing in here may touch the DOM.
 */
import { encode, QrCodeDataType } from 'uqr'
import { z } from './zod'
import { logoTile } from '../templates/icons'
import { msg } from '../templates/msg'

export const QR_SHAPES = ['square', 'rounded', 'dots'] as const
export type QrShape = (typeof QR_SHAPES)[number]

/** "default" follows the picture set for the link's page, else for the whole site, so changing that changes every code following it. */
export const QR_LOGOS = ['default', 'none', 'avatar', 'mark', 'upload'] as const
export type QrLogo = (typeof QR_LOGOS)[number]

export const QR_SIZE_IDS = ['card', 'sticker', 'poster'] as const
export type QrSize = (typeof QR_SIZE_IDS)[number]

/** Longest caption that can be printed under the code. */
export const QR_FRAME_TEXT_MAX = 40

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

/** An uploaded image's media id, e.g. "a1b2c3d4e5f6.webp". */
export const QR_MEDIA_ID = /^[\w.-]{1,80}$/

export const QrStyleSchema = z.object({
	/** Color of the modules, "#RRGGBB". */
	fg: hexColor,
	/** Background color, "#RRGGBB". */
	bg: hexColor,
	/** Shape of the data modules. Finder patterns are always solid. */
	shape: z.enum(QR_SHAPES),
	/** What sits in the middle of the code. */
	logo: z.enum(QR_LOGOS),
	/** Uploaded media id used when `logo` is "upload", e.g. "a1b2c3d4e5f6.webp". */
	logoMedia: z.string().regex(QR_MEDIA_ID).nullable(),
	/** Print `frameText` under the code. */
	frame: z.boolean(),
	frameText: z.string().max(QR_FRAME_TEXT_MAX),
	/** Print size, see `QR_SIZES`. */
	size: z.enum(QR_SIZE_IDS),
})
export type QrStyle = z.infer<typeof QrStyleSchema>

/** The picture a code following the default shows: its page's, else the site's. Null leaves the middle empty. */
export function defaultQrLogo(pageLogo: string | null | undefined, siteLogo: string | null | undefined): { media: string; from: 'page' | 'site' } | null {
	if (pageLogo) return { media: pageLogo, from: 'page' }
	return siteLogo ? { media: siteLogo, from: 'site' } : null
}

/** The media id of the picture in the middle of a code with this style, if it shows one. */
export function qrLogoMedia(style: Pick<QrStyle, 'logo' | 'logoMedia'>, around: { avatar?: string | null; pageLogo?: string | null; siteLogo?: string | null }): string | null {
	if (style.logo === 'avatar') return around.avatar ?? null
	if (style.logo === 'upload') return style.logoMedia
	if (style.logo === 'default') return defaultQrLogo(around.pageLogo, around.siteLogo)?.media ?? null
	return null
}

export const DEFAULT_QR_STYLE: QrStyle = {
	fg: '#0B0B12',
	bg: '#FFFFFF',
	shape: 'square',
	logo: 'default',
	logoMedia: null,
	frame: false,
	frameText: '',
	size: 'sticker',
}

export interface QrSwatch {
	name: string
	hex: string
}

export const QR_FG_SWATCHES: readonly QrSwatch[] = [
	{ name: msg('墨黑'), hex: '#0B0B12' },
	{ name: msg('紫羅蘭'), hex: '#5B3FE0' },
	{ name: msg('火焰橘'), hex: '#C2360B' },
	{ name: msg('森林綠'), hex: '#1B5E3B' },
	{ name: msg('螢光綠'), hex: '#CCFF4D' },
]

export const QR_BG_SWATCHES: readonly QrSwatch[] = [
	{ name: msg('白色'), hex: '#FFFFFF' },
	{ name: msg('米色'), hex: '#F2F1EC' },
	{ name: msg('檸檬黃'), hex: '#FFE14D' },
	{ name: msg('墨黑'), hex: '#0B0B12' },
]

/** Resolution of the PNG and PDF downloads. */
export const QR_DPI = 300

export interface QrSizeSpec {
	label: string
	/** Width of the whole image, quiet zone included. A caption makes it taller, not wider. */
	cm: number
	/** e.g. "5 cm · 300 dpi" */
	spec: string
}

const sizeSpec = (label: string, cm: number): QrSizeSpec => ({ label, cm, spec: `${cm} cm · ${QR_DPI} dpi` })

export const QR_SIZES: Record<QrSize, QrSizeSpec> = {
	card: sizeSpec(msg('名片'), 2.5),
	sticker: sizeSpec(msg('桌貼'), 5),
	poster: sizeSpec(msg('海報'), 15),
}

// ---------- Contrast ----------

function linearChannel(value: number): number {
	const c = value / 255
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of "#RRGGBB" (or "#RGB"): 0 for black, 1 for white, NaN if unparseable. */
export function relativeLuminance(hex: string): number {
	const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
	if (!match) return Number.NaN
	let digits = match[1] ?? ''
	if (digits.length === 3) digits = digits.replace(/./g, (c) => c + c)
	const n = Number.parseInt(digits, 16)
	return 0.2126 * linearChannel((n >> 16) & 255) + 0.7152 * linearChannel((n >> 8) & 255) + 0.0722 * linearChannel(n & 255)
}

/** WCAG contrast ratio of two colors: 1 when they are the same, 21 for black on white. */
export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a)
	const lb = relativeLuminance(b)
	if (Number.isNaN(la) || Number.isNaN(lb)) return 1
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ---------- SVG ----------

/**
 * Light modules around the code. The QR spec asks for 4, but phone cameras
 * are happy with 2 and it keeps small prints compact.
 */
const QUIET_ZONE = 2
/**
 * The logo plate covers at most this share of the image width. That hides at
 * most about 6% of the modules, a few codewords per block, well inside what
 * error correction level H (≈30%) restores.
 */
const LOGO_MAX_SHARE = 0.22
/** Gap between the plate edge and the logo, in modules. */
const LOGO_PADDING = 0.5
/** Corner radius of the logo image, as a share of its side. */
const LOGO_RADIUS = 0.22
const MODULE_RADIUS = 0.3
const DOT_RADIUS = 0.42
/**
 * Finder corner radii for the rounded and dot shapes: outer ring, its hole, and the 3×3 core.
 * Kept modest on purpose: rounder finders (e.g. 1.6) still scan with ZXing and iOS, but weaker
 * decoders such as jsQR and OpenCV then miss them far more often.
 */
const FINDER_RADII = { outer: 0.8, hole: 0.2, core: 0.5 }
const ALIGNMENT_RADII = { outer: 1, hole: 0.3 }
const CAPTION_FONT = "'Noto Sans TC', 'PingFang TC', sans-serif"
const CAPTION_WEIGHT = 900
/** Caption size as a share of the image width, before shrinking long text to fit. */
const CAPTION_SHARE = 0.07

// The FluxBio mark on its tile (src/templates/icons.ts) fills 3…29 on both axes of a 32×32 box.
const MARK_INSET = 3

export interface QrSvgOptions {
	/**
	 * Image for `logo: "avatar"`, `"upload"` and `"default"`, e.g. "/media/<id>" for an
	 * on-page preview. Use a data: URL when the SVG is saved or drawn to a canvas.
	 * Without it those logos are left out (and the code drops back to ecc M).
	 */
	logoHref?: string | null
}

/**
 * Builds a print-ready SVG for `value` from the real QR module matrix. The
 * root has a viewBox in modules and a physical width/height in cm from
 * `style.size`. When a caption is shown it is a `<text>` element, painted last
 * together with the logo `<image>` (the PNG/PDF export relies on that order).
 *
 * @throws RangeError when `value` doesn't fit in a QR Code.
 */
export function qrSvg(value: string, style: QrStyle, options: QrSvgOptions = {}): string {
	const fg = cleanColor(style.fg, DEFAULT_QR_STYLE.fg)
	const bg = cleanColor(style.bg, DEFAULT_QR_STYLE.bg)
	const href = style.logo === 'avatar' || style.logo === 'upload' || style.logo === 'default' ? cleanHref(options.logoHref) : null
	const showLogo = style.logo === 'mark' || href !== null

	// boostEcc only raises the level when the data still fits the same version, so it never costs size.
	const qr = encode(value, { ecc: showLogo ? 'H' : 'M', boostEcc: true, border: 0 })
	const n = qr.size
	const width = n + QUIET_ZONE * 2
	const hole = showLogo ? logoHole(n) : null
	const caption = style.frame ? layoutCaption(style.frameText, width) : null
	const height = caption ? caption.height : width
	const rounded = style.shape !== 'square'

	const isFinder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
	const inHole = (x: number, y: number) => hole !== null && x >= hole.from && x < hole.to && y >= hole.from && y < hole.to
	const dark = (x: number, y: number) => qr.data[y]?.[x] ?? false

	// Alignment patterns (5×5, version 2 and up) are drawn solid in the rounded and dot shapes, like
	// small finders: decoders use them to correct perspective, and dots would break up their ring.
	const aligned = new Set<number>()
	const alignments: string[] = []
	if (rounded) {
		for (let y = 2; y < n - 2; y++) {
			for (let x = 2; x < n - 2; x++) {
				// The center is the only dark alignment module whose four neighbors are light.
				const center = qr.types[y]?.[x] === QrCodeDataType.Alignment && dark(x, y) && !dark(x - 1, y) && !dark(x + 1, y) && !dark(x, y - 1) && !dark(x, y + 1)
				if (!center || inHole(x - 2, y - 2) || inHole(x + 2, y - 2) || inHole(x - 2, y + 2) || inHole(x + 2, y + 2)) continue
				for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) aligned.add((y + dy) * n + x + dx)
				const left = x - 2 + QUIET_ZONE
				const top = y - 2 + QUIET_ZONE
				alignments.push(
					roundedRectPath(left, top, 5, 5, ALIGNMENT_RADII.outer) +
						roundedRectPath(left + 1, top + 1, 3, 3, ALIGNMENT_RADII.hole) +
						(style.shape === 'dots' ? circlePath(left + 2.5, top + 2.5, 0.5) : roundedRectPath(left + 2, top + 2, 1, 1, MODULE_RADIUS)),
				)
			}
		}
	}
	const isDark = (x: number, y: number) => dark(x, y) && !isFinder(x, y) && !inHole(x, y) && !aligned.has(y * n + x)

	const modules: string[] = []
	for (let y = 0; y < n; y++) {
		const top = y + QUIET_ZONE
		if (style.shape === 'square') {
			// One rectangle per horizontal run keeps the path short.
			for (let x = 0; x < n; ) {
				if (!isDark(x, y)) {
					x++
					continue
				}
				let end = x + 1
				while (end < n && isDark(end, y)) end++
				modules.push(`M${num(x + QUIET_ZONE)} ${num(top)}h${end - x}v1h${x - end}z`)
				x = end
			}
			continue
		}
		for (let x = 0; x < n; x++) {
			if (!isDark(x, y)) continue
			const left = x + QUIET_ZONE
			modules.push(style.shape === 'dots' ? circlePath(left + 0.5, top + 0.5, DOT_RADIUS) : roundedRectPath(left, top, 1, 1, MODULE_RADIUS))
		}
	}

	// Each finder is a 7×7 ring around a 3×3 core, drawn solid in every shape; even-odd fill cuts the hole.
	const corners: [number, number][] = [
		[0, 0],
		[n - 7, 0],
		[0, n - 7],
	]
	const finders = corners
		.map(([fx, fy]) => {
			const x = fx + QUIET_ZONE
			const y = fy + QUIET_ZONE
			return (
				roundedRectPath(x, y, 7, 7, rounded ? FINDER_RADII.outer : 0) +
				roundedRectPath(x + 1, y + 1, 5, 5, rounded ? FINDER_RADII.hole : 0) +
				roundedRectPath(x + 2, y + 2, 3, 3, rounded ? FINDER_RADII.core : 0)
			)
		})
		.join('')

	const defs: string[] = []
	const overlay: string[] = []
	if (hole) {
		const side = hole.to - hole.from
		const plate = hole.from + QUIET_ZONE
		overlay.push(`<path d="${roundedRectPath(plate, plate, side, side, side * 0.2)}" fill="${bg}"/>`)
		const inner = side - LOGO_PADDING * 2
		const at = num(plate + LOGO_PADDING)
		if (style.logo === 'mark') {
			overlay.push(
				`<g transform="translate(${at} ${at}) scale(${num(inner / 26)}) translate(-3 -3)">${logoTile(MARK_INSET)}</g>`,
			)
		} else if (href) {
			// objectBoundingBox units make every copy of this clip identical, so ids that clash
			// between several codes on one page still resolve to the right shape.
			const clipId = `fluxbio-qr-logo-${hashString(value)}`
			defs.push(
				`<clipPath id="${clipId}" clipPathUnits="objectBoundingBox"><rect width="1" height="1" rx="${LOGO_RADIUS}" ry="${LOGO_RADIUS}"/></clipPath>`,
			)
			// Photos fill the square; uploaded logos are fitted whole.
			const fit = style.logo === 'avatar' ? 'slice' : 'meet'
			overlay.push(
				`<image x="${at}" y="${at}" width="${num(inner)}" height="${num(inner)}" href="${escapeXml(href)}" preserveAspectRatio="xMidYMid ${fit}" clip-path="url(#${clipId})"/>`,
			)
		}
	}
	if (caption) {
		caption.lines.forEach((line, i) => {
			overlay.push(
				`<text x="${num(width / 2)}" y="${num(caption.baselines[i] ?? 0)}" text-anchor="middle" font-family="${CAPTION_FONT}" font-size="${num(caption.fontSize)}" font-weight="${CAPTION_WEIGHT}" fill="${fg}" data-max-width="${num(caption.maxWidth)}">${escapeXml(line)}</text>`,
			)
		})
	}

	const cm = (QR_SIZES[style.size] ?? QR_SIZES.sticker).cm
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}" width="${num(cm)}cm" height="${num((cm * height) / width)}cm">` +
		(defs.length ? `<defs>${defs.join('')}</defs>` : '') +
		`<rect width="${num(width)}" height="${num(height)}" fill="${bg}"/>` +
		(modules.length ? `<path d="${modules.join('')}" fill="${fg}"/>` : '') +
		`<path d="${finders}${alignments.join('')}" fill="${fg}" fill-rule="evenodd"/>` +
		overlay.join('') +
		'</svg>'
	)
}

/** The square of modules (an odd count, centered) that the logo plate covers: [from, to) on both axes. */
function logoHole(n: number): { from: number; to: number } {
	let side = Math.floor((n + QUIET_ZONE * 2) * LOGO_MAX_SHARE)
	if (side % 2 === 0) side -= 1
	// Versions are 21, 25, 29… modules wide, so the center is always a whole module.
	const center = (n - 1) / 2
	const from = center - (side - 1) / 2
	return { from, to: from + side }
}

interface CaptionLayout {
	lines: string[]
	fontSize: number
	baselines: number[]
	height: number
	maxWidth: number
}

/** Fits the caption under the code: one line, or two balanced lines when one would get too small. */
function layoutCaption(text: string, width: number): CaptionLayout | null {
	const clean = stripInvalidXml(text).replace(/\s+/g, ' ').trim()
	if (!clean) return null
	const maxWidth = width - QUIET_ZONE * 2
	const base = width * CAPTION_SHARE
	let lines = [clean]
	let fontSize = Math.min(base, maxWidth / textEm(clean))
	if (fontSize < base * 0.75) {
		const split = splitInTwo(clean)
		if (split) {
			const twoLines = Math.min(base, maxWidth / Math.max(textEm(split[0]), textEm(split[1])))
			if (twoLines > fontSize) {
				lines = split
				fontSize = twoLines
			}
		}
	}
	const lineHeight = fontSize * 1.3
	// Glyphs stay below the quiet zone even in fallback fonts with tall ascenders (1 em of room);
	// the same 2 modules of space close the bottom.
	const first = width + 0.35 + fontSize
	const baselines = lines.map((_, i) => first + i * lineHeight)
	const height = first + (lines.length - 1) * lineHeight + fontSize * 0.25 + QUIET_ZONE
	return { lines, fontSize, baselines, height, maxWidth }
}

function isWide(code: number): boolean {
	return (
		(code >= 0x1100 && code <= 0x115f) ||
		(code >= 0x2e80 && code <= 0xa4cf) ||
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xfe30 && code <= 0xfe4f) ||
		(code >= 0xff00 && code <= 0xff60) ||
		(code >= 0xffe0 && code <= 0xffe6) ||
		(code >= 0x1f300 && code <= 0x1faff) ||
		(code >= 0x20000 && code <= 0x3fffd)
	)
}

/** Rough advance width in em for a heavy sans. Errs wide so captions don't overflow. */
function charEm(ch: string): number {
	const code = ch.codePointAt(0) ?? 0
	if (isWide(code)) return code >= 0x1f300 && code <= 0x1faff ? 1.25 : 1
	if (ch === ' ') return 0.28
	if (/[iljI.,:;!'|]/.test(ch)) return 0.32
	if (/[mwMW@]/.test(ch)) return 0.95
	if (/[A-Z0-9]/.test(ch)) return 0.7
	if (/[a-z]/.test(ch)) return 0.6
	return code < 0x80 ? 0.5 : 0.7
}

function textEm(text: string): number {
	let em = 0
	for (const ch of text) em += charEm(ch)
	return Math.max(em, 1)
}

const NO_LINE_START = new Set(Array.from('，。、：；！？）」』】》〉,.:;!?)]}%'))
const NO_LINE_END = new Set(Array.from('（「『【《〈([{'))

/** Splits at the break that makes the longer line shortest: at spaces, or next to CJK characters. */
function splitInTwo(text: string): [string, string] | null {
	const chars = Array.from(text)
	let best: [string, string] | null = null
	let bestEm = Number.POSITIVE_INFINITY
	for (let i = 1; i < chars.length; i++) {
		const before = chars[i - 1] ?? ''
		const after = chars[i] ?? ''
		const spaced = before === ' ' || after === ' '
		const cjk = isWide(before.codePointAt(0) ?? 0) || isWide(after.codePointAt(0) ?? 0)
		if (!spaced && (!cjk || NO_LINE_START.has(after) || NO_LINE_END.has(before))) continue
		const left = chars.slice(0, i).join('').trimEnd()
		const right = chars.slice(i).join('').trimStart()
		if (!left || !right) continue
		const em = Math.max(textEm(left), textEm(right))
		if (em < bestEm) {
			bestEm = em
			best = [left, right]
		}
	}
	return best
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
	if (r <= 0) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`
	const rr = Math.min(r, w / 2, h / 2)
	const arc = (dx: number, dy: number) => `a${num(rr)} ${num(rr)} 0 0 1 ${num(dx)} ${num(dy)}`
	return (
		`M${num(x + rr)} ${num(y)}h${num(w - 2 * rr)}${arc(rr, rr)}v${num(h - 2 * rr)}${arc(-rr, rr)}` +
		`h${num(-(w - 2 * rr))}${arc(-rr, -rr)}v${num(-(h - 2 * rr))}${arc(rr, -rr)}z`
	)
}

function circlePath(cx: number, cy: number, r: number): string {
	return `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0z`
}

/** Rounds to 3 decimals and drops trailing zeros (and "-0"). */
function num(value: number): string {
	return String(Math.round(value * 1000) / 1000 || 0)
}

function cleanColor(value: string, fallback: string): string {
	return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback
}

/** Allows image data URLs, blob: and http(s) URLs, and same-site paths like "/media/<id>". */
function cleanHref(href: string | null | undefined): string | null {
	const value = href?.trim()
	if (!value) return null
	return /^(?:data:image\/|blob:|https?:\/\/|\/(?!\/))/i.test(value) ? value : null
}

/** Removes characters that XML 1.0 doesn't allow (control characters, lone surrogates). */
function stripInvalidXml(text: string): string {
	return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escapeXml(text: string): string {
	return stripInvalidXml(text).replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c)
}

/** FNV-1a, for short ids that differ between codes. */
function hashString(text: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}
