import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson, PreviewLinkResponse, StatsResponse } from '../src/shared/api'
import { emptyContent, emptyLink, type LinkItem } from '../src/shared/content'
import { slugProblem } from '../src/shared/slug'
import { STARTER_IDS, starterContent, starterPreview } from '../src/shared/starters'
import { renderBioPage, visibleItems } from '../src/templates/render'
import { createPreviewToken, readPreviewToken, sessionKeyOf } from '../src/worker/lib/auth'
import { api, apiJson, visit } from './helpers'

const draftWith = (title: string) => {
	const content = emptyContent('Preview page')
	const link: LinkItem = { ...emptyLink(), id: 'draft-link-1', title, url: 'https://example.com/a' }
	content.items = [link]
	return content
}

let pageId = ''
const handle = 'previewpage'
const pathOf = (url: string) => new URL(url).pathname
const makeLink = (init: RequestInit & { json?: unknown } = {}) => apiJson<PreviewLinkResponse>(`/pages/${pageId}/preview-link`, { method: 'POST', ...init })

beforeAll(async () => {
	pageId = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle, name: 'Preview page' } })).page.id
	await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: draftWith('Published title') })
	await apiJson(`/pages/${pageId}/publish`, { method: 'POST' })
	await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: draftWith('Only in the draft') })
})

describe('draft preview links', () => {
	it('opens the draft without signing in, marked as a draft and kept out of search', async () => {
		const { url } = await makeLink()
		const response = await visit(pathOf(url))
		const html = await response.text()
		expect(response.status).toBe(200)
		expect(html).toContain('Only in the draft')
		expect(html).toContain('class="draft-note"')
		expect(response.headers.get('x-robots-tag')).toBe('noindex')
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(response.headers.get('referrer-policy')).toBe('no-referrer')
		expect(response.headers.get('content-security-policy')).toMatch(/script-src 'nonce-[\w-]+'.*connect-src 'self'/)
	})

	it('leaves the public page alone', async () => {
		const html = await (await visit(`/${handle}`)).text()
		expect(html).toContain('Published title')
		expect(html).not.toContain('Only in the draft')
		expect(html).not.toContain('draft-note')
	})

	it('reports a new version after the draft changes', async () => {
		const version = pathOf((await makeLink()).url) + '/version'
		const before = (await (await visit(version)).json()) as { version: number }
		await new Promise((resolve) => setTimeout(resolve, 5))
		await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: draftWith('Only in the draft, again') })
		const after = (await (await visit(version)).json()) as { version: number }
		expect(after.version).toBeGreaterThan(before.version)
	})

	it('is not counted in the stats', async () => {
		const views = async () => (await apiJson<StatsResponse>(`/stats?page=${pageId}&days=7`)).totals.views
		const before = await views()
		await visit(pathOf((await makeLink()).url))
		expect(await views()).toBe(before)
	})

	it('takes an optional length and refuses one out of range', async () => {
		const after = (expiresAt: number) => expiresAt - Date.now()
		expect(Math.abs(after((await makeLink({ json: { minutes: 30 } })).expiresAt) - 30 * 60 * 1000)).toBeLessThan(5000)
		expect(Math.abs(after((await makeLink({ json: { minutes: 10080 } })).expiresAt) - 7 * 24 * 3600 * 1000)).toBeLessThan(5000)
		for (const json of [{ minutes: 0 }, { minutes: 10081 }, { minutes: 1.5 }, { hours: 999 }]) {
			expect((await api(`/pages/${pageId}/preview-link`, { method: 'POST', json })).status, JSON.stringify(json)).toBe(400)
		}
	})

	it('still takes hours from tools written before minutes existed', async () => {
		const { expiresAt } = await makeLink({ json: { hours: 2 } })
		expect(Math.abs(expiresAt - Date.now() - 2 * 3600 * 1000)).toBeLessThan(5000)
	})

	it('lasts ten minutes when nothing says otherwise', async () => {
		for (const init of [{}, { json: {} }]) {
			const { expiresAt } = await makeLink(init)
			expect(Math.abs(expiresAt - Date.now() - 10 * 60 * 1000)).toBeLessThan(5000)
		}
	})

	it('moves an open preview to the expired page when its time is up', async () => {
		const html = await (await visit(pathOf((await makeLink()).url))).text()
		expect(html).toContain('if(r.status===410)location.reload()')
	})

	it('refuses a forged or altered token', async () => {
		const { url } = await makeLink()
		const [id, expiry, signature] = pathOf(url).split('/').pop()!.split('.')
		for (const token of ['nope', `${id}.${expiry}.AAAA`, `${id}.${Number(expiry) + 999}.${signature}`, `other.${expiry}.${signature}`]) {
			expect((await visit(`/_draft/${token}`)).status, token).toBe(404)
			expect((await visit(`/_draft/${token}/version`)).status, token).toBe(410)
		}
	})

	it('stops working when it expires', async () => {
		const token = await createPreviewToken(await sessionKeyOf(env), pageId, Date.now() - 1000)
		const response = await visit(`/_draft/${token}`)
		expect(response.status).toBe(410)
		expect(await response.text()).not.toContain('Only in the draft')
		expect((await visit(`/_draft/${token}/version`)).status).toBe(410)
	})

	it('is signed by the password, so changing it ends every link', async () => {
		const token = await createPreviewToken(await sessionKeyOf(env), pageId, Date.now() + 60000)
		expect(await readPreviewToken(await sessionKeyOf(env), token)).not.toBeNull()
		expect(await readPreviewToken(await sessionKeyOf({ ...env, ADMIN_PASSWORD: 'a-different-password-1' }), token)).toBeNull()
	})

	it('stops when the page is deleted', async () => {
		const other = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'previewgone', name: 'Gone' } })).page.id
		const { url } = await apiJson<PreviewLinkResponse>(`/pages/${other}/preview-link`, { method: 'POST' })
		await apiJson(`/pages/${other}`, { method: 'DELETE' })
		expect((await visit(pathOf(url))).status).toBe(404)
		expect((await visit(pathOf(url) + '/version')).status).toBe(410)
	})

	it("isn't open to a token that may only make short links", async () => {
		const { token } = await apiJson<{ token: string }>('/tokens', { method: 'POST', json: { name: 'links only', scope: 'links' } })
		expect((await api(`/pages/${pageId}/preview-link`, { method: 'POST', bearer: token })).status).toBe(403)
	})

	it('cannot collide with a page or short link', () => {
		expect(slugProblem('_draft')).not.toBeNull()
	})
})

describe('rendering', () => {
	const options = { mode: 'live' as const, mediaUrl: (id: string) => `/media/${id}` }
	it('adds the draft bar and its script only to draft previews', () => {
		const plain = renderBioPage(draftWith('A'), options)
		expect(plain).not.toContain('draft-note')
		expect(plain).not.toContain('<script')
		const draft = renderBioPage(draftWith('A'), { ...options, mode: 'preview', draft: { nonce: 'abc123', versionUrl: '/_draft/x/version', version: 7 } })
		expect(draft).toContain('<script nonce="abc123">')
		expect(draft).toContain('"/_draft/x/version"')
	})

	it('names the bar in every language', () => {
		const zh = renderBioPage(draftWith('A'), { ...options, locale: 'zh-TW', draft: { nonce: 'n', versionUrl: '/v', version: 1 } })
		expect(zh).toContain('草稿預覽')
	})
})

describe('unfinished links', () => {
	const options = { mediaUrl: (id: string) => `/media/${id}` }
	const unfinished = () => {
		const content = emptyContent('Name')
		content.items = [{ ...emptyLink(), id: 'no-address-1', title: 'Coming soon', url: '' }]
		return content
	}

	it('show in previews, marked as unfinished', () => {
		const html = renderBioPage(unfinished(), { ...options, mode: 'preview', locale: 'en' })
		expect(html).toContain('Coming soon')
		expect(html).toContain('class="link todo"')
		expect(html).toContain('No URL yet')
	})

	it('stay off the public page', () => {
		const html = renderBioPage(unfinished(), { ...options, mode: 'live', locale: 'en' })
		expect(html).not.toContain('Coming soon')
		expect(html).not.toContain('todo')
	})

	it('show on a draft preview link', async () => {
		await apiJson(`/pages/${pageId}/draft`, { method: 'PUT', json: unfinished() })
		const { url } = await makeLink()
		expect(await (await visit(pathOf(url))).text()).toContain('Coming soon')
	})
})

describe('template previews', () => {
	for (const id of STARTER_IDS) {
		it(`shows ${id}'s links before they have a URL`, () => {
			const hidden = visibleItems(starterContent(id, 'Name')).filter((item) => item.kind === 'link')
			const shown = visibleItems(starterPreview(id, 'Name')).filter((item) => item.kind === 'link')
			expect(hidden).toHaveLength(0)
			expect(shown.length).toBeGreaterThan(0)
		})
	}

	it("doesn't put the stand-in address into the content a page starts from", () => {
		for (const id of STARTER_IDS) {
			expect(JSON.stringify(starterContent(id, 'Name'))).not.toContain('"url":"#"')
		}
	})
})
