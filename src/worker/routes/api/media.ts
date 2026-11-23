import type { Context, Hono } from 'hono'
import type { DeletedMediaResponse, MediaListResponse, UnusedMediaResponse, UploadedMediaResponse } from '../../../shared/api'
import { MEDIA_ID, randomString } from '../../../shared/content'
import { msg } from '../../../templates/msg'
import { ApiError, type AppEnv } from '../../types'
import { mediaKey } from '../../lib/cache'
import { deleteUnusedMedia, listMedia, matchesImageType, readMedia, unusedMedia, UNUSED_AFTER, type MediaMetadata } from '../../lib/media'
import { MEDIA_PER_PAGE, MediaListQuery } from '../../lib/schemas'

const MEDIA_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
}
const MAX_MEDIA_BYTES = 2 * 1024 * 1024

async function readImage(c: Context<AppEnv>): Promise<{ bytes: ArrayBuffer; type: string; ext: string }> {
	const type = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
	const ext = MEDIA_TYPES[type]
	if (!ext) throw new ApiError(415, 'unsupported', msg('只接受 PNG、JPEG、WebP、GIF 或 AVIF 圖片'))
	if (Number(c.req.header('content-length') ?? 0) > MAX_MEDIA_BYTES) throw new ApiError(413, 'too-large', msg('圖片太大了，不能超過 2 MB'))
	const bytes = await c.req.arrayBuffer()
	if (!bytes.byteLength) throw new ApiError(400, 'invalid', msg('沒有收到圖片'))
	if (bytes.byteLength > MAX_MEDIA_BYTES) throw new ApiError(413, 'too-large', msg('圖片太大了，不能超過 2 MB'))
	if (!matchesImageType(bytes, type)) throw new ApiError(415, 'unsupported', msg('只接受 PNG、JPEG、WebP、GIF 或 AVIF 圖片'))
	return { bytes, type, ext }
}

export function registerMediaRoutes(api: Hono<AppEnv>): void {
	api.post('/media', async (c) => {
		const { bytes, type, ext } = await readImage(c)
		const id = `${randomString(12)}.${ext}`
		// Dated, so one nothing uses yet isn't taken for one nothing uses any more (lib/media.ts).
		await c.env.KV.put(mediaKey(id), bytes, { metadata: { type, at: Date.now(), size: bytes.byteLength } satisfies MediaMetadata })
		return c.json<UploadedMediaResponse>({ id, url: `/media/${id}` }, 201)
	})

	// Every uploaded picture, a page at a time: one KV list each (lib/media.ts).
	api.get('/media', async (c) => {
		const query = MediaListQuery.safeParse(c.req.query())
		if (!query.success) throw new ApiError(400, 'invalid', msg('查詢參數不正確'))
		// KV refuses a cursor it didn't hand out.
		const body: MediaListResponse | null = await listMedia(c.env, { limit: query.data.limit ?? MEDIA_PER_PAGE, cursor: query.data.cursor }).catch(() => null)
		if (!body) throw new ApiError(400, 'invalid', msg('查詢參數不正確'))
		return c.json(body)
	})

	// Pictures nothing uses any more: what would go, and letting them go. Before /media/:id.
	api.get('/media/unused', async (c) => {
		const { ids, more } = await unusedMedia(c.env)
		const body: UnusedMediaResponse = { unused: ids, more, keptDays: UNUSED_AFTER / 86_400_000 }
		return c.json(body)
	})

	api.delete('/media/unused', async (c) => {
		const body: DeletedMediaResponse = await deleteUnusedMedia(c.env)
		return c.json(body)
	})

	// Build and backup tools can read the current bytes even if a static copy is deployed.
	api.get('/media/:id', async (c) => {
		const image = await readMedia(c.env, c.req.param('id'), 'no-store')
		if (!image) throw new ApiError(404, 'not-found', msg('找不到'))
		return image
	})

	// Imports re-upload images under the ids the settings file uses.
	api.put('/media/:id', async (c) => {
		const id = c.req.param('id')
		if (!MEDIA_ID.test(id)) throw new ApiError(400, 'invalid', msg('圖片 id 格式不正確'))
		const { bytes, type } = await readImage(c)
		await c.env.KV.put(mediaKey(id), bytes, { metadata: { type, at: Date.now(), size: bytes.byteLength } satisfies MediaMetadata })
		return c.json<UploadedMediaResponse>({ id, url: `/media/${id}` })
	})
}
