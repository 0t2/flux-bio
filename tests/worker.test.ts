import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateLinkResponse, LinkJson, LinksResponse, PageJson, StateResponse, StatsResponse } from '../src/shared/api'
import { emptyContent, emptyLink, newItem, type LinkItem, type PageContent } from '../src/shared/content'
import { SHEET_SCRIPT_HASH, TAP_SCRIPT, TAP_SCRIPT_HASH } from '../src/templates/render'
import { ANDROID, api, apiJson, call, INSTAGRAM, IPHONE, LINE, PASSWORD, visit } from './helpers'

function link(patch: Partial<LinkItem>): LinkItem {
	return { ...emptyLink(), ...patch }
}

function samplePage(): PageContent {
	const content = emptyContent('Mei')
	content.profile.bio = 'AI 生圖・AI 影片實戰教學'
	content.items = [
		link({ id: 'lens-link', title: '鏡頭語言庫', subtitle: '電影運鏡術語', url: 'https://example.com/lens/', slug: 'lens', icon: 'video', featured: true }),
		link({ id: 'yt-link-x', title: '最新教學影片', url: 'https://youtube.com/@mei' }),
		link({ id: 'hidden-lk', title: '隱藏的連結', url: 'https://example.com/secret', slug: 'secret', hidden: true }),
		{ ...newItem('heading'), id: 'head-1', title: '小店' },
		{
			...newItem('product'),
			id: 'shop-blk',
			products: [{ id: 'bean-1', name: '日曬耶加雪菲', price: 'NT$ 160', image: null, url: 'https://shop.example/beans' }],
		},
	]
	content.socials = [{ id: 'social-ig', platform: 'instagram', url: 'instagram.com/mei' }]
	return content
}

async function links(): Promise<LinkJson[]> {
	return (await apiJson<LinksResponse>('/links')).links
}

let pageId = ''

beforeAll(async () => {
	// These tests read the built-in text in Traditional Chinese; new installs start in English.
	const { settings } = await apiJson<StateResponse>('/state')
	expect((await api('/settings', { method: 'PUT', json: { ...settings, locale: 'zh-TW' } })).status).toBe(200)
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'me', name: 'Mei' } })
	pageId = page.id
	expect((await api(`/pages/${pageId}/draft`, { method: 'PUT', json: samplePage() })).status).toBe(200)
	expect((await api(`/pages/${pageId}/publish`, { method: 'POST' })).status).toBe(200)
})

describe('admin API auth', () => {
	it('needs a session, the admin password or a token', async () => {
		expect((await call('/api/state')).status).toBe(401)
		expect((await call('/api/state', { headers: { authorization: 'Bearer wrong-password-00' } })).status).toBe(401)
		expect((await api('/state')).status).toBe(200)
	})

	it('signs in with ADMIN_PASSWORD and sets an HttpOnly session cookie', async () => {
		const wrong = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'nope' }) })
		expect(wrong.status).toBe(401)
		const right = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) })
		expect(right.status).toBe(200)
		const cookie = right.headers.get('set-cookie') ?? ''
		expect(cookie).toContain('HttpOnly')
		const session = cookie.split(';')[0]!
		const state = (await (await call('/api/state', { headers: { cookie: session } })).json()) as StateResponse
		expect(state.role).toBe('admin')
	})

	it('still accepts the v0.1 login body', async () => {
		expect((await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ token: PASSWORD }) })).status).toBe(200)
	})

	it('reports setup problems before sign-in and refuses an empty password', async () => {
		expect(await (await call('/api/auth/info')).json()).toEqual({ setup: null })
		expect((await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: '' }) })).status).toBe(401)
	})

	it('rejects cross-site writes', async () => {
		const response = await api(`/pages/${pageId}/draft`, { method: 'PUT', json: samplePage(), headers: { origin: 'https://evil.example' } })
		expect(response.status).toBe(403)
	})
})

describe('API tokens', () => {
	it('creates a links-only token that can make short links and nothing else', async () => {
		const { token } = await apiJson<{ token: string }>('/tokens', { method: 'POST', json: { name: 'iPhone 捷徑', scope: 'links' } })
		expect(token).toMatch(/^fbk_[0-9A-Za-z]{32}$/)
		const created = await apiJson<CreateLinkResponse>('/links', { method: 'POST', json: { url: 'https://example.com/from-token', slug: 'from-token' }, bearer: token })
		expect(created.short).toBe('https://bio.example/from-token')
		expect((await api('/state', { bearer: token })).status).toBe(403)
		expect((await api('/tokens', { bearer: token })).status).toBe(403)
		const listed = await apiJson<{ tokens: { name: string; lastUsedAt: number | null }[] }>('/tokens')
		expect(listed.tokens[0]?.lastUsedAt).toBeTypeOf('number')
	})

	it('stops working once revoked', async () => {
		const { token, info } = await apiJson<{ token: string; info: { id: string } }>('/tokens', { method: 'POST', json: { name: 'temp', scope: 'full' } })
		expect((await api('/state', { bearer: token })).status).toBe(200)
		await api(`/tokens/${info.id}`, { method: 'DELETE' })
		expect((await api('/state', { bearer: token })).status).toBe(401)
	})
})

describe('publishing and visiting', () => {
	it('makes the first page the home page and fills in missing slugs', async () => {
		const state = await apiJson<StateResponse>('/state')
		expect(state.settings.home).toBe(pageId)
		const { page } = await apiJson<{ page: PageJson }>(`/pages/${pageId}`)
		const slugs = page.published?.items.flatMap((item) => (item.kind === 'link' ? [item.slug] : []))
		expect(slugs).toEqual(['lens', 'youtube', 'secret'])
	})

	it('serves the page at / with counted links and only the script that reports them', async () => {
		const response = await visit('/?s=ig', INSTAGRAM)
		expect(response.status).toBe(200)
		const html = await response.text()
		expect(html).toMatch(/<h1>Mei<\/h1>/)
		expect(html).toContain('href="https://example.com/lens/" ping="/_c/me/lens-link/link?s=instagram"')
		expect(html).toContain('href="https://shop.example/beans" ping="/_c/me/shop-blk/bean-1?s=instagram"')
		expect(html).not.toContain('隱藏的連結')
		expect(html.match(/<script/g)).toHaveLength(1)
		expect(html).toContain(`<script>${TAP_SCRIPT}</script>`)
		expect(response.headers.get('content-security-policy')).toContain(`script-src '${TAP_SCRIPT_HASH}' '${SHEET_SCRIPT_HASH}';`)
	})

	it("passes the visit's campaign tags on to the page's links", async () => {
		const html = await (await visit('/?utm_source=instagram&utm_medium=social&utm_content=story&utm_term=ignored', INSTAGRAM)).text()
		expect(html).toContain('ping="/_c/me/lens-link/link?s=instagram&amp;utm_source=instagram&amp;utm_medium=social&amp;utm_content=story"')
	})

	it('also serves the page at its handle', async () => {
		expect((await visit('/me')).status).toBe(200)
	})

	it('redirects short links and counts the click with its source', async () => {
		const before = (await links()).find((entry) => entry.slug === 'lens')?.stats?.total ?? 0
		const response = await visit('/lens?s=instagram', INSTAGRAM)
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://example.com/lens/')
		const lens = (await links()).find((entry) => entry.slug === 'lens')
		expect(lens?.stats?.total).toBe(before + 1)
		expect(lens?.stats?.sources[0]?.source).toBe('instagram')
	})

	it('counts clicks inside blocks and sends them on', async () => {
		const response = await visit('/_c/me/shop-blk/bean-1')
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://shop.example/beans')
		const stats = await apiJson<StatsResponse>(`/stats?page=${pageId}&days=7`)
		expect(stats.topLinks.find((entry) => entry.target === 'shop-blk.bean-1')?.label).toBe("Product: 日曬耶加雪菲")
		// An unknown part goes back to the page instead of anywhere else.
		expect((await visit('/_c/me/shop-blk/nope')).headers.get('location')).toBe('/')
	})

	it('keeps hidden links working as short links', async () => {
		expect((await visit('/secret')).headers.get('location')).toBe('https://example.com/secret')
	})

	it('does not count bots', async () => {
		const before = (await links()).find((entry) => entry.slug === 'youtube')?.stats?.total ?? 0
		await visit('/youtube', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
		await visit('/youtube', 'facebookexternalhit/1.1')
		const after = (await links()).find((entry) => entry.slug === 'youtube')?.stats?.total ?? 0
		expect(after).toBe(before)
	})

	it('suggests public addresses for typos and returns 404', async () => {
		const response = await visit('/lnes')
		expect(response.status).toBe(404)
		const html = await response.text()
		expect(html).toContain('你是不是要找')
		expect(html).toContain('href="/lens"')
		// Hidden links are never suggested.
		expect(await (await visit('/secrat')).text()).not.toContain('/secret')
		expect((await visit('/wp-login.php')).status).toBe(404)
	})

	it('reports what blocks a publish', async () => {
		const broken = samplePage()
		broken.items.push(link({ id: 'broken-xx', title: 'Broken', url: 'ftp://example.com' }))
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: broken })
		const response = await api(`/pages/${pageId}/publish`, { method: 'POST' })
		expect(response.status).toBe(400)
		const body = (await response.json()) as { problems: { path: string }[] }
		const n = broken.items.length
		expect(body.problems.map((problem) => problem.path)).toContain(`items.${n - 1}.url`)
		// Each problem also carries its translation key and values for the dashboard.
		expect(body.problems.find((problem) => problem.path === `items.${n - 1}.url`)).toEqual({
			path: `items.${n - 1}.url`,
			message: `Item ${n}: the link’s URL must start with http:// or https://`,
			key: '第 {n} 項連結的網址要以 http:// 或 https:// 開頭',
			params: { n },
		})
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: samplePage() })
	})

	it('archives links removed from the page and frees their slugs', async () => {
		const page = samplePage()
		page.items = page.items.filter((item) => item.id !== 'yt-link-x')
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: page })
		await api(`/pages/${pageId}/publish`, { method: 'POST' })
		expect((await visit('/youtube')).status).toBe(404)
		expect((await links()).find((entry) => entry.id === 'yt-link-x')?.status).toBe('archived')
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: samplePage() })
		await api(`/pages/${pageId}/publish`, { method: 'POST' })
		expect((await visit('/youtube')).status).toBe(302)
	})

	it('escapes markup in published content', async () => {
		const page = samplePage()
		page.profile.name = '<img src=x onerror=alert(1)>'
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: page })
		await api(`/pages/${pageId}/publish`, { method: 'POST' })
		const html = await (await visit('/')).text()
		expect(html).not.toContain('<img src=x')
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: samplePage() })
		await api(`/pages/${pageId}/publish`, { method: 'POST' })
	})

	it('schedules links: hidden before, the expired page points back after', async () => {
		const now = Date.now()
		const page = samplePage()
		page.items.push(
			link({ id: 'soon-link', title: '即將開放', url: 'https://example.com/soon', slug: 'soon', startsAt: now + 86_400_000 }),
			link({ id: 'over-link', title: '已結束', url: 'https://example.com/over', slug: 'over', startsAt: now - 172_800_000, endsAt: now - 86_400_000 }),
		)
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: page })
		await api(`/pages/${pageId}/publish`, { method: 'POST' })
		const html = await (await visit('/')).text()
		expect(html).not.toContain('即將開放')
		expect(html).not.toContain('已結束')
		expect((await visit('/soon')).status).toBe(403)
		const expired = await visit('/over')
		expect(expired.status).toBe(410)
		const text = await expired.text()
		expect(text).toContain('看看 Mei 的其他連結吧')
		expect(text).toContain('前往 Mei 的頁面')
		await api(`/pages/${pageId}/draft`, { method: 'PUT', json: samplePage() })
		await api(`/pages/${pageId}/publish`, { method: 'POST' })
	})
})

describe('standalone short links', () => {
	let id = ''
	const path = `/${encodeURIComponent('講座報名')}`

	it('creates a link with a Chinese slug', async () => {
		const response = await api('/links', { method: 'POST', json: { url: 'https://example.com/talk', slug: '講座報名' } })
		expect(response.status).toBe(201)
		id = ((await response.json()) as CreateLinkResponse).link.id
		expect((await visit(path)).headers.get('location')).toBe('https://example.com/talk')
	})

	it('refuses taken and reserved slugs', async () => {
		expect((await api('/links', { method: 'POST', json: { url: 'https://example.com', slug: 'lens' } })).status).toBe(409)
		expect((await api('/links', { method: 'POST', json: { url: 'https://example.com', slug: 'me' } })).status).toBe(409)
		expect((await api('/links', { method: 'POST', json: { url: 'https://example.com', slug: 'admin' } })).status).toBe(400)
		expect((await api('/links', { method: 'POST', json: { url: 'javascript:alert(1)' } })).status).toBe(400)
	})

	it('sends errors in English, with a key and values the dashboard can translate', async () => {
		const taken = await api('/links', { method: 'POST', json: { url: 'https://example.com', slug: 'lens' } })
		expect(await taken.json()).toEqual({
			error: 'slug-taken',
			message: '“lens” is already taken. Please choose another.',
			key: '「{name}」已經被使用了，請換一個',
			params: { name: 'lens' },
		})
		// A value that is itself a message has its own key.
		const ios = await api(`/links/${id}`, { method: 'PATCH', json: { iosUrl: 'ftp://example.com' } })
		expect(await ios.json()).toEqual({
			error: 'invalid',
			message: "The iPhone/iPad redirect URL must start with http:// or https://",
			key: '{label}要以 http:// 或 https:// 開頭',
			params: { label: { key: 'iPhone／iPad 的導向網址' } },
		})
		// A message without values still comes with its key.
		expect(await (await api('/links/no-such-link')).json()).toEqual({ error: 'not-found', message: "Short link not found", key: '找不到這個短網址' })
	})

	it('creates many at once and reports the rows it skipped', async () => {
		const body = await apiJson<{ created: LinkJson[]; errors: { index: number }[] }>('/links/bulk', {
			method: 'POST',
			json: {
				links: [
					{ url: 'https://example.com/a?x=1', slug: 'bulk-ig', utm: { source: 'instagram', medium: 'social', campaign: 'autumn', content: 'story' } },
					{ url: 'https://example.com/a', slug: 'lens' },
					{ url: 'event-page', slug: 'bulk-bad' },
				],
			},
		})
		expect(body.created.map((row) => row.slug)).toEqual(['bulk-ig'])
		expect(body.errors.map((error) => error.index)).toEqual([1, 2])
		expect((await visit('/bulk-ig')).headers.get('location')).toBe('https://example.com/a?x=1&utm_source=instagram&utm_medium=social&utm_campaign=autumn&utm_content=story')
	})

	it('does not let the short links page rewrite bio links', async () => {
		expect((await api('/links/lens-link', { method: 'PATCH', json: { url: 'https://evil.example' } })).status).toBe(400)
		expect((await api('/links/lens-link', { method: 'PATCH', json: { expiresAt: 1 } })).status).toBe(400)
	})

	it('adds UTM tags and asks for a password', async () => {
		await api(`/links/${id}`, {
			method: 'PATCH',
			json: { password: '2026', utm: { source: 'line', medium: 'broadcast', campaign: 'talk-nov' } },
		})
		const gate = await visit(path)
		expect(gate.status).toBe(401)
		expect(await gate.text()).toContain('這個連結需要密碼')

		const form = (password: string) =>
			visit(path, IPHONE, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: `password=${password}`,
			})
		expect((await form('wrong')).status).toBe(401)
		const ok = await form('2026')
		expect(ok.status).toBe(303)
		expect(ok.headers.get('location')).toBe('https://example.com/talk?utm_source=line&utm_medium=broadcast&utm_campaign=talk-nov')
	})

	it('routes by app and device', async () => {
		await api(`/links/${id}`, {
			method: 'PATCH',
			json: { password: null, utm: { source: null, medium: null, campaign: null }, lineExternal: true, inAppPrompt: true, iosUrl: 'https://apps.apple.com/app/id1', androidUrl: null },
		})
		expect((await visit(path, LINE)).headers.get('location')).toBe('https://apps.apple.com/app/id1?openExternalBrowser=1')
		expect((await visit(path, ANDROID)).headers.get('location')).toBe('https://example.com/talk')
		const prompt = await visit(path, INSTAGRAM)
		expect(prompt.status).toBe(200)
		const html = await prompt.text()
		expect(html).toContain('在外部瀏覽器開啟')
		// The copy button is the one script on public pages, allowed by a per-response nonce.
		const nonce = html.match(/<script nonce="([^"]+)"/)?.[1]
		expect(prompt.headers.get('content-security-policy')).toContain(`'nonce-${nonce}'`)
		expect((await visit(`${path}?go=1`, INSTAGRAM)).status).toBe(302)
		await api(`/links/${id}`, { method: 'PATCH', json: { lineExternal: false, inAppPrompt: false, iosUrl: null } })
		// The dashboard can show the prompt in any browser.
		expect(await (await visit(`${path}?inapp=preview`)).text()).toContain('在外部瀏覽器開啟')
		const { link } = await apiJson<{ link: LinkJson }>(`/links/${id}`)
		expect([link.lineExternal, link.inAppPrompt, link.iosUrl]).toEqual([false, false, null])
	})

	it('honors opening and expiry times', async () => {
		const now = Date.now()
		await api(`/links/${id}`, { method: 'PATCH', json: { startsAt: now + 86_400_000 } })
		expect((await visit(path)).status).toBe(403)
		await api(`/links/${id}`, { method: 'PATCH', json: { startsAt: null, expiresAt: now - 1000 } })
		expect((await visit(path)).status).toBe(410)
		await api(`/links/${id}`, { method: 'PATCH', json: { expiresAt: null } })
		expect((await visit(path)).status).toBe(302)
	})

	it('archives and restores', async () => {
		await api(`/links/${id}`, { method: 'PATCH', json: { status: 'archived' } })
		expect((await visit(path)).status).toBe(404)
		await api(`/links/${id}`, { method: 'PATCH', json: { status: 'active' } })
		expect((await visit(path)).status).toBe(302)
	})
})

describe('pages', () => {
	it('adds a second page from a starter and keeps handles and slugs apart', async () => {
		expect((await api('/pages', { method: 'POST', json: { handle: 'lens', name: 'x' } })).status).toBe(409)
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'shop', name: '島嶼咖啡', starter: 'shop' } })
		expect(page.draft.appearance.theme).toBe('jelly')
		expect(page.draft.items.some((item) => item.kind === 'hours')).toBe(true)
		const state = await apiJson<StateResponse>('/state')
		expect(state.pages.map((entry) => entry.handle)).toEqual(['me', 'shop'])
	})

	it('copies a page with fresh ids so its links become new short links', async () => {
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'me-copy', name: 'Mei copy', copyFrom: pageId } })
		const copied = page.draft.items.filter((item): item is LinkItem => item.kind === 'link')
		expect(copied.every((item) => item.slug === '' && item.id !== 'lens-link')).toBe(true)
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		expect((await visit('/me-copy')).status).toBe(200)
		expect((await visit('/lens')).headers.get('location')).toBe('https://example.com/lens/')
	})

	it('renames a page and moves its address', async () => {
		const state = await apiJson<StateResponse>('/state')
		const copy = state.pages.find((entry) => entry.handle === 'me-copy')!
		await apiJson(`/pages/${copy.id}`, { method: 'PATCH', json: { handle: 'me-two' } })
		expect((await visit('/me-copy')).status).toBe(404)
		expect((await visit('/me-two')).status).toBe(200)
		await apiJson(`/pages/${copy.id}`, { method: 'DELETE' })
		expect((await visit('/me-two')).status).toBe(404)
	})
})

describe('settings and stats', () => {
	it('can keep every page off the homepage', async () => {
		const state = await apiJson<StateResponse>('/state')
		await api('/settings', { method: 'PUT', json: { ...state.settings, home: '' } })
		const root = await visit('/')
		expect(root.status).toBe(404)
		expect(await root.text()).toContain('href="/me"')
		expect((await visit('/me')).status).toBe(200)
		await api('/settings', { method: 'PUT', json: { ...state.settings, home: pageId } })
		expect((await visit('/')).status).toBe(200)
	})

	it('summarizes one page: views, clicks and sources, against the period before', async () => {
		await visit('/?s=threads')
		const stats = await apiJson<StatsResponse>(`/stats?page=${pageId}&days=7`)
		expect(stats.days).toHaveLength(7)
		expect(stats.totals.views).toBeGreaterThan(0)
		expect(stats.totals.clicks).toBeGreaterThan(0)
		expect(stats.previous).toEqual({ views: 0, clicks: 0 })
		expect(stats.viewSources.map((source) => source.value)).toContain('threads')
		expect(stats.topLinks.some((entry) => entry.slug === 'lens')).toBe(true)
		// Standalone links have their own stats, not the page's.
		expect(stats.topLinks.some((entry) => entry.slug === '講座報名')).toBe(false)
	})
})

describe('backup', () => {
	it('exports everything and imports it back', async () => {
		const backup = await apiJson<{ pages: { handle: string }[]; shortLinks: { slug: string }[] }>('/export')
		expect(backup.pages.map((page) => page.handle)).toContain('me')
		expect(backup.shortLinks.map((row) => row.slug)).toContain('lens')
		const result = await apiJson<{ pages: number }>('/import', { method: 'POST', json: backup })
		expect(result.pages).toBe(backup.pages.length)
		expect((await visit('/lens')).headers.get('location')).toBe('https://example.com/lens/')
		expect((await visit('/me')).status).toBe(200)
	})
})
