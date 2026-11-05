import { env } from 'cloudflare:test'
import { beforeAll, expect, it } from 'vitest'
import type { PageJson, StateResponse, StatsResponse } from '../src/shared/api'
import { apiJson, visit } from './helpers'

// A database exactly as v0.1 left it: one page with "links", settings holding
// the handle, page views counted under "page". The first request upgrades it.
beforeAll(async () => {
	const legacy = JSON.stringify({
		profile: { name: 'Mei', bio: 'v0.1 page', avatar: null },
		appearance: { theme: 'liquid', accent: '', font: 'auto', button: 'auto', showSocial: true },
		socials: [],
		links: [{ id: 'lens-link', title: 'Lens', subtitle: '', url: 'https://example.com/lens/', slug: 'lens', icon: 'auto', featured: true, hidden: false }],
		seo: { title: '', description: '', image: null },
		showBadge: true,
	})
	const now = Date.now()
	const today = new Date().toISOString().slice(0, 10)
	await env.DB.batch([
		env.DB.prepare('CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
		env.DB.prepare(`CREATE TABLE pages (id TEXT PRIMARY KEY, draft TEXT NOT NULL, published TEXT, draft_updated_at INTEGER NOT NULL, published_at INTEGER, created_at INTEGER NOT NULL)`),
		env.DB.prepare(`CREATE TABLE links (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL CHECK (kind IN ('bio', 'solo')), status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
			starts_at INTEGER, expires_at INTEGER, password_hash TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
			created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
		env.DB.prepare(`CREATE TABLE stats (day TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, dim TEXT NOT NULL, value TEXT NOT NULL,
			count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, target, kind, dim, value)) WITHOUT ROWID`),
		env.DB.prepare("INSERT INTO _meta (key, value) VALUES ('schema_version', '2')"),
		env.DB.prepare("INSERT INTO _meta (key, value) VALUES ('settings', ?1)").bind(
			JSON.stringify({ handle: 'jesse', homepage: true, timezone: 'UTC', locale: 'zh-TW' }),
		),
		env.DB.prepare('INSERT INTO pages VALUES (?1, ?2, ?2, ?3, ?3, ?3)').bind('main', legacy, now),
		env.DB.prepare("INSERT INTO links VALUES ('lens-link', 'lens', 'https://example.com/lens/', 'Lens', 'bio', 'active', NULL, NULL, NULL, NULL, NULL, NULL, ?1, ?1)").bind(now),
		env.DB.prepare("INSERT INTO stats VALUES (?1, 'page', 'view', 'source', 'instagram', 5)").bind(today),
	])
})

it('upgrades a v0.1 database in place', async () => {
	const state = await apiJson<StateResponse>('/state')
	expect(state.pages.map((page) => [page.id, page.handle, page.home])).toEqual([['main', 'jesse', true]])
	const { page } = await apiJson<{ page: PageJson }>('/pages/main')
	expect(page.published?.items[0]).toMatchObject({ kind: 'link', slug: 'lens' })

	// Visitors keep working without a republish: KV is rebuilt from D1.
	expect((await visit('/')).status).toBe(200)
	expect((await visit('/jesse')).status).toBe(200)
	expect((await visit('/lens')).headers.get('location')).toBe('https://example.com/lens/')

	const stats = await apiJson<StatsResponse>('/stats?page=main&days=7')
	expect(stats.totals.views).toBeGreaterThanOrEqual(5)
})
