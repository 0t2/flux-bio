import { msg } from '../templates/msg'
import { randomString } from './content'

// Letters (any script, so Chinese works), digits, "-" and "_", starting and
// ending with a letter or digit, at most 64 characters.
// Combining marks (\p{M}) after the first character: Thai, Hindi and others write vowels and tones with them.
const SLUG_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}_-]{0,62}[\p{L}\p{M}\p{N}])?$/u

/** Paths the app itself uses; they can never be a slug or the page handle. */
export const RESERVED_SLUGS = new Set([
	'admin',
	'api',
	'media',
	'assets',
	'static',
	'public',
	'login',
	'logout',
	'go',
	'preview',
	'index',
	'www',
	'_fonts',
	'favicon.ico',
	'favicon.svg',
	'robots.txt',
	'sitemap.xml',
])

/** Slugs are matched case-insensitively, in Unicode NFC form. */
export function normalizeSlug(value: string): string {
	return value.trim().normalize('NFC').toLowerCase()
}

export type SlugProblem = 'empty' | 'format' | 'reserved'

export function slugProblem(slug: string): SlugProblem | null {
	if (!slug) return 'empty'
	if (!SLUG_PATTERN.test(slug)) return 'format'
	if (RESERVED_SLUGS.has(slug)) return 'reserved'
	return null
}

export const SLUG_PROBLEM_TEXT: Record<SlugProblem, string> = {
	empty: msg('代稱不能空白'),
	format: msg('代稱只能用文字、數字、- 和 _，開頭和結尾要是文字或數字，最多 64 字'),
	reserved: msg('這個代稱是系統保留字，請換一個'),
}

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function randomSlug(length = 5): string {
	return randomString(length, SLUG_ALPHABET)
}

/** "Latest Videos!" → "latest-videos"; returns "" for text without Latin letters. */
export function slugFromText(text: string): string {
	const ascii = text
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32)
		.replace(/-+$/, '')
	return ascii.length >= 2 ? ascii : ''
}

/** "https://www.youtube.com/@me" → "youtube". */
export function slugFromUrl(url: string): string {
	try {
		const labels = new URL(url).hostname.split('.').filter((label) => label !== 'www' && label !== 'm')
		return slugFromText(labels[0] ?? '')
	} catch {
		return ''
	}
}

/** Picks a free slug: the base itself, then base-2, base-3…, then a random one. */
export function uniqueSlug(base: string, taken: Set<string>): string {
	const usable = (candidate: string) => !taken.has(candidate) && !slugProblem(candidate)
	if (base && usable(base)) return base
	if (base) {
		for (let n = 2; n < 100; n++) {
			const candidate = `${base}-${n}`
			if (usable(candidate)) return candidate
		}
	}
	for (;;) {
		const candidate = randomSlug()
		if (usable(candidate)) return candidate
	}
}
