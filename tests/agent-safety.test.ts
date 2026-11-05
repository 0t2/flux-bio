import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateTokenResponse, PageJson, PageVersionJson, PublishResponse } from '../src/shared/api'
import { emptyContent, emptyLink, type PageContent } from '../src/shared/content'
import { DEFAULT_QR_STYLE, qrSvg } from '../src/shared/qr'
import { LIMITS } from '../src/worker/lib/mode'
import { agentGuide, guideNames } from '../src/worker/lib/agent'
import { guideTopic } from '../src/worker/lib/agentTopics'
import { api, apiJson, call, ORIGIN, PASSWORD, visit } from './helpers'

// An agent and the owner work on the same pages. Nothing here may lose what the other one did.

let count = 0
const makePage = async () => (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: `safety-${++count}`, name: 'Safety' } })).page
const named = (name: string, base?: PageContent): PageContent => {
	const content = structuredClone(base ?? emptyContent(name))
	content.profile.name = name
	return content
}
const readPage = async (id: string) => (await apiJson<{ page: PageJson }>(`/pages/${id}`)).page
/** A request with exactly these headers: the helper adds no version of its own. */
const raw = (path: string, method: string, version?: string | number, json?: unknown) =>
	call(`/api${path}`, {
		method,
		headers: { authorization: `Bearer ${PASSWORD}`, 'content-type': 'application/json', ...(version === undefined ? {} : { 'if-match': String(version) }) },
		...(json === undefined ? {} : { body: JSON.stringify(json) }),
	})
const errorCode = async (response: Response) => ((await response.json()) as { error: string }).error
const publish = (id: string, init: RequestInit & { bearer?: string } = {}) => apiJson<PublishResponse>(`/pages/${id}/publish`, { method: 'POST', ...init })
const versions = async (id: string) => (await apiJson<{ versions: PageVersionJson[] }>(`/pages/${id}/versions`)).versions

describe('saving a draft', () => {
	it('needs to know which draft was read', async () => {
		const page = await makePage()
		const response = await raw(`/pages/${page.id}/draft`, 'PUT', undefined, named('No version'))
		expect(response.status).toBe(428)
		expect(await errorCode(response)).toBe('draft-version-required')
		expect((await raw(`/pages/${page.id}/draft`, 'PUT', 'soon', named('Bad version'))).status).toBe(428)
		expect((await readPage(page.id)).draft.profile.name).toBe('Safety')
	})

	it('goes through when it read the latest, and gives the version for next time', async () => {
		const page = await makePage()
		const first = await raw(`/pages/${page.id}/draft`, 'PUT', page.draftUpdatedAt, named('One'))
		expect(first.status).toBe(200)
		const { draftUpdatedAt } = (await first.json()) as { draftUpdatedAt: number }
		expect(draftUpdatedAt).toBeGreaterThan(page.draftUpdatedAt)
		expect((await readPage(page.id)).draftUpdatedAt).toBe(draftUpdatedAt)
		// A quoted value is how HTTP usually writes these.
		expect((await raw(`/pages/${page.id}/draft`, 'PUT', `"${draftUpdatedAt}"`, named('Two'))).status).toBe(200)
		expect((await readPage(page.id)).draft.profile.name).toBe('Two')
	})

	it("doesn't overwrite what someone else saved after it read the page", async () => {
		const page = await makePage()
		const owner = page.draftUpdatedAt
		const agent = page.draftUpdatedAt
		expect((await raw(`/pages/${page.id}/draft`, 'PUT', owner, named('From the owner'))).status).toBe(200)
		const late = await raw(`/pages/${page.id}/draft`, 'PUT', agent, named('From the agent'))
		expect(late.status).toBe(409)
		expect(await errorCode(late)).toBe('draft-changed')
		expect((await readPage(page.id)).draft.profile.name).toBe('From the owner')
	})

	it('lets only one of two saves at the same moment through', async () => {
		const page = await makePage()
		const results = await Promise.all(['A', 'B', 'C'].map((name) => raw(`/pages/${page.id}/draft`, 'PUT', page.draftUpdatedAt, named(name))))
		expect(results.map((response) => response.status).sort()).toEqual([200, 409, 409])
	})

	it('says when the page is gone, not that it changed', async () => {
		const response = await raw('/pages/no-such-page/draft', 'PUT', 1, named('Nobody'))
		expect(response.status).toBe(404)
	})
})

describe('publishing', () => {
	it('refuses a draft other than the one the caller read, and publishes nothing', async () => {
		const page = await makePage()
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('Half finished') })
		const response = await raw(`/pages/${page.id}/publish`, 'POST', page.draftUpdatedAt)
		expect(response.status).toBe(409)
		expect(await errorCode(response)).toBe('draft-changed')
		expect((await readPage(page.id)).published).toBeNull()
	})

	it('still works without saying, and gives the version for the next save', async () => {
		const page = await makePage()
		const published = await publish(page.id)
		expect(published.draftUpdatedAt).toBeGreaterThan(page.draftUpdatedAt)
		expect((await readPage(page.id)).draftUpdatedAt).toBe(published.draftUpdatedAt)
		expect((await raw(`/pages/${page.id}/draft`, 'PUT', page.draftUpdatedAt, named('Stale'))).status).toBe(409)
		expect((await raw(`/pages/${page.id}/draft`, 'PUT', published.draftUpdatedAt, named('Fresh'))).status).toBe(200)
	})
})

describe('going back to a published version', () => {
	it('lists each publish, newest first, with who did it', async () => {
		const page = await makePage()
		expect(await versions(page.id)).toEqual([])
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('By the owner') })
		await publish(page.id)
		const { token } = await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'Claude Code', scope: 'full' } })
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('By the AI'), bearer: token })
		await publish(page.id, { bearer: token })
		const list = await versions(page.id)
		expect(list.map(({ by, tokenName, current }) => ({ by, tokenName, current }))).toEqual([
			{ by: 'token', tokenName: 'Claude Code', current: true },
			{ by: 'owner', tokenName: null, current: false },
		])
		const older = await apiJson<{ content: PageContent }>(`/pages/${page.id}/versions/${list[1]!.id}`)
		expect(older.content.profile.name).toBe('By the owner')
	})

	it('puts it in the draft, not in front of visitors, until it is published', async () => {
		const page = await makePage()
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('First') })
		await publish(page.id)
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('Second') })
		await publish(page.id)
		const old = (await versions(page.id))[1]!
		const current = await readPage(page.id)

		const missing = await raw(`/pages/${page.id}/versions/${old.id}/restore`, 'POST')
		expect(missing.status).toBe(428)
		expect((await raw(`/pages/${page.id}/versions/${old.id}/restore`, 'POST', current.draftUpdatedAt - 1)).status).toBe(409)
		expect((await raw(`/pages/${page.id}/versions/nope/restore`, 'POST', current.draftUpdatedAt)).status).toBe(404)

		const restored = await raw(`/pages/${page.id}/versions/${old.id}/restore`, 'POST', current.draftUpdatedAt)
		expect(restored.status).toBe(200)
		const after = await readPage(page.id)
		expect(after.draft.profile.name).toBe('First')
		expect(after.published?.profile.name).toBe('Second')
		expect(await (await visit(`/${page.handle}`)).text()).toContain('Second')

		await publish(page.id)
		expect(await (await visit(`/${page.handle}`)).text()).toContain('First')
		expect((await versions(page.id)).length).toBe(3)
	})

	it('brings back a link removed since then, under the same short URL', async () => {
		const page = await makePage()
		const withLink = named('Links')
		withLink.items = [{ ...emptyLink(), id: 'back-link-1', title: 'Back', url: 'https://example.com/back', slug: 'come-back' }]
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: withLink })
		await publish(page.id)
		expect((await visit('/come-back')).status).toBe(302)
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('No links') })
		await publish(page.id)
		expect((await visit('/come-back')).status).toBe(404)

		const old = (await versions(page.id))[1]!
		await raw(`/pages/${page.id}/versions/${old.id}/restore`, 'POST', (await readPage(page.id)).draftUpdatedAt)
		await publish(page.id)
		const back = await visit('/come-back')
		expect(back.status).toBe(302)
		expect(back.headers.get('location')).toBe('https://example.com/back')
	})

	it(`keeps the last ${LIMITS.versions}`, async () => {
		const page = await makePage()
		for (let n = 0; n < LIMITS.versions + 2; n++) await publish(page.id)
		const list = await versions(page.id)
		expect(list).toHaveLength(LIMITS.versions)
		expect(list[0]?.current).toBe(true)
		expect(list.slice(1).every((version) => !version.current)).toBe(true)
	})

	it('saves what was live before versions were kept, once', async () => {
		const page = await makePage()
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('From before') })
		await publish(page.id)
		// As a site that upgraded, or restored a backup, finds itself.
		await env.DB.prepare('DELETE FROM page_versions WHERE page_id = ?1').bind(page.id).run()
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: named('After') })
		await publish(page.id)
		const list = await versions(page.id)
		expect(list).toHaveLength(2)
		expect(list[1]?.by).toBeNull()
		expect((await apiJson<{ content: PageContent }>(`/pages/${page.id}/versions/${list[1]!.id}`)).content.profile.name).toBe('From before')
		await publish(page.id)
		expect(await versions(page.id)).toHaveLength(3)
	})

	it('goes with the page when it is deleted', async () => {
		const page = await makePage()
		await publish(page.id)
		await apiJson(`/pages/${page.id}`, { method: 'DELETE' })
		const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM page_versions WHERE page_id = ?1').bind(page.id).first<{ n: number }>()
		expect(left?.n).toBe(0)
		expect((await api(`/pages/${page.id}/versions`)).status).toBe(404)
	})

	it('is out of reach of a token that only makes short links', async () => {
		const page = await makePage()
		const { token } = await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'Links only', scope: 'links' } })
		expect((await api(`/pages/${page.id}/versions`, { bearer: token })).status).toBe(403)
	})
})

describe('changing settings', () => {
	it('takes only what changes, and leaves the rest as it is', async () => {
		const before = (await apiJson<{ settings: Record<string, unknown> }>('/state')).settings
		const { settings } = await apiJson<{ settings: Record<string, unknown> }>('/settings', { method: 'PUT', json: { timezone: 'Asia/Taipei' } })
		expect(settings).toEqual({ ...before, timezone: 'Asia/Taipei' })
		const invalid = await api('/settings', { method: 'PUT', json: { timezone: 'Not/AZone' } })
		expect(invalid.status).toBe(400)
		await apiJson('/settings', { method: 'PUT', json: { timezone: before.timezone } })
	})
})

describe('a QR code through the API', () => {
	let linkId = ''
	const short = `${ORIGIN}/qr-api-link`
	const qr = (id: string, query = '') => api(`/links/${id}/qr${query}`)

	beforeAll(async () => {
		const created = await apiJson<{ link: { id: string } }>('/links', { method: 'POST', json: { url: 'https://example.com/qr', slug: 'qr-api-link' } })
		linkId = created.link.id
	})

	it('is the same code a dashboard download draws, as a file', async () => {
		const response = await qr(linkId)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('image/svg+xml')
		expect(response.headers.get('content-disposition')).toContain('qr-qr-api-link.svg')
		expect(response.headers.get('cache-control')).toBe('no-store')
		const text = await response.text()
		expect(text).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n${qrSvg(`${short}?s=qr`, DEFAULT_QR_STYLE)}`)
	})

	it('follows the saved style, and takes another print size', async () => {
		const style = { ...DEFAULT_QR_STYLE, fg: '#123456', shape: 'dots' as const, logo: 'none' as const }
		await apiJson(`/links/${linkId}`, { method: 'PATCH', json: { qr: style } })
		const saved = await (await qr(linkId)).text()
		expect(saved).toContain('#123456')
		expect(saved).toContain('width="5cm"')
		expect(await (await qr(linkId, '?size=poster')).text()).toContain('width="15cm"')
		expect(await (await qr(linkId, '?size=enormous')).text()).toContain('width="5cm"')
		await apiJson(`/links/${linkId}`, { method: 'PATCH', json: { qr: DEFAULT_QR_STYLE } })
	})

	it('carries its picture inside the file while the picture is small, and only links to a large one', async () => {
		const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
		await env.KV.put('media:small.png', bytes, { metadata: { type: 'image/png' } })
		await env.KV.put('media:large.png', new Uint8Array(257 * 1024), { metadata: { type: 'image/png' } })
		const withPicture = async (logoMedia: string) => {
			await apiJson(`/links/${linkId}`, { method: 'PATCH', json: { qr: { ...DEFAULT_QR_STYLE, logo: 'upload', logoMedia } } })
			return (await qr(linkId)).text()
		}
		expect(await withPicture('small.png')).toContain(`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`)
		expect(await withPicture('large.png')).toContain(`${ORIGIN}/media/large.png`)
		expect(await withPicture('missing.png')).not.toContain('<image')
		await apiJson(`/links/${linkId}`, { method: 'PATCH', json: { qr: DEFAULT_QR_STYLE } })
	})

	it("uses the page's default picture, then the site's", async () => {
		await env.KV.put('media:site.png', new Uint8Array([1]), { metadata: { type: 'image/png' } })
		const { settings } = await apiJson<{ settings: Record<string, unknown> }>('/state')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, qrLogo: 'site.png' } })
		expect(await (await qr(linkId)).text()).toContain('data:image/png;base64,AQ==')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, qrLogo: '' } })
	})

	it("won't make a code for a link that no longer works, or one that doesn't exist", async () => {
		const { link } = await apiJson<{ link: { id: string } }>('/links', { method: 'POST', json: { url: 'https://example.com/old', slug: 'qr-api-old' } })
		await apiJson(`/links/${link.id}`, { method: 'PATCH', json: { status: 'archived' } })
		expect((await qr(link.id)).status).toBe(409)
		expect((await qr('no-such-link')).status).toBe(404)
	})

	it('needs a full token', async () => {
		const { token } = await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'Links QR', scope: 'links' } })
		expect((await api(`/links/${linkId}/qr`, { bearer: token })).status).toBe(403)
		expect((await call(`/api/links/${linkId}/qr`)).status).toBe(401)
	})
})

describe('the guide', () => {
	const guide = agentGuide(ORIGIN, 'flux-bio')

	it('tells an agent how not to lose anyone’s work', () => {
		for (const part of ['If-Match: <page.draftUpdatedAt>', '**Someone else changed the draft.**', '`draft-changed`', 'Never send your old copy again', 'ask before you publish their unfinished text']) expect(guide).toContain(part)
	})

	it('tells an agent how to undo a publish and hand over a QR code', () => {
		for (const part of ['**Undo a publish.**', `last ${LIMITS.versions} published versions`, 'Restoring a published version']) expect(guide).toContain(part)
		const links = guideTopic('links', guideNames(ORIGIN, 'flux-bio'))
		for (const part of ['**Get a QR code.**', 'GET /api/links/{id}/qr']) expect(links).toContain(part)
		expect(guideTopic('faq', guideNames(ORIGIN, 'flux-bio'))).toContain('a publish can be undone')
	})
})
