import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Backup } from '../src/shared/backup'
import type { StateResponse } from '../src/shared/api'
import { CONTENT_BYTES_LIMIT } from '../src/shared/content'
import { SITE_KEY } from '../src/worker/lib/cache'
import { settingsAndOwed, updateSettings } from '../src/worker/lib/ops'
import { api, apiJson, call, PASSWORD, visit } from './helpers'

// The smaller things two reviews found (2026-11-20), each cheap to put right.

type Draft = Record<string, unknown>
const made = async (handle: string) => (await apiJson<{ page: { id: string; draft: Draft } }>('/pages', { method: 'POST', json: { handle, name: handle } })).page
const publish = async (id: string) => expect((await api(`/pages/${id}/publish`, { method: 'POST' })).status).toBe(200)

describe('the admin password as a bearer token', () => {
	afterEach(() => vi.restoreAllMocks())
	const waits = () => vi.spyOn(scheduler, 'wait').mockResolvedValue(undefined)

	it('waits on a wrong one as the sign-in form does, so it is no quicker a place to guess at', async () => {
		const wait = waits()
		expect((await call('/api/state', { headers: { authorization: 'Bearer not-the-password-at-all' } })).status).toBe(401)
		expect(wait).toHaveBeenCalledWith(800)
	})

	it('doesn’t wait on the right one, on an API token, or on no token at all', async () => {
		const wait = waits()
		expect((await call('/api/state', { headers: { authorization: `Bearer ${PASSWORD}` } })).status).toBe(200)
		expect((await call('/api/state', { headers: { authorization: `Bearer fbk_${'a'.repeat(32)}` } })).status).toBe(401)
		expect((await call('/api/state')).status).toBe(401)
		expect(wait).not.toHaveBeenCalled()
	})
})

describe('a page’s content', () => {
	const words = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, n) => [`text ${n}`, '長'.repeat(1000)]))

	it('is refused past what could ever be published, with its size and the limit', async () => {
		const page = await made('rm-large')
		// Each text is within its own limit. A character of Chinese is three bytes, and D1 counts bytes.
		const refused = await api(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...page.draft, translations: { ja: words(400) } } })
		expect(refused.status).toBe(413)
		const body = (await refused.json()) as { error: string; message: string }
		expect(body.error).toBe('too-large')
		expect(body.message).toMatch(/^This page’s content is 12\d\d KB, and the limit is 950 KB\./)
		// Under it, a draft is saved and published as before.
		expect((await api(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...page.draft, translations: { ja: words(200) } } })).status).toBe(200)
		await publish(page.id)
	})

	const link = (n: number, slug = '') => ({ id: `rm-item-${n}`, kind: 'link', title: `Link number ${n}`, subtitle: '', url: `https://example.com/${n}`, slug, icon: 'auto', featured: false, hidden: false, startsAt: null, endsAt: null })
	const store = (id: string, draft: unknown) => env.DB.prepare('UPDATE pages SET draft = ?1, draft_updated_at = draft_updated_at + 1 WHERE id = ?2').bind(JSON.stringify(draft), id).run()

	it('is refused at publishing too, where a draft that large was saved before there was a limit', async () => {
		const page = await made('rm-large-before')
		// Translations of what is on the page, which publishing keeps: four languages of a hundred titles.
		const items = Array.from({ length: 100 }, (_, n) => link(n))
		const titles = Object.fromEntries(items.map((item) => [item.title, '長'.repeat(1000)]))
		const draft = { ...page.draft, items, translations: { ja: titles, ko: titles, th: titles, vi: titles } }
		expect(new TextEncoder().encode(JSON.stringify(draft)).byteLength).toBeGreaterThan(CONTENT_BYTES_LIMIT)
		await store(page.id, draft)
		const refused = await api(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(refused.status).toBe(413)
		expect(((await refused.json()) as { error: string }).error).toBe('too-large')
		await store(page.id, page.draft)
	})

	it('is measured as it will be stored: translations of texts no longer on the page are gone by then', async () => {
		const page = await made('rm-large-stale')
		await store(page.id, { ...page.draft, translations: { ja: words(400) } })
		await publish(page.id)
		const { page: now } = await apiJson<{ page: { published: { translations?: unknown } } }>(`/pages/${page.id}`)
		expect(now.published.translations).toBeUndefined()
	})

	it('is not taken past the limit by a longer short address either', async () => {
		const page = await made('rm-large-slug')
		// As near the limit as a draft can be: translations pad it out to a few bytes short.
		const base = { ...page.draft, items: [link(1, 'rm-s')] }
		const room = CONTENT_BYTES_LIMIT - new TextEncoder().encode(JSON.stringify({ ...base, translations: { ja: {} } })).byteLength - 10
		const each = 1000 + '"text 0000":"",'.length
		const padding = Object.fromEntries(Array.from({ length: Math.ceil(room / each) }, (_, n) => [`text ${String(n).padStart(4, '0')}`, 'a'.repeat(n === 0 ? room - (Math.ceil(room / each) - 1) * each - '"text 0000":""'.length : 1000)]))
		const draft = { ...base, translations: { ja: padding } }
		const size = new TextEncoder().encode(JSON.stringify(draft)).byteLength
		expect(size).toBeLessThanOrEqual(CONTENT_BYTES_LIMIT)
		expect(size).toBeGreaterThan(CONTENT_BYTES_LIMIT - 20)
		expect((await api(`/pages/${page.id}/draft`, { method: 'PUT', json: draft })).status).toBe(200)
		const longer = await api(`/pages/${page.id}/links/rm-item-1/short`, { method: 'PUT', json: { slug: 'rm-a-short-address-forty-characters-long' } })
		expect(longer.status).toBe(413)
		// The draft is as it was, and can still be saved.
		expect((await api(`/pages/${page.id}/draft`, { method: 'PUT', json: draft })).status).toBe(200)
		await store(page.id, page.draft)
	})

	it('is held to the row in a backup: draft and published together, so a site’s own backup goes back in', async () => {
		const backup = await apiJson<Backup>('/export')
		const before = backup.pages.length
		const target = backup.pages.find((entry) => entry.published)!
		const kept = { draft: target.draft, published: target.published }
		// A large draft from before there was a limit, beside something small that is published: as it was exported.
		Object.assign(target, { draft: { ...target.draft, translations: { ja: words(330) } } })
		expect(new TextEncoder().encode(JSON.stringify(target.draft)).byteLength).toBeGreaterThan(CONTENT_BYTES_LIMIT)
		expect((await api('/import', { method: 'POST', json: backup })).status).toBe(200)
		// Both that large could never have been one row: refused, before anything is replaced.
		const items = Array.from({ length: 100 }, (_, n) => link(n + 200))
		const titles = Object.fromEntries(items.map((item) => [item.title, '長'.repeat(1000)]))
		const large = { items, translations: { ja: titles, ko: titles, th: titles, vi: titles } }
		Object.assign(target, { draft: { ...kept.draft, ...large }, published: { ...kept.published, ...large } })
		const refused = await api('/import', { method: 'POST', json: backup })
		expect(refused.status).toBe(413)
		expect(((await refused.json()) as { message: string }).message).toMatch(/and the limit is 1900 KB\./)
		expect((await apiJson<StateResponse>('/state')).pages).toHaveLength(before)
		Object.assign(target, kept)
		expect((await api('/import', { method: 'POST', json: backup })).status).toBe(200)
	})
})

describe('"/" with no home page', () => {
	const offered = async () => {
		const response = await visit('/')
		return { status: response.status, html: await response.text() }
	}

	it('offers the pages that are published now: not one that was deleted or moved, and one just published', async () => {
		for (const { id } of (await apiJson<StateResponse>('/state')).pages.slice(1)) await api(`/pages/${id}`, { method: 'DELETE' })
		expect((await api('/settings', { method: 'PUT', json: { home: '' } })).status).toBe(200)
		const [first] = (await apiJson<StateResponse>('/state')).pages
		// Nothing published and no home page: "/" says so. The first page published is then offered there.
		const a = await made('rm-offered-a')
		await publish(a.id)
		expect((await offered()).html).toContain('href="/rm-offered-a"')
		const b = await made('rm-offered-b')
		await publish(b.id)
		expect((await offered()).html).toContain('href="/rm-offered-b"')
		// Moved: offered at its new address, and not at the old one, which is nothing now.
		expect((await api(`/pages/${b.id}`, { method: 'PATCH', json: { handle: 'rm-offered-c' } })).status).toBe(200)
		let now = (await offered()).html
		expect(now).toContain('href="/rm-offered-c"')
		expect(now).not.toContain('rm-offered-b')
		// Deleted: not offered.
		expect((await api(`/pages/${a.id}`, { method: 'DELETE' })).status).toBe(200)
		now = (await offered()).html
		expect(now).not.toContain('rm-offered-a')
		expect(now).toContain('href="/rm-offered-c"')
		expect(first).toBeTruthy()
	})

	it('offers a page that comes before the ten it lists, once that one is published', async () => {
		for (const { id } of (await apiJson<StateResponse>('/state')).pages.slice(1)) await api(`/pages/${id}`, { method: 'DELETE' })
		expect((await api('/settings', { method: 'PUT', json: { home: '' } })).status).toBe(200)
		const early = await made('rm-early')
		for (let n = 0; n < 10; n++) await publish((await made(`rm-later-${n}`)).id)
		expect((await offered()).html).not.toContain('rm-early')
		await publish(early.id)
		expect((await offered()).html).toContain('href="/rm-early"')
	}, 30_000)

	it('writes nothing where there is a home page: the list is shown to nobody, and looking costs one KV read', async () => {
		const home = await made('rm-home')
		await publish(home.id)
		expect((await api('/settings', { method: 'PUT', json: { home: home.id } })).status).toBe(200)
		let written = 0
		const put = vi.spyOn(env.KV, 'put')
		const other = await made('rm-not-home')
		put.mockClear()
		await publish(other.id)
		written = put.mock.calls.filter(([key]) => key === SITE_KEY).length
		put.mockRestore()
		expect(written).toBe(0)
	})
})

describe('a settings change that D1 has and KV refused', () => {
	const noted = async () => (await env.DB.prepare("SELECT value FROM _meta WHERE key = 'copies-owed'").first<{ value: string }>())?.value ?? null
	const full = (): Env => {
		const KV = new Proxy(env.KV, {
			get(target, key) {
				if (key === 'put' || key === 'delete') return () => Promise.reject(new Error('KV failed: 429 Too Many Requests'))
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		return { ...env, KV } as Env
	}

	it('is sent when the dashboard is next opened, without anyone saving again', async () => {
		await api('/settings', { method: 'PUT', json: { timezone: 'UTC' } })
		await expect(updateSettings(full(), { timezone: 'Asia/Taipei' })).rejects.toMatchObject({ status: 503 })
		expect(JSON.parse((await env.KV.get(SITE_KEY))!).timezone).toBe('UTC')
		expect(await noted()).not.toBeNull()
		// The setup wizard goes on past this error, and the dashboard it opens reads the state.
		expect((await apiJson<StateResponse>('/state')).settings.timezone).toBe('Asia/Taipei')
		expect(JSON.parse((await env.KV.get(SITE_KEY))!).timezone).toBe('Asia/Taipei')
		expect(await noted()).toBeNull()
	})

	it('is left to settings calls where it is the pages of a large site, a slice of them at a time', async () => {
		await env.DB.prepare("INSERT INTO _meta (key, value) VALUES ('copies-owed', ?1)").bind(JSON.stringify({ site: true, pages: [], after: '' })).run()
		const del = vi.spyOn(env.KV, 'delete')
		await apiJson<StateResponse>('/state')
		expect(del).not.toHaveBeenCalled()
		del.mockRestore()
		expect(await noted()).not.toBeNull()
		expect((await api('/settings', { method: 'PUT', json: {} })).status).toBe(200)
		expect(await noted()).toBeNull()
	})

	it('is sent without the settings being saved again: a row that can’t be read is left as it is', async () => {
		const row = async () => (await env.DB.prepare("SELECT value FROM _meta WHERE key = 'settings'").first<{ value: string }>())!.value
		const good = await row()
		// A settings row from a newer version, say, with a language this one doesn't know. Reading the state must not
		// put the defaults in its place, time zone and all.
		const unknown = JSON.stringify({ ...JSON.parse(good), locale: 'tlh', timezone: 'Asia/Taipei' })
		await env.DB.batch([
			env.DB.prepare("UPDATE _meta SET value = ?1 WHERE key = 'settings'").bind(unknown),
			env.DB.prepare("INSERT INTO _meta (key, value) VALUES ('copies-owed', ?1)").bind(JSON.stringify({ site: true, pages: [], after: null })),
		])
		try {
			expect((await api('/state')).status).toBe(200)
			expect(await row()).toBe(unknown)
			expect(await noted()).toBeNull()
		} finally {
			await env.DB.prepare("UPDATE _meta SET value = ?1 WHERE key = 'settings'").bind(good).run()
		}
	})

	it('is not tried at every look where it can’t be sent: a page’s copy while pages are off', async () => {
		expect((await api('/settings', { method: 'PUT', json: { bio: false } })).status).toBe(200)
		try {
			await env.DB.prepare("INSERT INTO _meta (key, value) VALUES ('copies-owed', ?1)").bind(JSON.stringify({ site: false, pages: ['some-page'], after: null })).run()
			expect((await settingsAndOwed(env.DB)).owed).toBe(false)
			await api('/state')
			expect(await noted()).not.toBeNull()
		} finally {
			// With pages on again it is something to send.
			await env.DB.prepare("UPDATE _meta SET value = json_set(value, '$.bio', json('true')) WHERE key = 'settings'").run()
			expect((await settingsAndOwed(env.DB)).owed).toBe(true)
			await env.DB.prepare("DELETE FROM _meta WHERE key = 'copies-owed'").run()
			await api('/settings', { method: 'PUT', json: { bio: true } })
		}
	})
})
