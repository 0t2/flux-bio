import { describe, expect, it } from 'vitest'
import type { PageJson, PublishResponse, StatsResponse } from '../src/shared/api'
import { emptyContent, ItemSchema, kofiPage, kofiPanelUrl, newItem, PageContentSchema, type KofiItem, type PageContent } from '../src/shared/content'
import { localizedContent, pageTexts } from '../src/shared/translations'
import { publishProblems } from '../src/shared/validate'
import { SHEET_SCRIPT, SHEET_SCRIPT_HASH, TAP_SCRIPT } from '../src/templates/render'
import { api, apiJson, call, IPHONE, visit } from './helpers'

// A Ko-fi card and a floating Ko-fi button: a link to the owner's Ko-fi page that, on a live page, opens Ko-fi's tip
// panel over the page. Nothing comes from Ko-fi until a visitor taps.

const PANEL = kofiPanelUrl('q_0t2').replaceAll('&', '&amp;')
let count = 0

const card = (n: number, patch: Partial<KofiItem> = {}): KofiItem => ({ ...newItem('kofi'), id: `kofi-${n}`, username: 'q_0t2', title: 'Tip jar', ...patch })

async function makePage(changes: (n: number) => Partial<PageContent>, publish = true) {
	const n = ++count
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: `kofi-page-${n}`, name: 'Mei' } })
	await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), ...changes(n) } })
	if (publish) await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
	return { page, n, handle: page.handle }
}

const htmlOf = async (path: string) => (await visit(path)).text()
const tap = (path: string) => call(path, { method: 'POST', headers: { 'user-agent': IPHONE } })
const statsOf = (id: string) => apiJson<StatsResponse>(`/stats?page=${id}&days=7`)

describe('a Ko-fi username', () => {
	it('is read out of whatever the owner pastes: the name, the address, or Ko-fi’s widget code', () => {
		const pasted = [
			'q_0t2',
			'@q_0t2',
			'  q_0t2 ',
			'ko-fi.com/q_0t2',
			'https://ko-fi.com/q_0t2',
			'https://www.ko-fi.com/q_0t2/',
			'https://ko-fi.com/q_0t2?ref=bio',
			'https://ko-fi.com/q_0t2/shop',
			"<script src='https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'></script><script>kofiWidgetOverlay.draw('q_0t2', {'type': 'floating-chat', 'floating-chat.donateButton.text': 'Tip Me'});</script>",
			"<a href='https://ko-fi.com/q_0t2' target='_blank'><img src='https://storage.ko-fi.com/cdn/kofi2.png?v=3' alt='Buy Me a Coffee at ko-fi.com' /></a>",
		]
		for (const input of pasted) expect(kofiPage(input), input).toBe('q_0t2')
	})

	it('is nobody’s in Ko-fi’s own addresses, other sites and anything else', () => {
		const wrong = ['', '  ', 'ko-fi.com', 'https://ko-fi.com/', 'https://ko-fi.com/s/abc123', 'https://ko-fi.com/post/hello', 'https://notko-fi.com/me', 'https://example.com/q_0t2', 'my ko-fi', 'a'.repeat(61)]
		for (const input of wrong) expect(kofiPage(input), input).toBeNull()
	})

	it('names the page and the panel Ko-fi gives out for frames', () => {
		expect(kofiPanelUrl('q_0t2')).toBe('https://ko-fi.com/q_0t2/?hidefeed=true&widget=true&embed=true&preview=true')
	})
})

describe('a Ko-fi card', () => {
	it('starts out the way the guide shows it, and parses', () => {
		const item = newItem('kofi')
		expect(item).toMatchObject({ kind: 'kofi', username: '', title: '請我喝杯咖啡', note: '', hidden: false })
		expect(ItemSchema.parse(item)).toEqual(item)
		expect(PageContentSchema.safeParse({ ...emptyContent('Mei'), items: [item], kofiButton: 'q_0t2' }).success).toBe(true)
	})

	it('stops a publish until it has a Ko-fi account, unless it is hidden, and so does a button without one', () => {
		const content: PageContent = {
			...emptyContent('Mei'),
			items: [card(1, { username: '' }), card(2, { username: 'https://ko-fi.com/s/abc' }), card(3, { username: '', hidden: true }), card(4)],
			kofiButton: 'not a page',
		}
		expect(publishProblems(content, 'mei').map((problem) => problem.path)).toEqual(['items.0.username', 'items.1.username', 'kofiButton'])
		expect(publishProblems({ ...content, items: [card(4)], kofiButton: 'https://ko-fi.com/q_0t2' }, 'mei')).toEqual([])
	})

	it('has its title and note translated, and its username kept as written', () => {
		const content: PageContent = {
			...emptyContent('Mei'),
			items: [card(1, { title: '請我喝杯咖啡', note: '謝謝你' })],
			translations: { en: { 請我喝杯咖啡: 'Buy me a coffee', 謝謝你: 'Thank you' } },
		}
		expect(pageTexts(content)).toEqual(expect.arrayContaining(['請我喝杯咖啡', '謝謝你']))
		expect(localizedContent(content, 'en').items[0]).toMatchObject({ title: 'Buy me a coffee', note: 'Thank you', username: 'q_0t2' })
	})

	it('shows the real address, opens the panel over the page, and counts the tap under its own id', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [card(i, { note: 'Every coffee is a new video' })] }))
		const html = await htmlOf(`/${handle}?s=threads`)
		expect(html).toContain(`<a class="act main" href="https://ko-fi.com/q_0t2" ping="/_c/${handle}/kofi-${n}/kofi?s=threads" data-sheet="${PANEL}">Support me on Ko-fi</a>`)
		expect(html).toContain('<h2 id="k-kofi-' + n + '">Tip jar</h2><p class="note">Every coffee is a new video</p>')
		expect(html).toContain('<dialog class="sheet" id="sheet"')
		expect((await tap(`/_c/${handle}/kofi-${n}/kofi`)).status).toBe(204)
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `kofi-${n}.kofi`, count: 1, label: 'Ko-fi: Tip jar', kind: 'block' }])
		// Without JavaScript the browser goes straight there; through the Worker it goes to the Ko-fi page too.
		expect((await visit(`/_c/${handle}/kofi-${n}/kofi`)).headers.get('location')).toBe('https://ko-fi.com/q_0t2')
	})

	it('keeps its clicks under its own name once it is deleted, not the floating button’s', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [card(i)], kofiButton: 'q_0t2' }))
		await tap(`/_c/${handle}/kofi-${n}/kofi`)
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), kofiButton: 'q_0t2' } })
		await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `kofi-${n}.kofi`, label: '(deleted item)' }])
	})

	it('isn’t on the page without a Ko-fi account, and shows unfinished in a preview', async () => {
		const { page, handle } = await makePage((i) => ({ items: [card(i, { username: '' })] }), false)
		const refused = await api(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(refused.status).toBe(400)
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		const preview = await htmlOf(new URL(url).pathname)
		expect(preview).toContain('<span class="act main todo">')
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), items: [card(1, { username: '', hidden: true })] } })
		await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(await htmlOf(`/${handle}`)).not.toContain('class="panel kofi"')
	})
})

describe('the floating Ko-fi button', () => {
	it('isn’t there unless the owner adds it', async () => {
		const { handle } = await makePage(() => ({}))
		const html = await htmlOf(`/${handle}`)
		expect(html).not.toContain('kofi-button')
		expect(html).not.toContain('<dialog')
		expect(html).not.toContain(SHEET_SCRIPT)
	})

	it('floats on the page, opens the same panel, and counts a tap under the page', async () => {
		const { page, handle } = await makePage(() => ({ kofiButton: 'https://ko-fi.com/q_0t2' }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain(`<a class="kofi-button" href="https://ko-fi.com/q_0t2" ping="/_c/${handle}/page/kofi" data-sheet="${PANEL}" aria-label="Support me on Ko-fi">`)
		expect(html).toContain('<span>Support me</span></a>')
		expect(html).toContain('<body class="has-kofi">')
		expect((await tap(`/_c/${handle}/page/kofi`)).status).toBe(204)
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `${page.id}.kofi`, count: 1, label: 'Ko-fi button' }])
	})

	it('sits above the LINE button when both are on', async () => {
		const { handle } = await makePage(() => ({ kofiButton: 'q_0t2', lineButton: 'https://lin.ee/abc' }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain('<body class="has-line has-kofi">')
		expect(html).toContain('.has-line .kofi-button{bottom:calc(84px')
	})

	it('goes nowhere when the account makes no sense, and an empty one is no button', async () => {
		const { page } = await makePage(() => ({ kofiButton: 'not a page' }), false)
		expect((await api(`/pages/${page.id}/publish`, { method: 'POST' })).status).toBe(400)
		const { handle } = await makePage(() => ({ kofiButton: '  ' }))
		expect(await htmlOf(`/${handle}`)).not.toContain('kofi-button')
		expect((await tap(`/_c/${handle}/page/kofi`)).status).toBe(204)
	})
})

describe('a page with Ko-fi on it', () => {
	it('loads nothing from Ko-fi before a tap: no script, no picture, and a frame with no address', async () => {
		const { handle } = await makePage((i) => ({ items: [card(i)], kofiButton: 'q_0t2' }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toMatch(/<iframe title="Ko-fi" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="payment"><\/iframe>/)
		expect(html).not.toMatch(/<iframe[^>]* src=/)
		expect(html).not.toMatch(/<script[^>]* src=/)
		expect(html).not.toMatch(/kofiWidgetOverlay|overlay-widget|storage\.ko-fi\.com/)
		// Ko-fi is only ever named where a tap goes: a link's address and the frame's address-to-be.
		const outsideLinks = html.replace(/ (?:href|data-sheet)="[^"]*"/g, '')
		expect(outsideLinks).not.toMatch(/ko-fi\.com/i)
		expect(html.match(/ko-fi\.com/g)?.length).toBe(4)
	})

	it('runs only its two scripts, which the CSP allows by their hashes, and may frame Ko-fi', async () => {
		const { handle } = await makePage((i) => ({ items: [card(i)] }))
		const response = await visit(`/${handle}`)
		const html = await response.text()
		expect(html.match(/<script/g)).toHaveLength(2)
		expect(html).toContain(`<script>${TAP_SCRIPT}</script><script>${SHEET_SCRIPT}</script>`)
		const csp = response.headers.get('content-security-policy') ?? ''
		expect(csp).toContain(`'${SHEET_SCRIPT_HASH}'`)
		expect(csp).toMatch(/frame-src [^;]*https:\/\/ko-fi\.com/)
		expect(csp).not.toMatch(/script-src [^;]*(unsafe-inline|ko-fi)/)
	})

	it('has the hash of exactly the script it sends', async () => {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SHEET_SCRIPT))
		expect(`sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`).toBe(SHEET_SCRIPT_HASH)
	})

	it('leaves a new tab, or a browser without the script, to follow the link', () => {
		expect(SHEET_SCRIPT).toContain('if(!f||!d.showModal)return')
		expect(SHEET_SCRIPT).toContain('if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return')
		expect(SHEET_SCRIPT.indexOf('return;e.preventDefault()')).toBeGreaterThan(-1)
	})

	it('opens Ko-fi in a new tab from a preview, where no script runs and nothing is counted', async () => {
		const { page } = await makePage((i) => ({ items: [card(i)], kofiButton: 'q_0t2' }), false)
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		const html = await htmlOf(new URL(url).pathname)
		expect(html).toContain('<a class="act main" href="https://ko-fi.com/q_0t2" target="_blank" rel="noopener noreferrer">')
		expect(html).not.toContain('data-sheet')
		expect(html).not.toContain('ping=')
		expect(html).not.toContain('<dialog')
	})
})
