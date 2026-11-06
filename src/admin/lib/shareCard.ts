import type { Appearance, PageContent } from '../../shared/content'
import { resolveAppearance } from '../../templates/themes'

// What the automatic share card is drawn from, and when a page needs a new one. Nothing here draws, so it can be
// tested without a browser; the drawing is in ogImage.ts.

export interface ShareCardInput {
	name: string
	tagline: string
	/** e.g. "links.example.com/mei". */
	displayUrl: string
	avatarUrl: string | null
	appearance: Appearance
}

export function shareCardInput(content: PageContent, displayUrl: string): ShareCardInput {
	return {
		name: content.seo.title.trim() || content.profile.name.trim() || 'FluxBio',
		tagline: content.seo.tagline.trim() || content.profile.bio.trim().split('\n')[0] || '',
		displayUrl,
		avatarUrl: content.profile.avatar ? `/media/${content.profile.avatar}` : null,
		appearance: content.appearance,
	}
}

/**
 * A short fingerprint of what the card shows, stored as `seo.autoImageKey`. Of the look, only what drawShareCard
 * draws with: a change the card doesn't show (the social icons, the cover or background picture) would otherwise
 * upload a new picture with the next publish, and leave the old one in KV.
 */
export function shareCardKey(input: ShareCardInput): string {
	const look = resolveAppearance(input.appearance)
	const { theme } = look
	const drawn = [theme.id, theme.bg, theme.fg, theme.muted, look.accent, look.ink, look.button, look.headWeight, look.vars['--body-font'] ?? look.font, look.vars['--head-font'], look.vars['--accent-text'], look.fontsHref]
	const text = JSON.stringify([input.name, input.tagline, input.displayUrl, input.avatarUrl, drawn])
	let hash = 0x811c9dc5
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return `v2-${(hash >>> 0).toString(16)}`
}

/** The key the page's automatic share card should have now, or null when it has it already or doesn't use one. */
export function staleShareCard(draft: PageContent, displayUrl: string): { input: ShareCardInput; key: string } | null {
	// A custom page says for itself what its share preview is.
	if (draft.custom || draft.seo.imageMode !== 'auto') return null
	const input = shareCardInput(draft, displayUrl)
	const key = shareCardKey(input)
	return draft.seo.autoImage && draft.seo.autoImageKey === key ? null : { input, key }
}

/** Whether publishing would draw a new share card, which changes the draft. */
export const shareImageIsStale = (draft: PageContent, displayUrl: string): boolean => staleShareCard(draft, displayUrl) !== null
