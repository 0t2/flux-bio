import { describe, expect, it } from 'vitest'
import type { PageJson, PublishResponse, StatsResponse } from '../src/shared/api'
import { emptyContent, ItemSchema, LINE_PART, LINK_PART, LOCALES, newEmbed, newItem, PageContentSchema, SOCIAL_PART, type EmbedItem, type PageContent } from '../src/shared/content'
import { EMBED_ACTIONS, EMBED_PROVIDERS, embedAccount, EMBEDS, embedWords, type EmbedProvider } from '../src/shared/embeds'
import { localizedContent, pageTexts } from '../src/shared/translations'
import { publishProblems } from '../src/shared/validate'
import { ICONS } from '../src/templates/icons'
import { renderBioPage, SHEET_SANDBOX, SHEET_SCRIPT, SHEET_SCRIPT_HASH, TAP_SCRIPT, TAP_SCRIPT_HASH } from '../src/templates/render'
import { api, apiJson, call, IPHONE, visit } from './helpers'

// A card for the owner's account on another service, and a button floating at the bottom right: links to that account's
// page that, on a live page, open the service's own panel over the page. Nothing comes from the service until a tap.

const KOFI_PANEL = EMBEDS.kofi.panel('q_0t2').replaceAll('&', '&amp;')
const CALENDLY_PANEL = EMBEDS.calendly.panel('mei/intro').replaceAll('&', '&amp;')
let count = 0

const card = (n: number, patch: Partial<EmbedItem> = {}): EmbedItem => ({ ...newItem('embed'), id: `embed-${n}`, account: 'q_0t2', title: 'Tip jar', ...patch })

async function makePage(changes: (n: number) => Partial<PageContent>, publish = true) {
	const n = ++count
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: `embed-page-${n}`, name: 'Mei' } })
	await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), ...changes(n) } })
	if (publish) await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
	return { page, n, handle: page.handle }
}

const htmlOf = async (path: string) => (await visit(path)).text()
const tap = (path: string) => call(path, { method: 'POST', headers: { 'user-agent': IPHONE } })
const statsOf = (id: string) => apiJson<StatsResponse>(`/stats?page=${id}&days=7`)

describe('the services', () => {
	it('each come with a name, our own icon, words for their buttons, and a panel on their own origin', () => {
		for (const provider of EMBED_PROVIDERS) {
			const service = EMBEDS[provider]
			expect(service.name.trim(), provider).not.toBe('')
			expect(Object.keys(ICONS), provider).toContain(service.icon)
			expect(EMBED_ACTIONS[service.action], provider).toBeDefined()
			for (const origin of service.origins) expect(origin, provider).toMatch(/^https:\/\/[a-z0-9.-]+$/)
			for (const address of [service.page('someone'), service.panel('someone')]) expect(service.origins, address).toContain(new URL(address).origin)
			expect(service.account(service.page('someone')), provider).toBe('someone')
		}
	})

	it('never take the name of another part of a page, which taps are filed under', () => {
		for (const part of [LINE_PART, LINK_PART, SOCIAL_PART, 'play', 'map', 'more']) expect(EMBED_PROVIDERS).not.toContain(part)
	})

	it('have their buttons worded in every language, with the service named where it is', () => {
		for (const provider of EMBED_PROVIDERS) {
			for (const locale of LOCALES) {
				const words = embedWords(provider, locale)
				expect(words.button.trim(), `${provider} ${locale}`).not.toBe('')
				expect(words.float.trim(), `${provider} ${locale}`).not.toBe('')
				expect(words.button).not.toContain('{name}')
			}
		}
		expect(embedWords('kofi', 'en')).toEqual({ button: 'Support me on Ko-fi', float: 'Support me' })
		expect(embedWords('calendly', 'en')).toEqual({ button: 'Pick a time', float: 'Book' })
	})
})

describe('a Ko-fi account', () => {
	const kofi = (input: string) => embedAccount({ provider: 'kofi', account: input })

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
		for (const input of pasted) expect(kofi(input), input).toBe('q_0t2')
	})

	it('is nobody’s in Ko-fi’s own addresses, other sites and anything else', () => {
		const wrong = ['', '  ', 'ko-fi.com', 'https://ko-fi.com/', 'https://ko-fi.com/s/abc123', 'https://ko-fi.com/post/hello', 'https://notko-fi.com/me', 'https://example.com/q_0t2', 'my ko-fi', 'a'.repeat(61)]
		for (const input of wrong) expect(kofi(input), input).toBeNull()
	})

	it('names the page, and the panel Ko-fi gives out for frames', () => {
		expect(EMBEDS.kofi.page('q_0t2')).toBe('https://ko-fi.com/q_0t2')
		expect(EMBEDS.kofi.panel('q_0t2')).toBe('https://ko-fi.com/q_0t2/?hidefeed=true&widget=true&embed=true&preview=true')
	})
})

describe('a Calendly account', () => {
	const calendly = (input: string) => embedAccount({ provider: 'calendly', account: input })

	it('is a name, or a name and an event, read out of the address or Calendly’s embed code', () => {
		const pasted: [string, string][] = [
			['mei', 'mei'],
			['mei/intro', 'mei/intro'],
			['calendly.com/mei', 'mei'],
			['https://calendly.com/mei/intro', 'mei/intro'],
			['https://calendly.com/mei/intro/', 'mei/intro'],
			['https://calendly.com/mei/intro?month=2026-11', 'mei/intro'],
			['https://calendly.com/d/abc-def-ghi/intro-call', 'd/abc-def-ghi/intro-call'],
			[
				'<!-- Calendly inline widget begin --><div class="calendly-inline-widget" data-url="https://calendly.com/mei/intro" style="min-width:320px;height:700px;"></div><script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js" async></script>',
				'mei/intro',
			],
			["<a href=\"\" onclick=\"Calendly.initPopupWidget({url: 'https://calendly.com/mei'});return false;\">Book</a>", 'mei'],
		]
		for (const [input, account] of pasted) expect(calendly(input), input).toBe(account)
	})

	it('is nobody’s in Calendly’s own addresses, other sites and anything else', () => {
		const wrong = ['', 'calendly.com', 'https://calendly.com/', 'https://calendly.com/app/login', 'https://calendly.com/d/abc', 'https://example.com/mei', 'a/b/c/d', 'mei intro', 'https://assets.calendly.com/assets/external/widget.js']
		for (const input of wrong) expect(calendly(input), input).toBeNull()
	})

	it('names the page, and the panel Calendly’s inline widget loads, with its cookie notice kept', () => {
		expect(EMBEDS.calendly.page('mei/intro')).toBe('https://calendly.com/mei/intro')
		expect(EMBEDS.calendly.panel('mei/intro')).toBe('https://calendly.com/mei/intro?embed_domain=1&embed_type=Inline')
		expect(EMBEDS.calendly.panel('mei')).not.toContain('hide_gdpr_banner')
	})
})

describe('an embed card', () => {
	it('starts out the way the guide shows it, titled for what its service does, and parses', () => {
		const item = newItem('embed')
		expect(item).toMatchObject({ kind: 'embed', provider: 'kofi', account: '', title: '請我喝杯咖啡', note: '', hidden: false })
		expect(newEmbed('calendly')).toMatchObject({ kind: 'embed', provider: 'calendly', title: '和我約個時間' })
		expect(ItemSchema.parse(item)).toEqual(item)
		expect(ItemSchema.safeParse({ ...item, provider: 'patreon' }).success).toBe(false)
		expect(PageContentSchema.safeParse({ ...emptyContent('Mei'), items: [item], embedButton: { provider: 'kofi', account: 'q_0t2' } }).success).toBe(true)
	})

	it('stops a publish until it has an account, unless it is hidden, and so does a button without one', () => {
		const content: PageContent = {
			...emptyContent('Mei'),
			items: [card(1, { account: '' }), card(2, { account: 'https://ko-fi.com/s/abc' }), card(3, { account: '', hidden: true }), card(4), card(5, { provider: 'calendly', account: 'https://calendly.com/app/login' })],
			embedButton: { provider: 'calendly', account: 'not an account' },
		}
		const problems = publishProblems(content, 'mei')
		expect(problems.map((problem) => problem.path)).toEqual(['items.0.account', 'items.1.account', 'items.4.account', 'embedButton.account'])
		expect(problems[3]).toMatchObject({ key: '右下角 {name} 按鈕找不到 {name} 帳號', message: 'The Calendly button at the bottom right has no valid Calendly account' })
		expect(problems[2]?.params).toEqual({ n: 5, name: 'Calendly' })
		expect(publishProblems({ ...content, items: [card(4)], embedButton: { provider: 'kofi', account: 'https://ko-fi.com/q_0t2' } }, 'mei')).toEqual([])
	})

	it('has its title and note translated, and its account kept as written', () => {
		const content: PageContent = {
			...emptyContent('Mei'),
			items: [card(1, { title: '請我喝杯咖啡', note: '謝謝你' })],
			translations: { en: { 請我喝杯咖啡: 'Buy me a coffee', 謝謝你: 'Thank you' } },
		}
		expect(pageTexts(content)).toEqual(expect.arrayContaining(['請我喝杯咖啡', '謝謝你']))
		expect(localizedContent(content, 'en').items[0]).toMatchObject({ title: 'Buy me a coffee', note: 'Thank you', account: 'q_0t2' })
	})

	it('shows the real address, opens the panel over the page, and counts the tap under its id and service', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [card(i, { note: 'Every coffee is a new video' })] }))
		const html = await htmlOf(`/${handle}?s=threads`)
		expect(html).toContain(`<a class="act main" href="https://ko-fi.com/q_0t2" ping="/_c/${handle}/embed-${n}/kofi?s=threads" data-sheet="sheet-1">Support me on Ko-fi</a>`)
		expect(html).toContain(`<h2 id="e-embed-${n}">Tip jar</h2><p class="note">Every coffee is a new video</p>`)
		expect(html).toContain(`<dialog class="sheet" id="sheet-1" aria-label="Ko-fi" style="--paper:#f9f9f9" autofocus>`)
		expect(html).toContain(`data-src="${KOFI_PANEL}"`)
		expect((await tap(`/_c/${handle}/embed-${n}/kofi`)).status).toBe(204)
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `embed-${n}.kofi`, count: 1, label: 'Ko-fi: Tip jar', kind: 'block' }])
		// Without JavaScript the browser goes straight there; through the Worker it goes to the account's page too.
		expect((await visit(`/_c/${handle}/embed-${n}/kofi`)).headers.get('location')).toBe('https://ko-fi.com/q_0t2')
		// A part that isn't the card's service goes back to the page.
		expect((await visit(`/_c/${handle}/embed-${n}/calendly`)).headers.get('location')).not.toMatch(/calendly|ko-fi/)
	})

	it('opens Calendly’s booking calendar the same way, worded for booking', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [{ ...newEmbed('calendly', `cal-${i}`), hidden: true }, card(i, { id: `cal-card-${i}`, provider: 'calendly', account: 'https://calendly.com/mei/intro', title: 'Book a call' })] }))
		const html = await htmlOf(`/${handle}`)
		expect(html).not.toContain(`id="e-cal-${n}"`)
		expect(html).toContain(`<a class="act main" href="https://calendly.com/mei/intro" ping="/_c/${handle}/cal-card-${n}/calendly" data-sheet="sheet-1">Pick a time</a>`)
		expect(html).toContain(`<dialog class="sheet" id="sheet-1" aria-label="Calendly" style="--paper:#ffffff" autofocus>`)
		expect(html).toContain(`<iframe title="Calendly" sandbox="${SHEET_SANDBOX}" allow="payment" data-src="${CALENDLY_PANEL}"></iframe>`)
		expect((await tap(`/_c/${handle}/cal-card-${n}/calendly`)).status).toBe(204)
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `cal-card-${n}.calendly`, label: 'Calendly: Book a call' }])
	})

	it('keeps its clicks under its own name once it is deleted, not the floating button’s', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [card(i)], embedButton: { provider: 'kofi', account: 'q_0t2' } }))
		await tap(`/_c/${handle}/embed-${n}/kofi`)
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), embedButton: { provider: 'kofi', account: 'q_0t2' } } })
		await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `embed-${n}.kofi`, label: '(deleted item)' }])
	})

	it('keeps the name of the service a tap was for when the card changes service', async () => {
		const { page, handle, n } = await makePage((i) => ({ items: [card(i)] }))
		await tap(`/_c/${handle}/embed-${n}/kofi`)
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), items: [card(n, { provider: 'calendly', account: 'mei' })] } })
		await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `embed-${n}.kofi`, label: 'Ko-fi: Tip jar' }])
	})

	it('isn’t on the page without an account, and shows unfinished in a preview', async () => {
		const { page, handle } = await makePage((i) => ({ items: [card(i, { account: '' })] }), false)
		const refused = await api(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(refused.status).toBe(400)
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		const preview = await htmlOf(new URL(url).pathname)
		expect(preview).toContain('<span class="act main todo">')
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...emptyContent('Mei'), items: [card(1, { account: '', hidden: true })] } })
		await apiJson<PublishResponse>(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(await htmlOf(`/${handle}`)).not.toContain('class="panel embed"')
	})
})

describe('the floating embed button', () => {
	it('isn’t there unless the owner adds it', async () => {
		const { handle } = await makePage(() => ({}))
		const html = await htmlOf(`/${handle}`)
		expect(html).not.toContain('embed-button')
		expect(html).not.toContain('<dialog')
		expect(html).not.toContain(SHEET_SCRIPT)
	})

	it('floats on the page, opens the same panel, and counts a tap under the page and its service', async () => {
		const { page, handle } = await makePage(() => ({ embedButton: { provider: 'kofi', account: 'https://ko-fi.com/q_0t2' } }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain(`<a class="embed-button" href="https://ko-fi.com/q_0t2" ping="/_c/${handle}/page/kofi" data-sheet="sheet-1" aria-label="Support me on Ko-fi">`)
		expect(html).toContain('<span>Support me</span></a>')
		expect(html).toContain('<body class="has-embed">')
		expect((await tap(`/_c/${handle}/page/kofi`)).status).toBe(204)
		expect((await statsOf(page.id)).topLinks).toMatchObject([{ target: `${page.id}.kofi`, count: 1, label: 'Ko-fi button' }])
	})

	it('shares one sheet with a card for the same account, and has its own for another', async () => {
		const same = await makePage((i) => ({ items: [card(i)], embedButton: { provider: 'kofi', account: 'q_0t2' } }))
		const one = await htmlOf(`/${same.handle}`)
		expect(one.match(/<dialog/g)).toHaveLength(1)
		expect(one.match(/data-sheet="sheet-1"/g)).toHaveLength(2)
		const other = await makePage((i) => ({ items: [card(i)], embedButton: { provider: 'calendly', account: 'mei/intro' } }))
		const two = await htmlOf(`/${other.handle}`)
		expect(two.match(/<dialog/g)).toHaveLength(2)
		expect(two).toContain(`<a class="embed-button" href="https://calendly.com/mei/intro" ping="/_c/${other.handle}/page/calendly" data-sheet="sheet-2" aria-label="Pick a time">`)
		expect(two.match(/<script>/g)).toHaveLength(2)
	})

	it('sits above the LINE button when both are on', async () => {
		const { handle } = await makePage(() => ({ embedButton: { provider: 'kofi', account: 'q_0t2' }, lineButton: 'https://lin.ee/abc' }))
		const html = await htmlOf(`/${handle}`)
		expect(html).toContain('<body class="has-line has-embed">')
		expect(html).toContain('.has-line .embed-button{bottom:calc(84px')
		expect(html).toContain('.has-embed.has-line main{padding-bottom:calc(148px + env(safe-area-inset-bottom))}')
	})

	it('goes nowhere when the account makes no sense, and an empty one is no button', async () => {
		const { page } = await makePage(() => ({ embedButton: { provider: 'kofi', account: 'not a page' } }), false)
		expect((await api(`/pages/${page.id}/publish`, { method: 'POST' })).status).toBe(400)
		const { handle } = await makePage(() => ({ embedButton: { provider: 'kofi', account: '  ' } }))
		const html = await htmlOf(`/${handle}`)
		expect(html).not.toContain('embed-button')
		expect(html).not.toContain('<dialog')
		expect((await tap(`/_c/${handle}/page/kofi`)).status).toBe(204)
		expect((await visit(`/_c/${handle}/page/kofi`)).headers.get('location')).not.toContain('ko-fi')
	})

	it('turns round in a language written right to left, and speaks it', () => {
		const content: PageContent = { ...emptyContent('Mei'), items: [card(1, { provider: 'calendly', account: 'mei' })], embedButton: { provider: 'kofi', account: 'q_0t2' } }
		const html = renderBioPage(content, { mode: 'live', locale: 'ar', mediaUrl: (id) => `/media/${id}`, blockHref: (item, part) => `/_c/mei/${item.id}/${part}` })
		expect(html).toContain('<html lang="ar" dir="rtl">')
		expect(html).toContain('>اختر موعدًا</a>')
		expect(html).toContain('<span>ادعمني</span>')
		expect(html).toContain('aria-label="ادعمني على Ko-fi"')
		// The side follows the page's direction: logical properties only (tests/rtl.test.ts holds render.ts to that).
		expect(html).toMatch(/\.embed-button\{position:fixed;inset-inline-end:16px/)
	})
})

describe('a page with an embed on it', () => {
	it('loads nothing from the service before a tap: no script, no picture, and frames with no address', async () => {
		const { handle } = await makePage((i) => ({ items: [card(i), card(i + 1000, { provider: 'calendly', account: 'mei/intro' })], embedButton: { provider: 'kofi', account: 'q_0t2' } }))
		const html = await htmlOf(`/${handle}`)
		expect(html.match(/<iframe [^>]*><\/iframe>/g)).toEqual([
			`<iframe title="Ko-fi" sandbox="${SHEET_SANDBOX}" allow="payment" data-src="${KOFI_PANEL}"></iframe>`,
			`<iframe title="Calendly" sandbox="${SHEET_SANDBOX}" allow="payment" data-src="${CALENDLY_PANEL}"></iframe>`,
		])
		expect(html).not.toMatch(/<iframe[^>]* src=/)
		expect(html).not.toMatch(/<script[^>]* src=/)
		expect(html).not.toMatch(/kofiWidgetOverlay|overlay-widget|storage\.ko-fi\.com|assets\.calendly\.com|widget\.js/)
		// A service is only ever named where a tap goes: a link's address and a frame's address-to-be.
		const outsideLinks = html.replace(/ (?:href|data-src)="[^"]*"/g, '')
		expect(outsideLinks).not.toMatch(/ko-fi\.com|calendly\.com/i)
		expect(html.match(/ko-fi\.com/g)).toHaveLength(3)
		expect(html.match(/calendly\.com/g)).toHaveLength(2)
	})

	it('runs only its two scripts, which the CSP allows by their hashes, and may frame only its own services', async () => {
		const { handle } = await makePage((i) => ({ items: [card(i)] }))
		const response = await visit(`/${handle}`)
		const html = await response.text()
		expect(html.match(/<script/g)).toHaveLength(2)
		expect(html).toContain(`<script>${TAP_SCRIPT}</script><script>${SHEET_SCRIPT}</script>`)
		const csp = response.headers.get('content-security-policy') ?? ''
		expect(csp).toContain(`script-src '${TAP_SCRIPT_HASH}' '${SHEET_SCRIPT_HASH}';`)
		expect(csp).toMatch(/frame-src [^;]*https:\/\/ko-fi\.com/)
		expect(csp).not.toContain('calendly.com')
		expect(csp).not.toMatch(/script-src [^;]*(unsafe-inline|ko-fi)/)

		const booking = await makePage(() => ({ embedButton: { provider: 'calendly', account: 'mei' } }))
		const bookingCsp = (await visit(`/${booking.handle}`)).headers.get('content-security-policy') ?? ''
		expect(bookingCsp).toMatch(/frame-src [^;]*https:\/\/calendly\.com/)
		expect(bookingCsp).not.toContain('ko-fi.com')
	})

	it('names no service in the CSP of a page without one, nor the script that opens a panel', async () => {
		const { handle } = await makePage((i) => ({ items: [card(i, { account: '', hidden: true })] }))
		const csp = (await visit(`/${handle}`)).headers.get('content-security-policy') ?? ''
		expect(csp).not.toMatch(/ko-fi|calendly/)
		expect(csp).not.toContain(SHEET_SCRIPT_HASH)
		for (const provider of EMBED_PROVIDERS) for (const origin of EMBEDS[provider].origins) expect(csp).not.toContain(origin)
	})

	it('has the hash of exactly the script it sends', async () => {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SHEET_SCRIPT))
		expect(`sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`).toBe(SHEET_SCRIPT_HASH)
	})

	it('leaves a new tab, or a browser without the script, to follow the link', () => {
		expect(SHEET_SCRIPT).toContain('if(!f||!d.showModal)return')
		expect(SHEET_SCRIPT).toContain('if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault()')
		expect(SHEET_SCRIPT).toContain("if(!f.getAttribute('src'))f.setAttribute('src',f.getAttribute('data-src'))")
	})

	it('opens the service in a new tab from a preview, where no script runs and nothing is counted', async () => {
		const { page } = await makePage((i) => ({ items: [card(i)], embedButton: { provider: 'calendly', account: 'mei' } }), false)
		const { url } = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		const html = await htmlOf(new URL(url).pathname)
		expect(html).toContain('<a class="act main" href="https://ko-fi.com/q_0t2" target="_blank" rel="noopener noreferrer">')
		expect(html).toContain('<a class="embed-button" href="https://calendly.com/mei" target="_blank" rel="noopener noreferrer"')
		expect(html).not.toContain('data-sheet')
		expect(html).not.toContain('ping=')
		expect(html).not.toContain('<dialog')
	})

	it('draws its card in every theme from the theme’s own colors', () => {
		for (const provider of EMBED_PROVIDERS as readonly EmbedProvider[]) {
			const html = renderBioPage({ ...emptyContent('Mei'), items: [card(1, { provider, account: 'someone' })] }, { mode: 'preview', mediaUrl: (id) => `/media/${id}` })
			expect(html).toContain(`<section class="panel embed" aria-labelledby="e-embed-1">`)
			expect(html).toMatch(/\.embed-icon\{[^}]*color:var\(--accent-text\);background:color-mix\(in srgb,var\(--accent\) 16%,transparent\)\}/)
		}
	})
})
