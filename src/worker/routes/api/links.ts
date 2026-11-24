import type { Context, Hono } from 'hono'
import type { BulkLinksResponse, CreateLinkResponse, LinkResponse, LinksResponse, LinkStatsResponse } from '../../../shared/api'
import { DEFAULT_QR_STYLE, QR_SIZE_IDS, qrLogoMedia, qrSvg, QrStyleSchema, type QrStyle } from '../../../shared/qr'
import { addDays, lastDays } from '../../../shared/time'
import { fill, msg, type Params } from '../../../templates/msg'
import { ApiError, type AppEnv } from '../../types'
import { insights } from '../../lib/analytics'
import { mediaKey } from '../../lib/cache'
import { getLink, getLinksByIds, getPage, listLinkPage, loadSettings } from '../../lib/db'
import { createSoloLinks, updateLink } from '../../lib/ops'
import { BulkLinksInput, CLICKED_LINKS, LinkListQuery, LinkPatchInput, LINKS_PER_PAGE, NewLinkInput } from '../../lib/schemas'
import { emptyLinkStats, linkStats, targetOverview } from '../../lib/stats'
import { insightsJson, linkJson, publicOrigin, rangeOf, readBody } from './helpers'

/** Up to this size a picture goes inside the file, so it prints anywhere. Encoding more could run past the free plan's CPU limit. */
const QR_EMBED_MAX = 256 * 1024

async function qrLogoHref(c: Context<AppEnv>, media: string | null, origin: string): Promise<string | null> {
	if (!media) return null
	const { value, metadata } = await c.env.KV.getWithMetadata<{ type?: string }>(mediaKey(media), 'arrayBuffer')
	if (!value) return null
	if (value.byteLength > QR_EMBED_MAX) return `${origin}/media/${encodeURIComponent(media)}`
	const bytes = new Uint8Array(value)
	let binary = ''
	for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
	return `data:${metadata?.type ?? 'image/png'};base64,${btoa(binary)}`
}

export function registerLinkRoutes(api: Hono<AppEnv>): void {
	api.get('/links', async (c) => {
		const query = LinkListQuery.safeParse(c.req.query())
		if (!query.success) throw new ApiError(400, 'invalid', msg('查詢參數不正確'))
		const { limit = LINKS_PER_PAGE, cursor, kind, q } = query.data
		const [{ rows, nextCursor }, settings] = await Promise.all([listLinkPage(c.env.DB, { limit, cursor, kind, q }), loadSettings(c.env.DB)])
		const { days, byLink } = await linkStats(c.env.DB, settings.timezone, 7, rows.map((row) => row.id))
		const origin = publicOrigin(c, settings)
		const body: LinksResponse = { days, links: rows.map((row) => linkJson(row, origin, byLink.get(row.id) ?? emptyLinkStats(days.length))), nextCursor }
		return c.json(body)
	})

	// Before /links/:id. For adding up a whole site without paging through links nobody clicked.
	api.get('/links/clicked', async (c) => {
		const settings = await loadSettings(c.env.DB)
		const { days, byLink } = await linkStats(c.env.DB, settings.timezone, 7)
		const top = [...byLink].sort((a, b) => b[1].total - a[1].total).slice(0, CLICKED_LINKS)
		const rows = await getLinksByIds(c.env.DB, top.map(([id]) => id))
		const byId = new Map(rows.map((row) => [row.id, row]))
		const origin = publicOrigin(c, settings)
		const links = top.flatMap(([id, stats]) => {
			const row = byId.get(id)
			return row ? [linkJson(row, origin, stats)] : []
		})
		const body: LinksResponse = { days, links, nextCursor: null }
		return c.json(body)
	})

	api.post('/links', async (c) => {
		const input = await readBody(c, NewLinkInput)
		const { created, errors } = await createSoloLinks(c.env, [input])
		if (errors[0]) throw errors[0].error
		const link = linkJson(created[0]!, publicOrigin(c, await loadSettings(c.env.DB)))
		const body: CreateLinkResponse = { link, short: link.short }
		return c.json(body, 201)
	})

	api.post('/links/bulk', async (c) => {
		const { links } = await readBody(c, BulkLinksInput)
		const { created, errors } = await createSoloLinks(c.env, links)
		const origin = publicOrigin(c, await loadSettings(c.env.DB))
		const body: BulkLinksResponse = {
			created: created.map((row) => linkJson(row, origin)),
			errors: errors.map(({ index, error }) => ({ index, ...error.text() })),
		}
		return c.json(body, created.length ? 201 : 400)
	})

	api.get('/links/:id', async (c) => {
		const [row, settings] = await Promise.all([getLink(c.env.DB, c.req.param('id')), loadSettings(c.env.DB)])
		if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
		return c.json<LinkResponse>({ link: linkJson(row, publicOrigin(c, settings)) })
	})

	// The same code the dashboard's download draws, for an agent that has to hand over a file.
	api.get('/links/:id/qr', async (c) => {
		const db = c.env.DB
		const [row, settings] = await Promise.all([getLink(db, c.req.param('id')), loadSettings(db)])
		if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
		if (row.status !== 'active') throw new ApiError(409, 'archived', msg('已封存，這個短網址不會再轉址'))
		const saved = QrStyleSchema.safeParse(row.qr)
		const size = QR_SIZE_IDS.find((id) => id === c.req.query('size'))
		const style: QrStyle = { ...(saved.success ? saved.data : DEFAULT_QR_STYLE), ...(size ? { size } : {}) }
		const owner = await getPage(db, row.pageId ?? settings.home)
		const media = qrLogoMedia(style, {
			avatar: (owner?.published ?? owner?.draft)?.profile.avatar,
			pageLogo: row.pageId ? owner?.qrLogo : null,
			siteLogo: settings.qrLogo,
		})
		const origin = publicOrigin(c, settings)
		const svg = qrSvg(`${linkJson(row, origin).short}?s=qr`, style, { logoHref: await qrLogoHref(c, media, origin) })
		return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, 200, {
			'content-type': 'image/svg+xml; charset=utf-8',
			'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`qr-${row.slug}.svg`)}`,
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
		})
	})

	api.patch('/links/:id', async (c) => {
		const patch = await readBody(c, LinkPatchInput)
		const row = await updateLink(c.env, c.req.param('id'), patch)
		return c.json<LinkResponse>({ link: linkJson(row, publicOrigin(c, await loadSettings(c.env.DB))) })
	})

	api.get('/links/:id/stats', async (c) => {
		const db = c.env.DB
		const days = rangeOf(c.req.query('days'))
		const [row, settings] = await Promise.all([getLink(db, c.req.param('id')), loadSettings(db)])
		if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
		// The counts, the detailed numbers and the link's page don't wait for one another. One moment fixes the days for both sets of numbers.
		const now = Date.now()
		const range = lastDays(settings.timezone, days, now)
		const from = range[0]!
		const [data, details, page] = await Promise.all([
			targetOverview(db, settings.timezone, days, row.id, now),
			insights(c.env, { target: row.id }, { from, to: range.at(-1)!, previousFrom: addDays(from, -days) }),
			row.pageId ? getPage(db, row.pageId) : null,
		])
		const title = row.title || row.slug
		const placeKey = page ? msg('{name} 頁面上的「{title}」') : msg('獨立短網址「{title}」')
		const placeParams: Params = page ? { name: page.draft.profile.name || page.handle, title } : { title }
		const body: LinkStatsResponse = {
			link: linkJson(row, publicOrigin(c, settings)),
			place: fill(placeKey, placeParams),
			placeKey,
			placeParams,
			timezone: settings.timezone,
			days: data.days,
			clicks: data.clicks,
			total: data.total,
			previous: data.previous,
			sources: data.sources,
			insights: insightsJson(details, () => ({ label: title })),
		}
		return c.json(body)
	})
}
