import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { daySalt, EVENT_FIELDS, eventBlobs } from '../src/worker/lib/analytics'
import { NAME_PREFIX } from '../src/worker/lib/cache'
import { ensureSchema, loadSettings } from '../src/worker/lib/db'
import { publishPage, renamePage } from '../src/worker/lib/ops'
import { clearStats, exportStats, tidyStats } from '../src/worker/lib/statsHistory'
import { addMonths, dayIn } from '../src/shared/time'
import { api, apiJson, visit } from './helpers'

// The last of what two reviews found (2026-11-20): four things that go wrong only when two things happen at once,
// or that only the owner could have turned against a visitor.

/** The same bindings, with something made to happen once, just before D1 is first written to in a batch. */
function meanwhile(during: () => Promise<unknown>): Env {
	let armed = true
	const DB = new Proxy(env.DB, {
		get(target, key) {
			if (key === 'batch') {
				return async (statements: D1PreparedStatement[]) => {
					if (armed) {
						armed = false
						await during()
					}
					return target.batch(statements)
				}
			}
			const value = Reflect.get(target, key)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	return { ...env, DB } as Env
}

const link = (id: string, slug: string, url: string) => ({ id, kind: 'link', title: id, subtitle: '', url, slug, icon: 'auto', featured: false, hidden: false, startsAt: null, endsAt: null })
type Page = { id: string; draft: Record<string, unknown>; draftUpdatedAt: number }
const read = async (id: string) => (await apiJson<{ page: Page }>(`/pages/${id}`)).page
const save = async (id: string, change: Record<string, unknown>) => {
	const page = await read(id)
	const saved = await api(`/pages/${id}/draft`, { method: 'PUT', json: { ...page.draft, ...change } })
	expect(saved.status, await saved.clone().text()).toBe(200)
}
async function made(handle: string, items: object[] = []) {
	const { page } = await apiJson<{ page: Page }>('/pages', { method: 'POST', json: { handle, name: handle } })
	await save(page.id, { items })
	expect((await api(`/pages/${page.id}/publish`, { method: 'POST' })).status).toBe(200)
	return page.id
}
const named = (name: string) => ({ profile: { name, bio: '', avatar: null } })
const status = async (path: string) => (await visit(path)).status

describe('a visitor’s id for the day', () => {
	const request = (ip = '203.0.113.7') => new Request('https://bio.example/me', { headers: { 'cf-connecting-ip': ip, 'user-agent': 'Mozilla/5.0 (iPhone)' } })
	const input = { kind: 'view' as const, target: 'main', source: 'direct', hour: 9, slug: 'me', url: '', page: 'main' }
	const id = async (day: string, from: Env = env, ip?: string) => (await eventBlobs(from, request(ip), { ...input, day }))[EVENT_FIELDS.indexOf('visitor')]
	const salt = async () => JSON.parse((await env.DB.prepare("SELECT value FROM _meta WHERE key = 'visitor-salt'").first<{ value: string }>())!.value) as { day: string; salt: string }

	it('is the same all day, for every copy of the Worker, and another visitor’s is another', async () => {
		await ensureSchema(env.DB)
		const first = await id('2026-10-31')
		expect(first).toMatch(/^[0-9a-f]{16}$/)
		expect(await id('2026-10-31')).toBe(first)
		expect(await id('2026-10-31', env, '203.0.113.8')).not.toBe(first)
		expect((await salt()).day).toBe('2026-10-31')
	})

	it('doesn’t come from the admin password: whoever knows that can’t try addresses against an id', async () => {
		const first = await id('2026-10-31')
		expect(await id('2026-10-31', { ...env, ADMIN_PASSWORD: 'another-password-altogether' } as Env)).toBe(first)
	})

	it('can’t be made again once the day is over, by anyone: the salt it was made with is gone', async () => {
		const first = await id('2026-10-31')
		const before = await salt()
		expect(await id('2026-11-01')).not.toBe(first)
		const after = await salt()
		expect(after.day).toBe('2026-11-01')
		expect(after.salt).not.toBe(before.salt)
		// Asked for the day before again, it is not what it was.
		expect(await id('2026-10-31')).not.toBe(first)
	})

	it('doesn’t go on with a salt of its own after D1 couldn’t be asked once: the day’s is read the next time', async () => {
		const held = await salt()
		let failed = false
		const DB = new Proxy(env.DB, {
			get(target, key) {
				if (key === 'batch') {
					return (statements: D1PreparedStatement[]) => {
						if (failed) return target.batch(statements)
						failed = true
						return Promise.reject(new Error('D1_ERROR: storage operation exceeded timeout'))
					}
				}
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		const copy = { ...env, DB, SITE: 'a-copy-that-meets-a-failure' } as unknown as Env
		expect(await daySalt(copy, held.day)).not.toBe(held.salt)
		expect(failed).toBe(true)
		expect(await daySalt(copy, held.day)).toBe(held.salt)
	})

	it('keeps one salt for a day whatever is asked for in between: a visit counted late doesn’t take the day’s away', async () => {
		const today = await id('2026-11-02')
		const held = await salt()
		// A visit of the day before, counted a moment after midnight, here and in a copy of the Worker that has
		// only just started and remembers nothing.
		await id('2026-11-01')
		expect(await daySalt({ ...env, SITE: 'a-copy-that-remembers-nothing' } as unknown as Env, '2026-11-01')).toBe(held.salt)
		expect(await salt()).toEqual(held)
		expect(await id('2026-11-02')).toBe(today)
	})
})

describe('publishing while something else changes the page', () => {
	const stored = async (id: string) => (await env.DB.prepare('SELECT draft, draft_updated_at AS version, handle FROM pages WHERE id = ?1').bind(id).first<{ draft: string; version: number; handle: string }>())!

	it('answers with the draft version D1 has, and says the draft was kept, when the draft was saved meanwhile', async () => {
		const id = await made('rl-kept')
		await save(id, named('About to go live'))
		const answer = await publishPage(
			meanwhile(() => save(id, named('Saved while it was publishing'))),
			id,
		)
		const now = await stored(id)
		expect(answer.draftKept).toBe(true)
		expect(answer.draftUpdatedAt).toBe(now.version)
		expect(JSON.parse(now.draft).profile.name).toBe('Saved while it was publishing')
		expect(answer.content.profile.name).toBe('About to go live')
		// With the version it was given, the next save is the one after the draft that was kept, and is taken.
		expect((await api(`/pages/${id}/draft`, { method: 'PUT', headers: { 'if-match': String(answer.draftUpdatedAt) }, json: JSON.parse(now.draft) })).status).toBe(200)
	})

	it('says nothing of the kind when nothing else happened', async () => {
		const id = await made('rl-alone')
		await save(id, named('Alone'))
		const answer = await publishPage(env, id)
		expect(answer.draftKept).toBeUndefined()
		expect(answer.draftUpdatedAt).toBe((await stored(id)).version)
	})

	it('puts the page’s copy at the address it has by then, when it was moved meanwhile', async () => {
		const id = await made('rl-moves')
		await save(id, named('New words'))
		await publishPage(
			meanwhile(async () => expect((await api(`/pages/${id}`, { method: 'PATCH', json: { handle: 'rl-moved' } })).status).toBe(200)),
			id,
		)
		expect(await (await visit('/rl-moved')).text()).toContain('New words')
		expect(await status('/rl-moves')).toBe(404)
		expect(await env.KV.get(`${NAME_PREFIX}rl-moves`)).toBeNull()
	})

	it('moves a page with what it shows by then, when it was published meanwhile', async () => {
		const id = await made('rl-published')
		await save(id, named('Published while it was moving'))
		// The move has read the page, and the publish lands before it writes.
		const DB = new Proxy(env.DB, {
			get(target, key) {
				if (key === 'prepare') {
					return (text: string) => {
						const statement = target.prepare(text)
						if (!text.startsWith('UPDATE pages SET handle')) return statement
						const bind = statement.bind.bind(statement)
						statement.bind = ((...values: unknown[]) => {
							const bound = bind(...values)
							const run = bound.run.bind(bound)
							bound.run = (async () => {
								expect((await api(`/pages/${id}/publish`, { method: 'POST' })).status).toBe(200)
								return run()
							}) as typeof bound.run
							return bound
						}) as typeof statement.bind
						return statement
					}
				}
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		await renamePage({ ...env, DB } as Env, id, 'rl-published-moved')
		expect(await (await visit('/rl-published-moved')).text()).toContain('Published while it was moving')
		expect(await status('/rl-published')).toBe(404)
	})

	it('leaves no short address redirecting that the link was given meanwhile and didn’t keep', async () => {
		const id = await made('rl-slugs', [link('rl-link-1', 'rl-first', 'https://example.com/one')])
		await save(id, named('Going live with the first address'))
		const answer = await publishPage(
			meanwhile(async () => expect((await api(`/pages/${id}/links/rl-link-1/short`, { method: 'PUT', json: { slug: 'rl-second' } })).status).toBe(200)),
			id,
		)
		// What went live has the first address, and the link's row with it; the draft that was kept has the second.
		expect(answer.draftKept).toBe(true)
		expect(await status('/rl-first')).toBe(302)
		expect(await status('/rl-second')).toBe(404)
		expect(await env.KV.get(`${NAME_PREFIX}rl-second`)).toBeNull()
	})
})

describe('publishing a page that is deleted meanwhile', () => {
	it('says the page is gone, and leaves no copy, link or version of it behind', async () => {
		const id = await made('rl-deleted', [link('rl-gone-1', 'rl-gone', 'https://example.com/gone')])
		await save(id, { items: [link('rl-gone-1', 'rl-gone', 'https://example.com/gone'), link('rl-gone-2', 'rl-gone-too', 'https://example.com/gone-too')] })
		await expect(
			publishPage(
				meanwhile(async () => expect((await api(`/pages/${id}`, { method: 'DELETE' })).status).toBe(200)),
				id,
			),
		).rejects.toMatchObject({ status: 404 })
		expect(await status('/rl-deleted')).toBe(404)
		expect(await status('/rl-gone')).toBe(404)
		expect(await status('/rl-gone-too')).toBe(404)
		expect(await env.KV.get(`${NAME_PREFIX}rl-deleted`)).toBeNull()
		expect(await env.DB.prepare('SELECT count(*) AS n FROM page_versions WHERE page_id = ?1').bind(id).first<{ n: number }>()).toEqual({ n: 0 })
		expect(await env.DB.prepare("SELECT count(*) AS n FROM links WHERE page_id = ?1 AND status = 'active'").bind(id).first<{ n: number }>()).toEqual({ n: 0 })
	})
})

describe('the home page moved while it is published', () => {
	it('is at "/" with what it shows by then', async () => {
		const id = await made('rl-home')
		expect((await api('/settings', { method: 'PUT', json: { home: id } })).status).toBe(200)
		await save(id, named('Home, published while it was moving'))
		const DB = new Proxy(env.DB, {
			get(target, key) {
				if (key === 'prepare') {
					return (text: string) => {
						const statement = target.prepare(text)
						if (!text.startsWith('UPDATE pages SET handle')) return statement
						const bind = statement.bind.bind(statement)
						statement.bind = ((...values: unknown[]) => {
							const bound = bind(...values)
							const run = bound.run.bind(bound)
							bound.run = (async () => {
								expect((await api(`/pages/${id}/publish`, { method: 'POST' })).status).toBe(200)
								return run()
							}) as typeof bound.run
							return bound
						}) as typeof statement.bind
						return statement
					}
				}
				const value = Reflect.get(target, key)
				return typeof value === 'function' ? value.bind(target) : value
			},
		})
		try {
			await renamePage({ ...env, DB } as Env, id, 'rl-home-moved')
			expect(await (await visit('/')).text()).toContain('Home, published while it was moving')
		} finally {
			await api('/settings', { method: 'PUT', json: { home: '' } })
		}
	})
})

describe('the stats download', () => {
	const month = (now: number) => addMonths(dayIn('UTC', now).slice(0, 7), -20)
	const total = async () => (await env.DB.prepare('SELECT sum(count) AS n FROM stats').first<{ n: number }>())!.n
	const all = async () => {
		let sum = 0
		let rows = 0
		let cursor: string | undefined
		do {
			const page = await exportStats(env.DB, cursor)
			for (const row of page.rows) sum += row[7]
			rows += page.rows.length
			cursor = page.nextCursor ?? undefined
		} while (cursor)
		return { sum, rows }
	}

	it('starts again when old days were merged into months between two of its pages, so no count is in neither', async () => {
		await ensureSchema(env.DB)
		const now = Date.now()
		// More rows than one page of the download, on days old enough to be merged: fifteen hundred pages' views.
		const insert = env.DB.prepare("INSERT INTO stats (day, target, kind, dim, value, count) VALUES (?1, ?2, 'view', 'source', 'direct', 2)")
		const rows = Array.from({ length: 1500 }, (_, n) => insert.bind(`${month(now)}-${String((n % 28) + 1).padStart(2, '0')}`, `rl-target-${n}`))
		for (let n = 0; n < rows.length; n += 90) await env.DB.batch(rows.slice(n, n + 90))
		const counted = await total()
		const settings = await loadSettings(env.DB)

		const first = await exportStats(env.DB, undefined)
		expect(first.rows).toHaveLength(1000)
		expect(first.nextCursor).not.toBeNull()
		// The dashboard is opened, which is when old days are merged: the ones not downloaded yet go into the
		// month's rows, which sort before where the download has got to.
		await tidyStats(env.DB, settings, now)
		await expect(exportStats(env.DB, first.nextCursor!)).rejects.toMatchObject({ status: 409, code: 'stats-changed' })
		// From the start again, every count is there, as many as the table holds.
		expect((await all()).sum).toBe(counted)
		expect(await total()).toBe(counted)
	}, 60_000)

	it('goes on from page to page when nothing was merged, and takes no cursor made for another shape', async () => {
		const first = await exportStats(env.DB, undefined)
		if (first.nextCursor) expect((await exportStats(env.DB, first.nextCursor)).rows.length).toBeGreaterThan(0)
		const old = btoa(JSON.stringify(['2026-01-01', 'a', 'view', 'source', 'direct']))
		await expect(exportStats(env.DB, old)).rejects.toMatchObject({ status: 400 })
	})

	it('starts again when the owner’s clearing of old months deleted rows meanwhile, too', async () => {
		const now = Date.now()
		const settings = await loadSettings(env.DB)
		const first = await exportStats(env.DB, undefined)
		expect(first.nextCursor).not.toBeNull()
		await clearStats(env.DB, settings, addMonths(month(now), 1), now)
		await tidyStats(env.DB, settings, now)
		await expect(exportStats(env.DB, first.nextCursor!)).rejects.toMatchObject({ status: 409, code: 'stats-changed' })
	})
})
