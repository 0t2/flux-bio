import type { PageContent } from '../../shared/content'
import { LOGO_INK, LOGO_LIME, LOGO_PATH } from '../../templates/icons'
import { initials } from '../../templates/render'
import { FONT_STACKS, resolveAppearance } from '../../templates/themes'
import { request } from '../api'
import { loadStylesheet } from './fontPreview'
import { staleShareCard, type ShareCardInput } from './shareCard'

export { shareCardInput, shareCardKey, shareImageIsStale, type ShareCardInput } from './shareCard'

/**
 * The share card (1200 × 630) shown when a page is pasted into LINE,
 * Facebook or Threads. It is drawn here in the browser, because drawing text
 * on the Worker would blow the free plan's CPU budget, and uploaded as an
 * ordinary image when the page is published.
 */

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

async function loadImage(url: string): Promise<HTMLImageElement | null> {
	try {
		const image = new Image()
		image.src = url
		await image.decode()
		return image
	} catch {
		return null
	}
}

/** Shrinks the font until `text` fits `width`; returns the size used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, max: number, min: number, width: number): number {
	for (let size = max; size > min; size -= 2) {
		ctx.font = font(size)
		if (ctx.measureText(text).width <= width) return size
	}
	ctx.font = font(min)
	return min
}

/** Breaks text into at most `lines` lines of `width`, ending with "…" when it runs over. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number): string[] {
	const out: string[] = []
	let line = ''
	for (const ch of [...text]) {
		if (ctx.measureText(line + ch).width > width) {
			out.push(line)
			line = ch
			if (out.length === lines) break
		} else line += ch
	}
	if (out.length < lines && line) out.push(line)
	if (out.length === lines && out.join('').length < [...text].length) {
		let last = out[lines - 1] ?? ''
		while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
		out[lines - 1] = `${last}…`
	}
	return out
}

export async function drawShareCard(input: ShareCardInput): Promise<HTMLCanvasElement> {
	const look = resolveAppearance(input.appearance)
	const theme = look.theme
	const body = look.vars['--body-font'] ?? FONT_STACKS[look.font]
	const head = look.vars['--head-font'] ?? body
	const headWeight = look.headWeight
	// Picked Google fonts aren't in the dashboard's own stylesheet.
	await loadStylesheet(look.fontsHref)
	await Promise.all(
		[`${headWeight} 84px ${head}`, `500 36px ${body}`, `700 34px ${body}`, `${headWeight} 52px ${head}`, `600 26px ${body}`].map((font) =>
			document.fonts.load(font, input.name + input.tagline).catch(() => []),
		),
	)

	const canvas = document.createElement('canvas')
	canvas.width = CARD_WIDTH
	canvas.height = CARD_HEIGHT
	const ctx = canvas.getContext('2d')
	if (!ctx) throw new Error('Canvas is not available')

	ctx.fillStyle = theme.bg
	ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
	{
		// A frame in the theme's own ink.
		ctx.strokeStyle = theme.fg
		ctx.lineWidth = theme.id === 'brutal' ? 8 : 4
		ctx.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56)
		ctx.fillStyle = look.accent
		ctx.fillRect(28, CARD_HEIGHT - 44, CARD_WIDTH - 56, 16)
	}

	// Avatar
	const size = 168
	const ax = 80
	const ay = 120
	const radius = look.button === 'square' ? 0 : look.button === 'pill' ? size / 2 : 36
	ctx.save()
	ctx.beginPath()
	ctx.roundRect(ax, ay, size, size, radius)
	ctx.clip()
	ctx.fillStyle = look.accent
	ctx.fillRect(ax, ay, size, size)
	const avatar = input.avatarUrl ? await loadImage(input.avatarUrl) : null
	if (avatar) {
		const side = Math.min(avatar.naturalWidth, avatar.naturalHeight)
		ctx.drawImage(avatar, (avatar.naturalWidth - side) / 2, (avatar.naturalHeight - side) / 2, side, side, ax, ay, size, size)
	} else {
		ctx.fillStyle = look.ink
		ctx.font = `${headWeight} 52px ${head}`
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText(initials(input.name) || '?', ax + size / 2, ay + size / 2 + 2)
	}
	ctx.restore()
	if (theme.id === 'brutal' || theme.id === 'editorial') {
		ctx.strokeStyle = theme.fg
		ctx.lineWidth = theme.id === 'brutal' ? 4 : 3
		ctx.beginPath()
		ctx.roundRect(ax, ay, size, size, radius)
		ctx.stroke()
	}

	// Name and tagline
	const textX = ax + size + 40
	const textWidth = CARD_WIDTH - textX - 80
	ctx.textAlign = 'left'
	ctx.textBaseline = 'alphabetic'
	ctx.fillStyle = theme.fg
	const nameSize = fitText(ctx, input.name, (s) => `${headWeight} ${s}px ${head}`, 84, 44, textWidth)
	const taglineFont = `500 36px ${body}`
	ctx.font = taglineFont
	const taglineLines = input.tagline ? wrap(ctx, input.tagline, textWidth, 2) : []
	const blockHeight = nameSize * 1.05 + (taglineLines.length ? 14 + taglineLines.length * 50 : 0)
	let y = ay + size / 2 - blockHeight / 2 + nameSize * 0.85
	ctx.font = `${headWeight} ${nameSize}px ${head}`
	ctx.fillText(input.name, textX, y)
	ctx.font = taglineFont
	ctx.fillStyle = theme.muted
	for (const line of taglineLines) {
		y += line === taglineLines[0] ? 14 + 44 : 50
		ctx.fillText(line, textX, y)
	}

	// Address and mark
	const bottom = CARD_HEIGHT - 84
	ctx.fillStyle = look.vars['--accent-text'] ?? look.accent
	fitText(ctx, input.displayUrl, (s) => `700 ${s}px ${body}`, 34, 22, 720)
	ctx.fillText(input.displayUrl, 80, bottom)
	ctx.font = `600 26px ${body}`
	ctx.fillStyle = theme.muted
	ctx.textAlign = 'right'
	ctx.fillText('FluxBio', CARD_WIDTH - 80, bottom)
	const markX = CARD_WIDTH - 80 - ctx.measureText('FluxBio').width - 48
	ctx.save()
	ctx.translate(markX, bottom - 30)
	ctx.scale(36 / 32, 36 / 32)
	ctx.fillStyle = LOGO_LIME
	ctx.beginPath()
	ctx.roundRect(0, 0, 32, 32, 7)
	ctx.fill()
	ctx.translate(3.2, 3.2)
	ctx.scale(0.8, 0.8)
	ctx.fillStyle = LOGO_INK
	ctx.fill(new Path2D(LOGO_PATH), 'evenodd')
	ctx.restore()
	return canvas
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the share card'))), 'image/jpeg', 0.9),
	)
}

/**
 * Redraws and uploads the share card when the page uses the automatic one and
 * something on it changed. Returns the updated draft, or null when nothing
 * needed doing.
 */
export async function refreshShareImage(draft: PageContent, displayUrl: string): Promise<PageContent | null> {
	const stale = staleShareCard(draft, displayUrl)
	if (!stale) return null
	const { input, key } = stale
	const blob = await toBlob(await drawShareCard(input))
	const { id } = await request<{ id: string }>('/media', { method: 'POST', body: blob })
	return { ...draft, seo: { ...draft.seo, autoImage: id, autoImageKey: key } }
}
