import type { Locale, PageContent, Settings } from '../../shared/content'
import { findFont, fontAxis, GOOGLE_TEXT_LIMIT, isSlicedFont, textOf, type GoogleFont, type HostedFont } from '../../shared/fonts'
import { builtInWords } from '../../templates/render'
import { resolveAppearance, type WebFont } from '../../templates/themes'

/**
 * With `settings.hostFonts` on, public pages load their fonts from this Worker,
 * not from Google, so a visit never tells Google about the visitor. It is off
 * by default: each font file then costs nothing here, while copied ones cost a
 * request and a KV read per new visitor. When a page is published, each family
 * it uses is fetched from Google Fonts with only the characters the page can
 * show (its own text, the built-in text in its languages and ASCII) and kept
 * in KV, one small file per weight or one per variable family. The files are
 * kept while the family, weights and characters stay the same, and deleted
 * when the page stops using them.
 *
 * If Google can't be reached, the page is published anyway with the visitor's
 * own fonts (see snapshotOf); the next publish tries again.
 */

const CSS_URL = 'https://fonts.googleapis.com/css2'
/** Google picks the file format by browser; this one gets woff2. */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
/**
 * More characters than a page shows in practice, and as many as Google cuts a font to: past that it sends the whole
 * font, which for a Chinese one would be a hundred files to copy. The rarest of a page with more are left to the
 * visitor's own fonts.
 */
const MAX_CHARACTERS = GOOGLE_TEXT_LIMIT
const MAX_FILE_BYTES = 4 * 1024 * 1024
const TIMEOUT_MS = 8000

export const fontKey = (file: string): string => `font:${file}`

/** "400..700" → [400, 700]; "400;700" → [400, 700]; "700" → [700]. */
function axisWeights(axis: string): number[] {
	return axis.split(/;|\.\./).map(Number)
}

/** The families a page loads in any of its languages, each with the weights all of them need. */
export function pageWebFonts(content: PageContent, locales: readonly Locale[]): WebFont[] {
	const wanted = new Map<string, number[]>()
	for (const locale of locales) {
		for (const font of resolveAppearance(content.appearance, locale).webFonts) {
			wanted.set(font.family, [...(wanted.get(font.family) ?? []), ...axisWeights(font.axis)])
		}
	}
	return [...wanted].flatMap(([family, weights]) => {
		const font = findFont(family)
		return font ? [{ family, axis: fontAxis(font, weights) }] : []
	})
}

/** Every character a page can show, in code point order: ASCII, its own text and the built-in text in its languages. */
export function pageCharacters(content: PageContent, locales: readonly Locale[], extra = ''): string[] {
	const text = [textOf(content), extra, ...locales.map(builtInWords)].join('')
	const chars = new Set<string>()
	for (let code = 0x20; code < 0x7f; code++) chars.add(String.fromCharCode(code))
	for (const char of text) if (char >= ' ') chars.add(char)
	return [...chars].sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0))
}

const CJK = /[⺀-鿿가-힯豈-﫿︰-﹏＀-￯\u{20000}-\u{3ffff}]/u
const THAI = /[฀-๿]/

/** The characters worth asking a family for: Google leaves out what it can't draw, but they would make the request longer. */
export function charactersFor(font: GoogleFont, chars: readonly string[]): string {
	const cjk = isSlicedFont(font)
	const thai = font.scripts.includes('thai')
	return chars
		.filter((char) => (CJK.test(char) ? cjk : THAI.test(char) ? thai : true))
		.slice(0, MAX_CHARACTERS)
		.join('')
}

async function fingerprint(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	return [...new Uint8Array(digest).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function fetchOk(url: string): Promise<Response> {
	const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
	if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}`)
	return response
}

/** The faces in a css2 answer: their weight ("400", or "400 700" for a variable file) and file. */
export function parseFaces(css: string): { weight: string; src: string }[] {
	const faces: { weight: string; src: string }[] = []
	for (const [, body = ''] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
		const weight = /font-weight:\s*(\d{3}(?: \d{3})?)\s*;/.exec(body)?.[1]
		// Only Google's own font host is fetched.
		const src = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\)/.exec(body)?.[1]
		if (weight && src) faces.push({ weight, src })
	}
	return faces
}

async function hostFamily(env: Env, pageId: string, web: WebFont, chars: readonly string[], previous: readonly HostedFont[]): Promise<HostedFont> {
	const font = findFont(web.family)
	if (!font) throw new Error(`${web.family} is not on the list`)
	const text = charactersFor(font, chars)
	const key = await fingerprint(`${web.family}|${web.axis}|${text}`)
	const kept = previous.find((hosted) => hosted.family === web.family && hosted.axis === web.axis && hosted.key === key)
	if (kept) return kept

	const query = `family=${web.family.replaceAll(' ', '+')}:wght@${web.axis}&text=${encodeURIComponent(text)}&display=swap`
	const faces = parseFaces(await (await fetchOk(`${CSS_URL}?${query}`)).text())
	if (!faces.length) throw new Error(`no faces for ${web.family}`)
	const files = new Map<string, string>()
	for (const face of faces) {
		if (files.has(face.src)) continue
		const bytes = await (await fetchOk(face.src)).arrayBuffer()
		if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error(`${web.family} file is ${bytes.byteLength} bytes`)
		const file = `${pageId}-${key}-${files.size}`
		await env.KV.put(fontKey(file), bytes)
		files.set(face.src, file)
	}
	return { family: web.family, axis: web.axis, key, faces: faces.map((face) => ({ weight: face.weight, file: files.get(face.src) ?? '' })) }
}

/**
 * Copies the fonts a page uses to KV, reusing `previous` files that still fit.
 * Returns what to store with the page, or null when fonts aren't copied: the
 * switch is off, or Google couldn't be reached.
 */
export async function hostFonts(
	env: Env,
	page: { id: string; handle: string; published: PageContent; fonts: HostedFont[] | null },
	settings: Settings,
): Promise<HostedFont[] | null> {
	// A custom page brings its own fonts, or sends visitors elsewhere.
	if (!settings.hostFonts || page.published.custom) return null
	const locales = [settings.locale, ...settings.languages]
	const chars = pageCharacters(page.published, locales, page.handle)
	try {
		return await Promise.all(pageWebFonts(page.published, locales).map((web) => hostFamily(env, page.id, web, chars, page.fonts ?? [])))
	} catch (error) {
		console.error('Fonts could not be copied; the page uses device fonts until it is published again', error)
		return null
	}
}

/** Files of `before` that `after` doesn't use. */
export function unusedFontFiles(before: readonly HostedFont[] | null, after: readonly HostedFont[] | null): string[] {
	const kept = new Set(after?.flatMap((font) => font.faces.map((face) => face.file)))
	return [...new Set(before?.flatMap((font) => font.faces.map((face) => face.file)))].filter((file) => !kept.has(file))
}

export async function deleteFontFiles(env: Env, files: readonly string[]): Promise<void> {
	const results = await Promise.allSettled(files.map((file) => env.KV.delete(fontKey(file))))
	for (const result of results) if (result.status === 'rejected') console.error('KV kept an unused font file', result.reason)
}

/** Stored fonts as written by hostFonts, or null for anything else. */
export function parseHostedFonts(json: string | null): HostedFont[] | null {
	if (!json) return null
	try {
		const value: unknown = JSON.parse(json)
		if (!Array.isArray(value)) return null
		const valid = value.every(
			(font) =>
				font &&
				typeof font.family === 'string' &&
				typeof font.axis === 'string' &&
				typeof font.key === 'string' &&
				Array.isArray(font.faces) &&
				font.faces.every((face: unknown) => face && typeof (face as { weight?: unknown }).weight === 'string' && typeof (face as { file?: unknown }).file === 'string'),
		)
		return valid ? (value as HostedFont[]) : null
	} catch {
		return null
	}
}
