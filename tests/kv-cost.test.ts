import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson } from '../src/shared/api'
import { emptyContent, emptyLink, newItem } from '../src/shared/content'
import app from '../src/worker/index'
import { forgetSite } from '../src/worker/lib/ops'
import { IPHONE, ORIGIN, PASSWORD } from './helpers'

// The free plan allows 100,000 KV reads and 1,000 writes a day, and AGENTS.md and the agent guide say what each
// thing costs, in page views and changes for owners (kvLeftInPlainWords). If one of these changes, change what they say too.
async function measure(path: string, init: RequestInit & { json?: unknown } = {}) {
	const count = { reads: 0, writes: 0, deletes: 0 }
	const KV = new Proxy(env.KV, {
		get(target, name) {
			const value = Reflect.get(target, name) as unknown
			if (typeof value !== 'function') return value
			return (...args: unknown[]) => {
				if (name === 'get' || name === 'getWithMetadata') count.reads++
				if (name === 'put') count.writes++
				if (name === 'delete') count.deletes++
				return value.apply(target, args) as unknown
			}
		},
	})
	const { json, ...rest } = init
	const headers = new Headers(rest.headers)
	if (!headers.has('user-agent')) headers.set('user-agent', IPHONE)
	if (path.startsWith('/api/')) headers.set('authorization', `Bearer ${PASSWORD}`)
	if (json !== undefined) headers.set('content-type', 'application/json')
	const ctx = createExecutionContext()
	const request = new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...rest, headers, body: json === undefined ? rest.body : JSON.stringify(json) })
	const response = await app.fetch(request, { ...env, KV }, ctx)
	await waitOnExecutionContext(ctx)
	return { ...count, status: response.status, response }
}

const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))

describe('what things cost in KV', () => {
	let homeId = ''
	let image = ''

	beforeAll(async () => {
		const home = await measure('/api/pages', { method: 'POST', json: { handle: 'cost-home', name: 'Home' } })
		homeId = ((await home.response.json()) as { page: PageJson }).page.id
		const other = await measure('/api/pages', { method: 'POST', json: { handle: 'cost-other', name: 'Other' } })
		const otherId = ((await other.response.json()) as { page: PageJson }).page.id
		expect((await measure(`/api/pages/${otherId}/publish`, { method: 'POST' })).status).toBe(200)
	})

	it('uploading an image is one write', async () => {
		const upload = await measure('/api/media', { method: 'POST', body: PIXEL, headers: { 'content-type': 'image/png' } })
		image = ((await upload.response.json()) as { id: string }).id
		expect(upload.writes).toBe(1)
	})

	it('saving a draft costs nothing, and publishing the home page writes it, its new link and the site', async () => {
		const content = emptyContent('Home')
		content.profile.avatar = image
		content.items = [{ ...emptyLink(), id: 'cost-link-1', title: 'Shop', url: 'https://example.com/shop', slug: 'cost-shop' }]
		const read = await measure(`/api/pages/${homeId}`)
		const { page } = (await read.response.json()) as { page: PageJson }
		const draft = await measure(`/api/pages/${homeId}/draft`, { method: 'PUT', json: content, headers: { 'if-match': String(page.draftUpdatedAt) } })
		expect(draft.status).toBe(200)
		expect(draft).toMatchObject({ reads: 0, writes: 0, deletes: 0 })
		const publish = await measure(`/api/pages/${homeId}/publish`, { method: 'POST' })
		expect(publish.status).toBe(200)
		expect(publish.writes).toBe(3)
	})

	it('publishing the home page again is three writes: its copy leaves the site record first, then the page and the record are written', async () => {
		const again = await measure(`/api/pages/${homeId}/publish`, { method: 'POST' })
		expect(again).toMatchObject({ status: 200, writes: 3, deletes: 1 })
	})

	it('a page view is one read, at the home page and at its own address', async () => {
		const home = await measure('/')
		expect(home.status).toBe(200)
		expect(home.reads).toBe(1)
		const other = await measure('/cost-other')
		expect(other.status).toBe(200)
		expect(other.reads).toBe(1)
		expect(home.writes + other.writes).toBe(0)
	})

	it('a redirect is one read, and so is each image', async () => {
		const link = await measure('/cost-shop')
		expect(link.status).toBe(302)
		expect(link.reads).toBe(1)
		const media = await measure(`/media/${image}`)
		expect(media.status).toBe(200)
		expect(media.reads).toBe(1)
	})

	it('a tap on a button or a counted social icon is one read and writes nothing', async () => {
		const made = await measure('/api/pages', { method: 'POST', json: { handle: 'cost-tap', name: 'Tap' } })
		const { page } = (await made.response.json()) as { page: PageJson }
		const link = { ...emptyLink(), id: 'cost-link', title: 'Link', url: 'https://example.com/tap', slug: 'cost-tap-link' }
		const embed = { ...newItem('embed'), id: 'cost-embed', account: 'cost' }
		const content = { ...page.draft, items: [link, embed], embedButton: { provider: 'calendly', account: 'cost/intro' }, countSocials: true, socials: [{ id: 'cost-icon', platform: 'instagram', url: 'https://instagram.com/cost' }] }
		await measure(`/api/pages/${page.id}/draft`, { method: 'PUT', json: content, headers: { 'if-match': String(page.draftUpdatedAt) } })
		await measure(`/api/pages/${page.id}/publish`, { method: 'POST' })
		for (const path of ['/_c/cost-tap/cost-link/link', '/_c/cost-tap/cost-icon/social', '/_c/cost-tap/cost-embed/kofi', '/_c/cost-tap/page/calendly']) {
			const tap = await measure(path, { method: 'POST', body: 'PING' })
			expect(tap.status).toBe(204)
			expect(tap).toMatchObject({ reads: 1, writes: 0, deletes: 0 })
		}
	})

	it('costs no more in a copy of the Worker that has just started, which has yet to learn the time zone', async () => {
		for (const path of ['/', '/cost-other', '/cost-shop']) {
			forgetSite()
			expect((await measure(path)).reads).toBe(1)
		}
		forgetSite()
		expect((await measure('/_c/cost-tap/cost-link/link', { method: 'POST', body: 'PING' })).reads).toBe(1)
	})

	it('an address that is nothing is one read, and one that could never be anything is none, once the site is known', async () => {
		forgetSite()
		// The first not-found page in a copy of the Worker reads the site record for its language and look.
		expect(await measure('/cost-nothing')).toMatchObject({ status: 404, reads: 2 })
		expect(await measure('/cost-nothing-else')).toMatchObject({ status: 404, reads: 1 })
		expect(await measure('/wp-login.php')).toMatchObject({ status: 404, reads: 0 })
		expect(await measure('/wp-admin/setup-config.php')).toMatchObject({ status: 404, reads: 0 })
	})

	it('Share writes one short link once, and renaming a live one is two writes and two deletes', async () => {
		const made = await measure('/api/pages', { method: 'POST', json: { handle: 'cost-share', name: 'Share' } })
		const { page } = (await made.response.json()) as { page: PageJson }
		const link = { ...emptyLink(), id: 'cost-share-link', title: 'Link', url: 'https://example.com/share', slug: 'cost-share-one' }
		await measure(`/api/pages/${page.id}/draft`, { method: 'PUT', json: { ...page.draft, items: [link] }, headers: { 'if-match': String(page.draftUpdatedAt) } })
		const share = () => measure(`/api/pages/${page.id}/links/${link.id}/short`, { method: 'PUT', json: {} })
		expect(await share()).toMatchObject({ status: 200, writes: 1, deletes: 0 })
		expect(await share()).toMatchObject({ status: 200, writes: 0, deletes: 0 })
		await measure(`/api/pages/${page.id}/publish`, { method: 'POST' })
		const rename = await measure(`/api/pages/${page.id}/links/${link.id}/short`, { method: 'PUT', json: { slug: 'cost-share-two' } })
		expect(rename).toMatchObject({ status: 200, writes: 2, deletes: 2 })
	})

	it('exporting a backup reads D1 only: its images are the only cost', async () => {
		const backup = await measure('/api/export')
		expect(backup.status).toBe(200)
		expect(backup).toMatchObject({ reads: 0, writes: 0, deletes: 0 })
	})

	it('a new short link is one write', async () => {
		const link = await measure('/api/links', { method: 'POST', json: { url: 'https://example.com/one', slug: 'cost-one' } })
		expect(link.status).toBe(201)
		expect(link.writes).toBe(1)
	})
})
