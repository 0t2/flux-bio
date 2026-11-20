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

describe('the stats download', () => {
	const old = (now: number) => `${addMonths(dayIn('UTC', now).slice(0, 7), -20)}-05`
	const days = async (day: string) => (await env.DB.prepare('SELECT count(*) AS n FROM stats WHERE day = ?1').bind(day).first<{ n: number }>())!.n

	it('holds the merging of old days into months while it is going on, so no count falls between two pages of it', async () => {
		await ensureSchema(env.DB)
		const now = Date.now()
		const day = old(now)
		await env.DB.prepare("INSERT INTO stats (day, target, kind, dim, value, count) VALUES (?1, 'rl-page', 'view', 'source', 'direct', 4)").bind(day).run()
		const settings = await loadSettings(env.DB)
		// A page of the download, and then a visit to the dashboard, which is when old days are merged.
		await exportStats(env.DB, undefined, undefined, now)
		await tidyStats(env.DB, settings, now + 60_000)
		expect(await days(day)).toBe(1)
		// Each page of it holds again, and five minutes after the last one the merging goes on.
		await exportStats(env.DB, undefined, undefined, now + 4 * 60_000)
		await tidyStats(env.DB, settings, now + 8 * 60_000)
		expect(await days(day)).toBe(1)
		await tidyStats(env.DB, settings, now + 10 * 60_000)
		expect(await days(day)).toBe(0)
		expect(await days(day.slice(0, 7))).toBe(1)
	})

	it('doesn’t hold a clearing the owner asks for afterwards: asking says the download is done', async () => {
		const now = Date.now()
		const day = old(now)
		await env.DB.prepare("INSERT INTO stats (day, target, kind, dim, value, count) VALUES (?1, 'rl-page-2', 'view', 'source', 'direct', 2)").bind(day).run()
		const settings = await loadSettings(env.DB)
		await exportStats(env.DB, undefined, undefined, now)
		await clearStats(env.DB, settings, addMonths(day.slice(0, 7), 1), now)
		await tidyStats(env.DB, settings, now + 1_000)
		expect(await days(day)).toBe(0)
		expect(await days(day.slice(0, 7))).toBe(0)
	})
})
