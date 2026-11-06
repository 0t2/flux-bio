import { describe, expect, it } from 'vitest'
import type { Backup } from '../src/shared/backup'
import type { Settings } from '../src/shared/content'
import { DEFAULT_QR_STYLE, defaultQrLogo, qrSvg, QrStyleSchema } from '../src/shared/qr'
import { api, apiJson } from './helpers'

const PICTURE = 'aaaaaaaaaaaa.webp'
const OTHER = 'bbbbbbbbbbbb.webp'

describe('a QR code following the default', () => {
	it("shows its page's picture, else the site's, else nothing", () => {
		expect(defaultQrLogo(PICTURE, OTHER)).toEqual({ media: PICTURE, from: 'page' })
		expect(defaultQrLogo(null, OTHER)).toEqual({ media: OTHER, from: 'site' })
		expect(defaultQrLogo(undefined, '')).toBeNull()
	})

	it('is what a link with no saved style does, with no change until a picture is set', () => {
		expect(DEFAULT_QR_STYLE.logo).toBe('default')
		expect(qrSvg('https://x.example/a', DEFAULT_QR_STYLE)).not.toContain('<image')
		expect(qrSvg('https://x.example/a', DEFAULT_QR_STYLE, { logoHref: `/media/${PICTURE}` })).toContain(`/media/${PICTURE}`)
	})

	it('leaves codes that chose something else alone', () => {
		const none = { ...DEFAULT_QR_STYLE, logo: 'none' as const }
		expect(qrSvg('https://x.example/a', none, { logoHref: `/media/${PICTURE}` })).not.toContain('<image')
		expect(QrStyleSchema.safeParse({ ...DEFAULT_QR_STYLE, logo: 'upload', logoMedia: OTHER }).success).toBe(true)
	})
})

describe('the pictures', () => {
	const makePage = async (handle: string) => (await apiJson<{ page: { id: string; qrLogo: string | null } }>('/pages', { method: 'POST', json: { handle, name: handle } })).page

	it("are kept for a page, without touching its address", async () => {
		const page = await makePage('qr-page')
		expect(page.qrLogo).toBeNull()
		const set = await apiJson<{ page: { handle: string; qrLogo: string | null } }>(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: PICTURE } })
		expect(set.page).toMatchObject({ handle: 'qr-page', qrLogo: PICTURE })
		const { pages } = await apiJson<{ pages: { id: string; qrLogo: string | null }[] }>('/state')
		expect(pages.find((entry) => entry.id === page.id)?.qrLogo).toBe(PICTURE)
		// Renaming keeps the picture, and null removes it.
		const renamed = await apiJson<{ page: { handle: string; qrLogo: string | null } }>(`/pages/${page.id}`, { method: 'PATCH', json: { handle: 'qr-page-2' } })
		expect(renamed.page).toMatchObject({ handle: 'qr-page-2', qrLogo: PICTURE })
		const removed = await apiJson<{ page: { qrLogo: string | null } }>(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: null } })
		expect(removed.page.qrLogo).toBeNull()
	})

	it('go along when a page is copied', async () => {
		const page = await makePage('qr-source')
		await apiJson(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: PICTURE } })
		const copy = await apiJson<{ page: { qrLogo: string | null } }>('/pages', { method: 'POST', json: { handle: 'qr-copy', name: 'Copy', copyFrom: page.id } })
		expect(copy.page.qrLogo).toBe(PICTURE)
	})

	it('are kept for the site, and a save that leaves it out keeps it', async () => {
		const { settings } = await apiJson<{ settings: Settings }>('/state')
		const set = await apiJson<{ settings: Settings }>('/settings', { method: 'PUT', json: { ...settings, qrLogo: OTHER } })
		expect(set.settings.qrLogo).toBe(OTHER)
		const { qrLogo: _, ...withoutIt } = set.settings
		expect((await apiJson<{ settings: Settings }>('/settings', { method: 'PUT', json: withoutIt })).settings.qrLogo).toBe(OTHER)
		expect((await apiJson<{ settings: Settings }>('/settings', { method: 'PUT', json: { ...settings, qrLogo: '' } })).settings.qrLogo).toBe('')
	})

	it('take only media ids', async () => {
		const page = await makePage('qr-bad')
		expect((await api(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: '../../secret' } })).status).toBe(400)
		const { settings } = await apiJson<{ settings: Settings }>('/state')
		expect((await api('/settings', { method: 'PUT', json: { ...settings, qrLogo: '<script>' } })).status).toBe(400)
		expect((await api('/pages/no-such-page', { method: 'PATCH', json: { qrLogo: PICTURE } })).status).toBe(404)
	})

	it('cost visitors nothing: only D1 changes', async () => {
		const page = await makePage('qr-quiet')
		const before = await apiJson<{ page: { draftUpdatedAt: number; publishedAt: number | null } }>(`/pages/${page.id}`)
		await apiJson(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: PICTURE } })
		const after = await apiJson<{ page: { draftUpdatedAt: number; publishedAt: number | null } }>(`/pages/${page.id}`)
		expect(after.page.draftUpdatedAt).toBe(before.page.draftUpdatedAt)
		expect(after.page.publishedAt).toBe(before.page.publishedAt)
	})

	it('come back from a backup, and its list of images has them', async () => {
		const page = await makePage('qr-backup')
		await apiJson(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: PICTURE } })
		const { settings } = await apiJson<{ settings: Settings }>('/state')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, qrLogo: OTHER } })
		const backup = await apiJson<Backup>('/export')
		expect(backup.media).toEqual(expect.arrayContaining([PICTURE, OTHER]))
		expect(backup.settings.qrLogo).toBe(OTHER)
		await apiJson(`/pages/${page.id}`, { method: 'PATCH', json: { qrLogo: null } })
		await apiJson('/settings', { method: 'PUT', json: { ...settings, qrLogo: '' } })
		const restored = await api('/import', { method: 'POST', json: backup })
		expect(restored.status, await restored.clone().text()).toBeLessThan(400)
		const state = await apiJson<{ settings: Settings; pages: { id: string; qrLogo: string | null }[] }>('/state')
		expect(state.settings.qrLogo).toBe(OTHER)
		expect(state.pages.find((entry) => entry.id === page.id)?.qrLogo).toBe(PICTURE)
		await apiJson('/settings', { method: 'PUT', json: { ...state.settings, qrLogo: '' } })
	})
})
