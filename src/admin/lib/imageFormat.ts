/** Matches MAX_MEDIA_BYTES on the Worker (src/worker/routes/api/media.ts). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** Formats that may carry alpha transparency, which JPEG would flatten to black. */
const ALPHA_TYPES = new Set(['image/png', 'image/gif', 'image/webp', 'image/avif'])

/**
 * Whether a GIF can be uploaded as-is so its animation frames stay intact: only one that already fits what was asked
 * for, since nothing here can make a moving picture smaller. A larger one goes through the canvas like any picture, and
 * so does one that doesn't move (isAnimatedGif), which is far smaller as WebP.
 */
export function keepAnimatedGif(
	file: { type: string; size: number },
	dimensions: { width: number; height: number },
	options: { maxWidth: number; maxHeight: number; square?: boolean },
): boolean {
	if (file.type !== 'image/gif' || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return false
	if (dimensions.width > options.maxWidth || dimensions.height > options.maxHeight) return false
	if (options.square && dimensions.width !== dimensions.height) return false
	return true
}

/** Whether a GIF file holds more than one picture, which is what makes it move. Reads its blocks, not its pixels. */
export function isAnimatedGif(bytes: Uint8Array): boolean {
	// "GIF", the version, then the screen: 7 bytes, the fifth of which says whether a color table follows and how long it is.
	if (bytes.length < 13 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return false
	const colorTable = (flags: number) => (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0)
	let at = 13 + colorTable(bytes[10]!)
	const skipData = () => {
		while (at < bytes.length) {
			const size = bytes[at++]!
			if (!size) return
			at += size
		}
	}
	let pictures = 0
	while (at < bytes.length) {
		const block = bytes[at++]
		if (block === 0x2c) {
			if (++pictures > 1) return true
			// Where it goes and how large (8 bytes), its flags, a color table of its own, the code size, then its data.
			at += 9 + colorTable(bytes[at + 8] ?? 0) + 1
			skipData()
		} else if (block === 0x21) {
			// An extension: its label, then data in the same form.
			at++
			skipData()
		} else return false
	}
	return false
}

/** Picks the fallback canvas format when WebP encoding is unavailable. */
export function fallbackImageFormat(sourceType: string): { type: 'image/png' | 'image/jpeg'; quality: number } {
	return ALPHA_TYPES.has(sourceType) ? { type: 'image/png', quality: 1 } : { type: 'image/jpeg', quality: 0.88 }
}
