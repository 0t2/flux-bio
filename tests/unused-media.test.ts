import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DeletedMediaResponse, PageJson, StateResponse, UnusedMediaResponse } from '../src/shared/api'
import { mediaIdsOf } from '../src/shared/backup'
import { emptyContent, emptyLink, newItem, type PageContent } from '../src/shared/content'
import { DEFAULT_QR_STYLE } from '../src/shared/qr'
import { UNUSED_AFTER } from '../src/worker/lib/media'
import { api, apiJson } from './helpers'

// An uploaded picture stays in KV after the last page stops showing it. Asking for the unused ones must never
// name one that something can still bring back: deleting can't be undone.

const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))

/** A picture in KV as an upload from `age` ago would be. */
async function picture(id: string, age = UNUSED_AFTER + 60_000): Promise<string> {
	await env.KV.put(`media:${id}`, PIXEL, { metadata: { type: 'image/png', at: Date.now() - age } })
	return id
}

const unused = async () => (await apiJson<UnusedMediaResponse>('/media/unused')).unused.sort()
const stored = async (id: string) => (await env.KV.get(`media:${id}`, 'arrayBuffer')) !== null

async function publish(id: string, content: PageContent): Promise<void> {
	await apiJson(`/pages/${id}/draft`, { method: 'PUT', json: content })
	await apiJson(`/pages/${id}/publish`, { method: 'POST' })
}

describe('pictures nothing uses any more', () => {
	const used = {
		draft: 'usedindraft1.webp',
		published: 'usedpublish1.webp',
		version: 'usedversion1.webp',
		gallery: 'usedgallery1.jpg',
		product: 'usedproduct1.png',
		cover: 'usedcover001.webp',
		backdrop: 'usedbackdrop.webp',
		shareCard: 'usedsharecrd.jpg',
		linkQr: 'usedlinkqr01.png',
		siteQr: 'usedsiteqr01.png',
		pageQr: 'usedpageqr01.png',
		html: 'usedinhtml01.avif',
		theme: 'usedintheme1.webp',
	}
	let page: PageJson

	beforeAll(async () => {
		for (const id of Object.values(used)) await picture(id)
		page = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'media-page', name: 'Mei' } })).page
		const content = emptyContent('Mei')
		const gallery = { ...newItem('gallery'), id: 'media-gallery', images: [{ id: 'media-image', image: used.gallery, alt: '', url: '' }] }
		const product = { ...newItem('product'), id: 'media-product', products: [{ id: 'media-thing', name: 'Beans', price: '', url: '', image: used.product }] }
		const link = { ...emptyLink(), id: 'media-link', title: 'Shop', url: 'https://example.com/shop', slug: 'media-shop' }
		const first: PageContent = {
			...content,
			profile: { ...content.profile, avatar: used.version },
			appearance: { ...content.appearance, coverImage: used.cover, bgImage: used.backdrop },
			seo: { ...content.seo, autoImage: used.shareCard },
			items: [link, gallery, product] as PageContent['items'],
		}
		// Published once with one avatar, again with another, then the draft moves on to a third.
		await publish(page.id, first)
		await publish(page.id, { ...first, profile: { ...first.profile, avatar: used.published } })
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...first, profile: { ...first.profile, avatar: used.draft } } })

		await apiJson('/links/media-link', { method: 'PATCH', json: { qr: { ...DEFAULT_QR_STYLE, logo: 'upload', logoMedia: used.linkQr } } })
		const { settings } = await apiJson<StateResponse>('/state')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, qrLogo: used.siteQr } })
		await apiJson(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: used.pageQr } })
		const own = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'media-html', name: 'Own' } })).page
		await apiJson(`/pages/${own.id}/draft`, { method: 'PUT', json: { ...own.draft, custom: { kind: 'html', html: `<!doctype html><img src="/media/${used.html}">` } } })
		await apiJson('/themes', { method: 'POST', json: { name: 'Mine', base: 'minimal', accent: '#336699', font: 'sans', button: 'pill', bgImage: used.theme } })
	})

	it('are the ones no draft, published page, kept version, QR code, setting, saved theme or HTML names', async () => {
		const orphans = [await picture('orphanavatar.webp'), await picture('orphancard01.jpg'), await picture('orphanolder1.png', UNUSED_AFTER * 2)].sort()
		expect(await unused()).toEqual(orphans)
	})

	it('covers every picture a backup of the page would list, so the two never part ways', async () => {
		const { page: now } = await apiJson<{ page: PageJson }>(`/pages/${page.id}`)
		const listed = [...mediaIdsOf(now.draft), ...mediaIdsOf(now.published!)]
		expect(listed).toEqual(expect.arrayContaining([used.draft, used.published, used.gallery, used.product, used.cover, used.backdrop, used.shareCard]))
		const gone = await unused()
		for (const id of listed) expect(gone, id).not.toContain(id)
	})

	it('never includes a picture uploaded in the last few days, which a page may be about to use', async () => {
		const upload = await apiJson<{ id: string }>('/media', { method: 'POST', body: PIXEL, headers: { 'content-type': 'image/png' } })
		const recent = await picture('orphanrecent.webp', UNUSED_AFTER - 60_000)
		const gone = await unused()
		expect(gone).not.toContain(upload.id)
		expect(gone).not.toContain(recent)
		const { keptDays } = await apiJson<UnusedMediaResponse>('/media/unused')
		expect(keptDays).toBe(7)
	})

	it('never includes something stored under a name that is not a picture file, which nothing here could match', async () => {
		await picture('raw-upload')
		expect(await unused()).not.toContain('raw-upload')
	})

	it('deletes those and nothing else', async () => {
		const before = await unused()
		expect(before).toEqual(['orphanavatar.webp', 'orphancard01.jpg', 'orphanolder1.png'])
		const answer = await apiJson<DeletedMediaResponse>('/media/unused', { method: 'DELETE' })
		expect(answer).toEqual({ deleted: 3, more: false })
		for (const id of before) expect(await stored(id), id).toBe(false)
		for (const id of [...Object.values(used), 'orphanrecent.webp', 'raw-upload']) expect(await stored(id), id).toBe(true)
		expect(await unused()).toEqual([])
		expect(await apiJson<DeletedMediaResponse>('/media/unused', { method: 'DELETE' })).toEqual({ deleted: 0, more: false })
	})

	it('lets a picture go once the last version that had it is no longer kept', async () => {
		const { page: now } = await apiJson<{ page: PageJson }>(`/pages/${page.id}`)
		expect(await unused()).not.toContain(used.version)
		// The first publish is the only version with it.
		await env.DB.prepare('DELETE FROM page_versions WHERE page_id = ?1 AND content LIKE ?2').bind(now.id, `%${used.version}%`).run()
		expect(await unused()).toEqual([used.version])
	})

	it('is not for a token that may only make short links', async () => {
		const { token } = await apiJson<{ token: string }>('/tokens', { method: 'POST', json: { name: 'links only', scope: 'links' } })
		expect((await api('/media/unused', { bearer: token })).status).toBe(403)
		expect((await api('/media/unused', { method: 'DELETE', bearer: token })).status).toBe(403)
	})
})
