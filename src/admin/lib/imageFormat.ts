/** Matches MAX_MEDIA_BYTES on the Worker (src/worker/routes/api/media.ts). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** Formats that may carry alpha transparency, which JPEG would flatten to black. */
const ALPHA_TYPES = new Set(['image/png', 'image/gif', 'image/webp', 'image/avif'])

/** Whether a GIF can be uploaded as-is so its animation frames stay intact. */
export function keepAnimatedGif(
	file: { type: string; size: number },
	dimensions: { width: number; height: number },
	options: { maxWidth: number; maxHeight: number; square?: boolean },
): boolean {
	if (file.type !== 'image/gif' || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return false
	if (options.square && dimensions.width !== dimensions.height) return false
	return true
}

/** Picks the fallback canvas format when WebP encoding is unavailable. */
export function fallbackImageFormat(sourceType: string): { type: 'image/png' | 'image/jpeg'; quality: number } {
	return ALPHA_TYPES.has(sourceType) ? { type: 'image/png', quality: 1 } : { type: 'image/jpeg', quality: 0.88 }
}
