import { useEffect } from 'react'
import { findFont, fontAxis } from '../../shared/fonts'

const added = new Set<string>()

/**
 * Loads Google Fonts families into the dashboard to preview them, with only
 * the characters in `text` (Google's `text=` subset: a few kilobytes each).
 */
export function previewFonts(families: readonly string[], text: string): void {
	const chars = [...new Set(text)].join('')
	if (!chars) return
	for (const family of families) {
		const font = findFont(family)
		if (!font) continue
		const href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${fontAxis(font, [400, 700])}&text=${encodeURIComponent(chars)}&display=swap`
		if (added.has(href)) continue
		added.add(href)
		const link = document.createElement('link')
		link.rel = 'stylesheet'
		link.href = href
		document.head.append(link)
	}
}

export function usePreviewFonts(families: readonly string[], text: string): void {
	const key = families.join('|')
	useEffect(() => previewFonts(key ? key.split('|') : [], text), [key, text])
}

/** Adds a stylesheet once and waits for it, up to a few seconds: share cards are drawn only after their fonts are in. */
export function loadStylesheet(href: string): Promise<void> {
	if (!href) return Promise.resolve()
	const existing = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find((link) => link.href === href)
	if (existing?.sheet) return Promise.resolve()
	return new Promise((resolve) => {
		const link = existing ?? document.createElement('link')
		const done = () => resolve()
		link.addEventListener('load', done, { once: true })
		link.addEventListener('error', done, { once: true })
		window.setTimeout(done, 4000)
		if (!existing) {
			link.rel = 'stylesheet'
			link.href = href
			document.head.append(link)
		}
	})
}
