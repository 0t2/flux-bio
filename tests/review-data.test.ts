import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { StateResponse } from '../src/shared/api'
import { NAME_PREFIX, SITE_KEY } from '../src/worker/lib/cache'
import type { Backup } from '../src/shared/backup'
import { importData } from '../src/worker/lib/backup'
import { migrate, SCHEMA_VERSION } from '../src/worker/lib/db'
import { deletePage, linkRecordFromDb, publishPage, renamePage, setPageLinkSlug, siteFromDb, snapshotFromDb, updateLink, updateSettings } from '../src/worker/lib/ops'
import { api, apiJson, visit } from './helpers'

// What a review of how data is kept found (2026-11-20): ways an owner's change could be undone, or never reach
// visitors, when two things happen at once or a write fails halfway.

type Statement = D1PreparedStatement
/**
 * The same bindings, with something made to happen at the moment D1 is first written to: where a visit, or another
 * request, falls between a change's first step and its last.
 */
function meanwhile(during: () => Promise<unknown>): Env {
	let armed = true
	const real = new WeakMap<object, Statement>()
	const fire = async () => {
		if (!armed) return
		armed = false
		await during()
	}
	const wrap = (statement: Statement): Statement => {
		const proxy = new Proxy(statement, {
			get(target, key) {
				if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
				if (key === 'run') return async () => (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql.get(target) ?? '') ? (await fire(), target.run()) : target.run())
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		real.set(proxy, statement)
		return proxy
	}
	const sql = new WeakMap<object, string>()
	const DB = new Proxy(env.DB, {
		get(target, key) {
			if (key === 'prepare') {
				return (text: string) => {
					const statement = target.prepare(text)
					sql.set(statement, text)
					const bound = statement.bind.bind(statement)
					// A bound statement is another object: it keeps its SQL too.
					statement.bind = (...values: unknown[]) => {
						const next = bound(...values)
						sql.set(next, text)
						return next
					}
					return wrap(statement)
				}
			}
			if (key === 'batch') {
				return async (statements: Statement[]) => {
					const plain = statements.map((statement) => real.get(statement) ?? statement)
					if (plain.some((statement) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql.get(statement) ?? ''))) await fire()
					return target.batch(plain)
				}
			}
			const value = Reflect.get(target, key)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	return { ...env, DB } as Env
}

const link = (id: string, slug: string, url: string) => ({ id, kind: 'link', title: id, subtitle: '', url, slug, icon: 'auto', featured: false, hidden: false, startsAt: null, endsAt: null })
async function page(handle: string, items: object[] = []) {
	const { page } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle, name: handle } })
	const { page: full } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${page.id}`)
	await api(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...full.draft, items } })
	const published = await api(`/pages/${page.id}/publish`, { method: 'POST' })
	expect(published.status, await published.clone().text()).toBe(200)
	return page.id
}
const status = async (path: string) => (await visit(path)).status
const draft = async (id: string, items: object[]) => {
	const { page: full } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${id}`)
	expect((await api(`/pages/${id}/draft`, { method: 'PUT', json: { ...full.draft, items } })).status).toBe(200)
}
/** The same bindings, with KV doing something of ours in place of, or just before, one of its operations. */
function kv(change: Partial<Record<'put' | 'delete', (real: () => Promise<unknown>, key: string) => Promise<unknown>>>): Env {
	const KV = new Proxy(env.KV, {
		get(target, key) {
			const ours = change[key as 'put' | 'delete']
			const value = Reflect.get(target, key) as unknown
			if (ours && typeof value === 'function') return (...args: unknown[]) => ours(() => (value as (...all: unknown[]) => Promise<unknown>).apply(target, args), String(args[0]))
			return typeof value === 'function' ? (value as (...all: unknown[]) => unknown).bind(target) : value
		},
	})
	return { ...env, KV } as Env
}
/** KV as it is when the day's free writes are used up. */
const full = () => kv({ put: () => Promise.reject(new Error('KV PUT failed: 429 Too Many Requests')), delete: () => Promise.reject(new Error('KV DELETE failed: 429 Too Many Requests')) })
/** Something done once, the first time KV is about to take a copy of one name: a change that lands between a visit's read and its write. */
function justBefore(name: string, change: () => Promise<unknown>): Env {
	let waiting = true
	return kv({
		put: async (real, key) => {
			if (waiting && key === name) {
				waiting = false
				await change()
			}
			return real()
		},
	})
}

describe('a visit that falls in the middle of a change', () => {
	it('doesn’t bring an archived short link back', async () => {
		const { link: made } = await apiJson<{ link: { id: string } }>('/links', { method: 'POST', json: { url: 'https://example.com/campaign', slug: 'rd-campaign' } })
		expect(await status('/rd-campaign')).toBe(302)
		// The visitor arrives after the copy is gone and before D1 says archived: they are sent on, and put the copy back.
		let seen = 0
		await updateLink(meanwhile(async () => (seen = await status('/rd-campaign'))), made.id, { status: 'archived' })
		expect(seen).toBe(302)
		expect(await status('/rd-campaign')).toBe(404)
		expect(await env.KV.get(`${NAME_PREFIX}rd-campaign`)).toBeNull()
	})

	it('doesn’t leave a deleted page, or its links, public', async () => {
		await page('rd-keeps')
		const id = await page('rd-goes', [link('rd-menu-1', 'rd-menu', 'https://example.com/menu')])
		expect(await status('/rd-goes')).toBe(200)
		await deletePage(meanwhile(async () => Promise.all([status('/rd-goes'), status('/rd-menu')])), id)
		expect(await status('/rd-goes')).toBe(404)
		expect(await status('/rd-menu')).toBe(404)
	})

	it('doesn’t keep a copy that was already out of date when it was written', async () => {
		// The other half: a visit that read D1 before a change and writes its copy after the change's last delete.
		await apiJson('/links', { method: 'POST', json: { url: 'https://example.com/late', slug: 'rd-late' } })
		await env.KV.delete(`${NAME_PREFIX}rd-late`)
		const KV = new Proxy(env.KV, {
			get(target, key) {
				if (key === 'put') {
					return async (...args: Parameters<KVNamespace['put']>) => {
						await env.DB.prepare("UPDATE links SET status = 'archived', updated_at = updated_at + 1 WHERE slug = 'rd-late'").run()
						return target.put(...args)
					}
				}
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		await linkRecordFromDb({ ...env, KV } as Env, 'rd-late')
		expect(await env.KV.get(`${NAME_PREFIX}rd-late`)).toBeNull()
		expect(await status('/rd-late')).toBe(404)
	})
})

describe('a visit that falls in the middle of other changes', () => {
	it('doesn’t leave a link that was taken off a page redirecting', async () => {
		const id = await page('rd-shelf', [link('rd-old-1', 'rd-old', 'https://example.com/old'), link('rd-new-1', 'rd-new', 'https://example.com/new')])
		await draft(id, [link('rd-new-1', 'rd-new', 'https://example.com/new')])
		let seen = 0
		await publishPage(meanwhile(async () => (seen = await status('/rd-old'))), id)
		expect(seen).toBe(302)
		expect(await status('/rd-old')).not.toBe(302)
	})

	it('doesn’t leave a page at the address it moved away from', async () => {
		const id = await page('rd-before')
		let seen = 0
		await renamePage(meanwhile(async () => (seen = await status('/rd-before'))), id, 'rd-after')
		expect(seen).toBe(200)
		expect(await status('/rd-before')).not.toBe(200)
		expect(await status('/rd-after')).toBe(200)
	})

	it('doesn’t leave a link’s old short address redirecting when it is given another', async () => {
		const id = await page('rd-renames', [link('rd-slug-1', 'rd-first', 'https://example.com/first')])
		let seen = 0
		await setPageLinkSlug(meanwhile(async () => (seen = await status('/rd-first'))), id, 'rd-slug-1', { slug: 'rd-second' })
		expect(seen).toBe(302)
		expect(await status('/rd-first')).toBe(404)
		expect(await status('/rd-second')).toBe(302)
	})

	it('doesn’t leave a page or a link public that a backup brought in doesn’t have', async () => {
		const backup = await apiJson<Backup>('/export')
		await page('rd-not-in-backup', [link('rd-extra-1', 'rd-extra', 'https://example.com/extra')])
		let seen: number[] = []
		await importData(meanwhile(async () => (seen = await Promise.all([status('/rd-not-in-backup'), status('/rd-extra')]))), backup)
		expect(seen).toEqual([200, 302])
		expect(await status('/rd-not-in-backup')).toBe(404)
		expect(await status('/rd-extra')).toBe(404)
	})

	it('doesn’t leave a link’s address on its page when the link is given a password meanwhile', async () => {
		await page('rd-open-page', [link('rd-door-1', 'rd-door', 'https://example.com/members-only')])
		await env.KV.delete(`${NAME_PREFIX}rd-open-page`)
		// A page's copy says which links go through their short link. The visit read that none does; the password
		// arrives before the visit's copy does.
		const copy = await snapshotFromDb(
			justBefore(`${NAME_PREFIX}rd-open-page`, async () => expect((await api('/links/rd-door-1', { method: 'PATCH', json: { password: 'members' } })).status).toBe(200)),
			'rd-open-page',
		)
		expect(copy?.viaShortLink).toEqual([])
		const html = await (await visit('/rd-open-page')).text()
		expect(html).toContain('rd-door-1')
		expect(html).not.toContain('members-only')
	})

	it('doesn’t leave a page public when pages are switched off meanwhile', async () => {
		await page('rd-switched')
		await env.KV.delete(`${NAME_PREFIX}rd-switched`)
		try {
			await snapshotFromDb(justBefore(`${NAME_PREFIX}rd-switched`, async () => expect((await api('/settings', { method: 'PUT', json: { bio: false } })).status).toBe(200)), 'rd-switched')
			expect(await status('/rd-switched')).toBe(404)
		} finally {
			await api('/settings', { method: 'PUT', json: { bio: true } })
		}
	})

	it('doesn’t leave the home page at "/" as it was before it was published again', async () => {
		const id = await page('rd-front', [link('rd-front-1', 'rd-front-old', 'https://example.com/front-old')])
		expect((await api('/settings', { method: 'PUT', json: { home: id } })).status).toBe(200)
		await env.KV.delete(SITE_KEY)
		await siteFromDb(
			justBefore(SITE_KEY, async () => {
				await draft(id, [link('rd-front-2', 'rd-front-new', 'https://example.com/front-new')])
				expect((await api(`/pages/${id}/publish`, { method: 'POST' })).status).toBe(200)
			}),
		)
		const home = await (await visit('/')).text()
		expect(home).toContain('rd-front-2')
		expect(home).not.toContain('rd-front-1')
	})

	it('doesn’t leave a deleted page at "/" when it was made the home page while it was being deleted', async () => {
		await page('rd-other-home')
		const id = await page('rd-last-minute', [link('rd-minute-1', 'rd-minute', 'https://example.com/minute')])
		await deletePage(meanwhile(async () => expect((await api('/settings', { method: 'PUT', json: { home: id } })).status).toBe(200)), id)
		expect(await (await visit('/')).text()).not.toContain('rd-minute-1')
	})
})

describe('a backup that has a link archived', () => {
	it('stops it redirecting when the backup is brought in', async () => {
		await apiJson('/links', { method: 'POST', json: { url: 'https://example.com/promo', slug: 'rd-promo' } })
		expect(await status('/rd-promo')).toBe(302)
		const backup = await apiJson<{ shortLinks: { slug: string; status: string }[] }>('/export')
		backup.shortLinks.find((row) => row.slug === 'rd-promo')!.status = 'archived'
		expect((await api('/import', { method: 'POST', json: backup })).status).toBe(200)
		expect(await status('/rd-promo')).toBe(404)
	})
})

describe('settings', () => {
	const settings = async () => (await apiJson<StateResponse>('/state')).settings
	const owedNoted = async () => Boolean(await env.DB.prepare("SELECT 1 FROM _meta WHERE key = 'copies-owed'").first())

	it('keep a change someone else saved while a page was being deleted', async () => {
		await page('rd-stays')
		const id = await page('rd-leaves')
		await api('/settings', { method: 'PUT', json: { timezone: 'UTC' } })
		await deletePage(meanwhile(async () => expect((await api('/settings', { method: 'PUT', json: { timezone: 'Asia/Taipei' } })).status).toBe(200)), id)
		expect((await settings()).timezone).toBe('Asia/Taipei')
	})

	it('keep both of two changes to different fields sent at once', async () => {
		await api('/settings', { method: 'PUT', json: { timezone: 'UTC', plan: 'free' } })
		const answers = await Promise.all([api('/settings', { method: 'PUT', json: { timezone: 'Asia/Tokyo' } }), api('/settings', { method: 'PUT', json: { plan: 'paid' } })])
		expect(answers.map((answer) => answer.status)).toEqual([200, 200])
		expect(await settings()).toMatchObject({ timezone: 'Asia/Tokyo', plan: 'paid' })
		await api('/settings', { method: 'PUT', json: { plan: 'free' } })
	})

	it('reach visitors when the same change is sent again after KV refused the first time', async () => {
		const [first, second] = [await page('rd-home-a', [link('rd-a-1', 'rd-a', 'https://example.com/a')]), await page('rd-home-b', [link('rd-b-1', 'rd-b', 'https://example.com/b')])]
		expect((await api('/settings', { method: 'PUT', json: { home: first } })).status).toBe(200)
		expect(await (await visit('/')).text()).toContain('rd-a-1')
		// The day's KV writes are used up: D1 takes the new home page, and KV takes nothing.
		const KV = new Proxy(env.KV, {
			get(target, key) {
				if (key === 'put') return async () => Promise.reject(new Error('KV PUT failed: 429 Too Many Requests'))
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		// The change is saved, and the answer says visitors don't have it yet.
		await expect(updateSettings({ ...env, KV } as Env, { home: second })).rejects.toMatchObject({ status: 503, code: 'kv' })
		expect((await settings()).home).toBe(second)
		expect(await (await visit('/')).text()).toContain('rd-a-1')
		// The next day the owner's AI says the same thing again. D1 already has it, and KV still has to be told.
		const again = await apiJson<{ copiesLeft?: true }>('/settings', { method: 'PUT', json: { home: second } })
		expect(again.copiesLeft).toBeUndefined()
		const home = await (await visit('/')).text()
		expect(home).toContain('rd-b-1')
		expect(home).not.toContain('rd-a-1')
		expect(JSON.parse((await env.KV.get(SITE_KEY))!).home).toBe('rd-home-b')
	})

	it('are sent to visitors by any later change, when KV took nothing at all the first time', async () => {
		const id = await page('rd-languages')
		expect(await status('/rd-languages')).toBe(200)
		const before = await env.KV.get(`${NAME_PREFIX}rd-languages`)
		expect(JSON.parse(before!).page.languages).toEqual([])
		try {
			// What is owed is noted before KV is asked for anything: a request that ends there has still left the note.
			const notes: boolean[] = []
			const noted = async () => void notes.push(Boolean(await env.DB.prepare("SELECT 1 FROM _meta WHERE key = 'copies-owed'").first()))
			const refusing = kv({
				put: async () => (await noted(), Promise.reject(new Error('KV PUT failed: 429 Too Many Requests'))),
				delete: async () => (await noted(), Promise.reject(new Error('KV DELETE failed: 429 Too Many Requests'))),
			})
			await expect(updateSettings(refusing, { languages: ['ja'] })).rejects.toMatchObject({ status: 503, code: 'kv' })
			expect(notes.length).toBeGreaterThan(0)
			expect(notes).not.toContain(false)
			expect(JSON.parse((await env.KV.get(`${NAME_PREFIX}rd-languages`))!).page.languages).toEqual([])
			// Something else altogether is changed the day after: what is still owed goes with it.
			expect((await apiJson<{ copiesLeft?: true }>('/settings', { method: 'PUT', json: { plan: 'free' } })).copiesLeft).toBeUndefined()
			expect(await env.KV.get(`${NAME_PREFIX}rd-languages`)).toBeNull()
			expect(JSON.parse((await env.KV.get(SITE_KEY))!).languages).toEqual(['ja'])
			// And then nothing is owed: a change that needs no KV uses none.
			let operations = 0
			const counting = kv({ put: (real) => (operations++, real()), delete: (real) => (operations++, real()) })
			await updateSettings(counting, { plan: 'free' })
			expect(operations).toBe(0)
		} finally {
			await api('/settings', { method: 'PUT', json: { languages: [] } })
		}
		expect(id).toBeTruthy()
	})

	it('go back, all that the request changed, when switching pages off is refused by KV', async () => {
		await api('/settings', { method: 'PUT', json: { timezone: 'UTC', bio: true } })
		const was = await settings()
		// The setup wizard sends the switch with the time zone and the language. The answer says nothing was saved.
		await expect(updateSettings(full(), { bio: false, timezone: 'Asia/Tokyo', locale: was.locale === 'ja' ? 'ko' : 'ja' })).rejects.toMatchObject({ status: 503 })
		expect(await settings()).toMatchObject({ bio: true, timezone: 'UTC', locale: was.locale })
		// KV may hold half of it, and that is noted: the next change of any kind puts the record right, and the note goes.
		expect(await owedNoted()).toBe(true)
		expect((await api('/settings', { method: 'PUT', json: {} })).status).toBe(200)
		expect(await owedNoted()).toBe(false)
		expect(JSON.parse((await env.KV.get(SITE_KEY))!)).toMatchObject({ bio: true, timezone: 'UTC' })
	})

	it('keep a language that isn’t the page’s own among the others, when a refused switch puts the page’s language back', async () => {
		await api('/settings', { method: 'PUT', json: { bio: true, locale: 'en', languages: [] } })
		try {
			// Pages off and Japanese as the page language, refused; English and Korean saved as the others meanwhile.
			let saved = false
			const refusing = kv({
				put: async () => {
					if (!saved) await env.DB.prepare("UPDATE _meta SET value = json_set(value, '$.languages', json('[\"en\",\"ko\"]')) WHERE key = 'settings'").run()
					saved = true
					throw new Error('KV PUT failed: 429 Too Many Requests')
				},
				delete: () => Promise.reject(new Error('KV DELETE failed: 429 Too Many Requests')),
			})
			await expect(updateSettings(refusing, { bio: false, locale: 'ja' })).rejects.toMatchObject({ status: 503 })
			expect(await settings()).toMatchObject({ bio: true, locale: 'en', languages: ['ko'] })
		} finally {
			await api('/settings', { method: 'PUT', json: { languages: [] } })
		}
	})

	it('are not changed at all when what the change will owe visitors can’t be noted first', async () => {
		const [first, second] = [await page('rd-noted-a'), await page('rd-noted-b')]
		expect((await api('/settings', { method: 'PUT', json: { home: first } })).status).toBe(200)
		// D1 fails once, at the note. Had the settings been saved before it, the home page would be changed in D1 with
		// nothing to say KV still has the old one, and sending the request again would find nothing to do.
		let failed = false
		const DB = new Proxy(env.DB, {
			get(target, key) {
				if (key === 'prepare') {
					return (text: string) => {
						if (failed || !/INTO _meta/.test(text) || !/INSERT OR IGNORE/.test(text)) return target.prepare(text)
						failed = true
						return { bind: () => ({ run: () => Promise.reject(new Error('D1_ERROR: storage operation exceeded timeout')) }) }
					}
				}
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		await expect(updateSettings({ ...env, DB } as Env, { home: second })).rejects.toThrow('D1_ERROR')
		expect(failed).toBe(true)
		expect((await settings()).home).toBe(first)
		expect((await api('/settings', { method: 'PUT', json: { home: second } })).status).toBe(200)
		expect(JSON.parse((await env.KV.get(SITE_KEY))!).home).toBe('rd-noted-b')
	})

	it('note what a change owes when it turns out to owe more than it looked to, before KV is asked', async () => {
		await page('rd-turned-out')
		await api('/settings', { method: 'PUT', json: { languages: ['ja'] } })
		try {
			// Japanese is asked for and is already on, so nothing looks owed. Someone takes it off in between, so
			// this request does put it on, and every page's copy is owed after all.
			let changed = false
			const DB = new Proxy(env.DB, {
				get(target, key) {
					if (key === 'prepare') {
						return (text: string) => {
							const statement = target.prepare(text)
							if (changed || text !== "SELECT value FROM _meta WHERE key = 'settings'") return statement
							changed = true
							const first = statement.first.bind(statement)
							statement.first = (async (...args: []) => {
								await env.DB.prepare("UPDATE _meta SET value = json_set(value, '$.languages', json('[]')) WHERE key = 'settings'").run()
								return first(...args)
							}) as typeof statement.first
							return statement
						}
					}
					const value = Reflect.get(target, key)
					return typeof value === 'function' ? value.bind(target) : value
				},
			})
			const notes: boolean[] = []
			const refusing = kv({
				put: async () => (notes.push(await owedNoted()), Promise.reject(new Error('KV PUT failed: 429 Too Many Requests'))),
				delete: async () => (notes.push(await owedNoted()), Promise.reject(new Error('KV DELETE failed: 429 Too Many Requests'))),
			})
			await expect(updateSettings({ ...refusing, DB } as Env, { languages: ['ja'] })).rejects.toMatchObject({ status: 503 })
			expect(changed).toBe(true)
			expect(notes.length).toBeGreaterThan(0)
			expect(notes).not.toContain(false)
		} finally {
			await api('/settings', { method: 'PUT', json: { languages: [] } })
		}
	})

	it('keep what each of two changes at once owes visitors', async () => {
		await page('rd-two-at-once')
		expect(await status('/rd-two-at-once')).toBe(200)
		await api('/settings', { method: 'PUT', json: { timezone: 'UTC', languages: [] } })
		try {
			// A time zone is on its way to KV when another language is saved and KV refuses that one. The first then
			// finishes, with nothing left of its own to do: it must not clear what the second noted.
			const first = justBefore(SITE_KEY, () => expect(updateSettings(full(), { languages: ['ko'] })).rejects.toMatchObject({ status: 503 }))
			await updateSettings(first, { timezone: 'Asia/Seoul' })
			expect(await owedNoted()).toBe(true)
			expect((await api('/settings', { method: 'PUT', json: {} })).status).toBe(200)
			expect(await owedNoted()).toBe(false)
			expect(JSON.parse((await env.KV.get(SITE_KEY))!)).toMatchObject({ timezone: 'Asia/Seoul', languages: ['ko'] })
			expect(await env.KV.get(`${NAME_PREFIX}rd-two-at-once`)).toBeNull()
		} finally {
			await api('/settings', { method: 'PUT', json: { timezone: 'UTC', languages: [] } })
		}
	})
})

describe('two items with one id', () => {
	it('are not published: one of their short links would answer 404, and its clicks count as the other’s', async () => {
		const { page: made } = await apiJson<{ page: { id: string } }>('/pages', { method: 'POST', json: { handle: 'rd-twins', name: 'x' } })
		const { page: full } = await apiJson<{ page: { draft: Record<string, unknown> } }>(`/pages/${made.id}`)
		await api(`/pages/${made.id}/draft`, { method: 'PUT', json: { ...full.draft, items: [link('rd-same-1', 'rd-twin-a', 'https://example.com/a'), link('rd-same-1', 'rd-twin-b', 'https://example.com/b')] } })
		const refused = await api(`/pages/${made.id}/publish`, { method: 'POST' })
		expect(refused.status).toBe(400)
		const body = (await refused.json()) as { problems: { path: string; message: string }[] }
		expect(body.problems).toEqual([expect.objectContaining({ path: 'items.1.id', message: 'Items 1 and 2 have the same id: change one of them' })])
	})
})

describe('a site’s own backup', () => {
	it('goes back in when a page in it was published with two items of one id, before that was refused', async () => {
		await page('rd-old-twins', [link('rd-twin-1', 'rd-twin-one', 'https://example.com/one')])
		const backup = await apiJson<Backup>('/export')
		const twins = backup.pages.find((entry) => entry.handle === 'rd-old-twins')!
		const items = [link('rd-twin-1', 'rd-twin-one', 'https://example.com/one'), link('rd-twin-1', 'rd-twin-two', 'https://example.com/two')]
		Object.assign(twins, { draft: { ...twins.draft, items }, published: { ...twins.published, items } })
		const answer = await api('/import', { method: 'POST', json: backup })
		expect(answer.status, await answer.clone().text()).toBe(200)
		expect(await status('/rd-old-twins')).toBe(200)
	})
})

describe('bringing a database up to date', () => {
	const next = [['CREATE TABLE IF NOT EXISTS rd_extra (n INTEGER NOT NULL)', 'INSERT INTO rd_extra (n) VALUES (1)']]
	const baseline = [['CREATE TABLE IF NOT EXISTS rd_base (n INTEGER)']]
	const reset = async (meta: Record<string, string>) => {
		await env.DB.batch([
			env.DB.prepare('DROP TABLE IF EXISTS rd_extra'),
			env.DB.prepare("DELETE FROM _meta WHERE key IN ('schema', 'schema_version')"),
			...Object.entries(meta).map(([key, value]) => env.DB.prepare('INSERT INTO _meta (key, value) VALUES (?1, ?2)').bind(key, value)),
		])
	}
	const schema = async () => (await env.DB.prepare("SELECT value FROM _meta WHERE key = 'schema'").first<{ value: string }>())?.value
	const rows = async () => (await env.DB.prepare('SELECT count(*) AS n FROM rd_extra').first<{ n: number }>())!.n
	const restore = () => reset({ schema: String(SCHEMA_VERSION) })

	it('runs what is new on a database from before the migrations were made into one, which says 10', async () => {
		try {
			await reset({ schema_version: '10' })
			await migrate(env.DB, [...baseline, ...next])
			expect(await rows()).toBe(1)
			expect(await schema()).toBe('2')
			// And on one made since, which says 1 for the same tables.
			await reset({ schema_version: '1' })
			await migrate(env.DB, [...baseline, ...next])
			expect(await rows()).toBe(1)
			// One that needs nothing run says where it is under the new name, once, and is then left alone.
			await reset({ schema_version: '10' })
			await migrate(env.DB, baseline)
			expect(await schema()).toBe('1')
		} finally {
			await restore()
		}
	})

	it('runs a migration once when two copies of the Worker both find it to run', async () => {
		try {
			await reset({ schema: '1' })
			await Promise.all([migrate(env.DB, [...baseline, ...next]), migrate(env.DB, [...baseline, ...next]), migrate(env.DB, [...baseline, ...next])])
			expect(await rows()).toBe(1)
			expect(await schema()).toBe('2')
		} finally {
			await restore()
		}
	})
})
