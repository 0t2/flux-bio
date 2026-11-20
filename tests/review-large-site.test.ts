import { env } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { emptyContent } from '../src/shared/content'
import { ensureSchema } from '../src/worker/lib/db'
import { KV_OPS_AT_ONCE } from '../src/worker/lib/mode'
import { updateSettings } from '../src/worker/lib/ops'

// A site with more published pages than one request may tell KV about. A change to every page's copy drops a slice
// of them, and what is left has to be reached: by the calls after it, each going on from where the last stopped,
// and not by dropping the same first slice again, which used up a day's free KV writes in two calls and never got
// to the rest.

const EXTRA = 10

it('drops every page’s copy across calls, each going on from the last, and then stops', async () => {
	await ensureSchema(env.DB)
	const now = Date.now()
	const insert = env.DB.prepare('INSERT INTO pages (id, handle, position, draft, published, draft_updated_at, published_at, created_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?5, ?5)')
	const content = JSON.stringify(emptyContent('Shop'))
	const pages = Array.from({ length: KV_OPS_AT_ONCE + EXTRA }, (_, i) => insert.bind(`large-${i}`, `large-${String(i).padStart(4, '0')}`, i, content, now))
	for (let i = 0; i < pages.length; i += 90) await env.DB.batch(pages.slice(i, i + 90))

	const dropped: string[] = []
	let written = 0
	const KV = new Proxy(env.KV, {
		get(target, key) {
			if (key === 'delete') return async (name: string) => void dropped.push(name)
			if (key === 'put') return async () => void written++
			const value = Reflect.get(target, key)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	const counting = { ...env, KV } as Env
	const call = async (patch: Parameters<typeof updateSettings>[1]) => {
		dropped.length = 0
		written = 0
		const { copiesLeft } = await updateSettings(counting, patch)
		return { copiesLeft, dropped: dropped.length, written }
	}

	// Another language: every page's copy carries the languages.
	expect(await call({ languages: ['ja'] })).toEqual({ copiesLeft: true, dropped: KV_OPS_AT_ONCE, written: 1 })
	const first = new Set(dropped)
	// Whatever is changed next finishes it, with the pages the first call didn't reach and no others.
	expect(await call({ plan: 'paid' })).toEqual({ copiesLeft: false, dropped: EXTRA, written: 0 })
	expect(dropped.some((name) => first.has(name))).toBe(false)
	expect(new Set([...first, ...dropped]).size).toBe(KV_OPS_AT_ONCE + EXTRA)
	// And then nothing is owed.
	expect(await call({ plan: 'free' })).toEqual({ copiesLeft: false, dropped: 0, written: 0 })
	expect(await env.DB.prepare("SELECT count(*) AS n FROM _meta WHERE key = 'copies-owed'").first<{ n: number }>()).toEqual({ n: 0 })
}, 60_000)
