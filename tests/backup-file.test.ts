import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson } from '../src/shared/api'
import { backupFileParts, BackupSchema, type Backup } from '../src/shared/backup'
import { emptyContent, emptyLink } from '../src/shared/content'
import { agentGuide } from '../src/worker/lib/agent'
import { api, apiJson, call, visit } from './helpers'

// The file 設定 → 下載備份 makes has to be enough to bring a site back, for owners whose AI can't save files.
const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))

function dataUrl(bytes: Uint8Array, type: string): string {
	return `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`
}

function decode(url: string): { bytes: Uint8Array; type: string } {
	const [head, payload] = url.split(',')
	return { bytes: Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)), type: head.slice(5).split(';')[0] }
}

describe('the backup file', () => {
	let backup: Backup
	let avatar = ''

	beforeAll(async () => {
		const upload = await api('/media', { method: 'POST', body: PIXEL, headers: { 'content-type': 'image/png' } })
		avatar = ((await upload.json()) as { id: string }).id
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'keep-me', name: 'Keep me' } })
		const content = emptyContent('Keep me')
		content.profile.avatar = avatar
		content.items = [{ ...emptyLink(), id: 'keep-link-1', title: 'Shop', url: 'https://example.com/shop', slug: 'keep-shop' }]
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: content })
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		backup = await apiJson<Backup>('/export')
	})

	it('is the export with its images inside', () => {
		expect(backup.media).toEqual([avatar])
		const file = JSON.parse(backupFileParts(backup, [[avatar, dataUrl(PIXEL, 'image/png')]]).join(''))
		const { mediaFiles, ...rest } = file
		expect(rest).toEqual(backup)
		expect(Object.keys(mediaFiles)).toEqual([avatar])
		expect(BackupSchema.safeParse(rest).success).toBe(true)
		// The API ignores the images if the whole file is sent, so a slip there can't break a restore.
		expect(BackupSchema.safeParse(file).success).toBe(true)
	})

	it('is valid with no images, and keeps several apart', () => {
		expect(JSON.parse(backupFileParts(backup, []).join('')).mediaFiles).toEqual({})
		const files = JSON.parse(backupFileParts(backup, [['a.png', 'data:image/png;base64,AA=='], ['b.png', 'data:image/png;base64,BB==']]).join('')).mediaFiles
		expect(files).toEqual({ 'a.png': 'data:image/png;base64,AA==', 'b.png': 'data:image/png;base64,BB==' })
	})

	it('brings a wiped site back: the page, its short link and its image', async () => {
		const file = JSON.parse(backupFileParts(backup, [[avatar, dataUrl(PIXEL, 'image/png')]]).join(''))
		expect((await api('/data', { method: 'DELETE', json: { confirm: 'DELETE' } })).status).toBe(200)
		expect((await visit('/keep-me')).status).toBe(404)
		expect((await call(`/media/${avatar}`)).status).toBe(404)

		// What the guide tells an agent to do with this file.
		const { mediaFiles, ...rest } = file as Backup & { mediaFiles: Record<string, string> }
		for (const [id, url] of Object.entries(mediaFiles)) {
			const { bytes, type } = decode(url)
			expect((await api(`/media/${id}`, { method: 'PUT', body: bytes, headers: { 'content-type': type } })).status).toBe(200)
		}
		expect(await apiJson('/import', { method: 'POST', json: rest })).toMatchObject({ pages: 1, shortLinks: 1 })

		const page = await visit('/keep-me')
		expect(page.status).toBe(200)
		expect(await page.text()).toContain(`/media/${avatar}`)
		expect(new Uint8Array(await (await call(`/media/${avatar}`)).arrayBuffer())).toEqual(PIXEL)
		const link = await visit('/keep-shop')
		expect(link.status).toBe(302)
		expect(link.headers.get('location')).toContain('https://example.com/shop')
	})
})

describe('the guide', () => {
	const guide = agentGuide('https://bio.example')

	it('has an AI back up before it changes anything, and says what to do when it cannot save files', () => {
		expect(guide).toContain('**Back up before you change anything.**')
		expect(guide).toContain("ask them to press Download backup on Settings and wait")
		expect(guide).toContain('~/FluxBio-backups/')
		expect(guide).toContain('If the backup fails, stop')
	})

	it('keeps the file out of git and tells it to skip images it already has', () => {
		expect(guide).toContain('Keep it out of any git repository')
		expect(guide).toContain('skip the ones already in that folder')
	})
})
