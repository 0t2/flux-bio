import { request } from '../api'

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Resizes an image in the browser before upload, so the Worker never has to
 * (image work would blow the free plan's CPU budget) and uploads stay small.
 */
export async function prepareImage(file: File, options: { maxWidth: number; maxHeight: number; square?: boolean }): Promise<Blob> {
	const bitmap = await createImageBitmap(file)
	let sx = 0
	let sy = 0
	let sw = bitmap.width
	let sh = bitmap.height
	if (options.square) {
		const side = Math.min(sw, sh)
		sx = (sw - side) / 2
		sy = (sh - side) / 2
		sw = side
		sh = side
	}
	const scale = Math.min(1, options.maxWidth / sw, options.maxHeight / sh)
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(sw * scale))
	canvas.height = Math.max(1, Math.round(sh * scale))
	const context = canvas.getContext('2d')
	if (!context) throw new Error('Canvas is not available')
	context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
	bitmap.close()

	// Safari can't encode WebP and silently returns PNG; use JPEG there.
	const webp = await toBlob(canvas, 'image/webp', 0.86)
	if (webp?.type === 'image/webp') return webp
	const jpeg = await toBlob(canvas, 'image/jpeg', 0.88)
	if (!jpeg) throw new Error('Could not encode the image')
	return jpeg
}

export async function uploadImage(file: File, options: { maxWidth: number; maxHeight: number; square?: boolean }): Promise<string> {
	const blob = await prepareImage(file, options)
	const { id } = await request<{ id: string; url: string }>('/media', { method: 'POST', body: blob })
	return id
}
