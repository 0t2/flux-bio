import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateTokenResponse, MediaListResponse, PageJson } from '../src/shared/api'
import { mediaIdsOf } from '../src/shared/backup'
import { CommunityThemeSchema } from '../src/shared/community'
import {
	appearanceFromPreset,
	defaultAppearance,
	emptyContent,
	emptyLink,
	newItem,
	PageContentInputSchema,
	PageContentSchema,
	presetFromAppearance,
	samePreset,
	THEME_IDS,
	ThemePresetInputSchema,
	type PageContent,
} from '../src/shared/content'
import { CSS_LIMIT, cssProblem } from '../src/shared/css'
import { publishProblems } from '../src/shared/validate'
import { fill } from '../src/templates/msg'
import { renderBioPage } from '../src/templates/render'
import { resolveAppearance } from '../src/templates/themes'
import { guideNames } from '../src/worker/lib/agent'
import { guideTopic } from '../src/worker/lib/agentTopics'
import { api, apiJson, call, ORIGIN, visit } from './helpers'

// A page of links can carry CSS of its own (appearance.css), written by the owner's AI against the page's markup. The
// public page shares an address with the dashboard, so the CSS may neither end its <style> nor load anything but this
// site's pictures, and the markup it is written against changes only on purpose.

/** The problem's text in English, as the API says it. */
const problemOf = (css: string): string | null => {
	const problem = cssProblem(css)
	return problem ? fill(problem.key, problem.params) : null
}

describe('the CSS check', () => {
	it('lets through what a look needs', () => {
		const fine = [
			'',
			'.link{border:2px dashed var(--fg);border-radius:0;box-shadow:none}',
			'.page-bg{background:url(/media/abc123DEF456.png) repeat;background-size:48px}',
			"body{background-image:url('/media/a-b_c.webp')}",
			'body{background:url( "/media/pattern.v2.avif" ) center/64px}',
			'.link .go::after{content:"\\2192";font-family:var(--head-font)}',
			'@media (min-width:600px){main{max-width:560px}}',
			'@supports (backdrop-filter:blur(4px)){.link{backdrop-filter:blur(4px)}}',
			'@keyframes pop{from{transform:scale(.96)}to{transform:none}}@-webkit-keyframes pop{to{opacity:1}}',
			'@layer mine{.sep{letter-spacing:.2em}}',
			'@container (min-width:400px){.grid{gap:20px}}',
			'@property --tilt{syntax:"\\3c angle>";inherits:false;initial-value:0deg}',
			'@scope (.items){:scope>.link{margin-inline-start:8px}}',
			'@starting-style{.link{opacity:0}}',
			'[dir=rtl] .link{padding-inline-start:24px}',
			'.items{& .link:nth-child(2n+1){background:color-mix(in oklab,var(--accent) 20%,var(--card-bg))}}',
			':is(.link,.product):hover{transform:translateY(-2px) rotate(-1deg)}',
			'main{background:repeating-linear-gradient(45deg,var(--bg) 0 10px,var(--panel) 10px 20px)}',
			'.avatar::after{content:attr(aria-label)}',
			'.bio::before{content:"Note: open daily"}',
			'/* url(https://example.com) is only a comment here */ .link{color:var(--fg)}',
			'.link{transition:transform .2s cubic-bezier(.2,.8,.2,1)!important}',
			// A string that reads like a function is only text.
			'.bio::after{content:"url(https://example.com)"}',
			// An escaped quote keeps the string going, as it does in a browser: all of this is one string, and loads nothing.
			'.a{content:"\\"} .b{background:url(https://evil.example/x.png)}"}',
		]
		for (const css of fine) expect(problemOf(css), css).toBeNull()
	})

	it('refuses anything that could end the <style>', () => {
		for (const css of ['</style><script>alert(1)</script>', '.a{color:red}</STYLE >', '.a::after{content:"<"}', '<!-- .a{} -->']) {
			expect(problemOf(css), css).toMatch(/can't contain “<”/)
		}
	})

	it('loads nothing but this site’s own pictures', () => {
		const refused = [
			'body{background:url(https://evil.example/x.png)}',
			'body{background:url("https://evil.example/x.png")}',
			"body{background:url('http://evil.example/x.png')}",
			'body{background:url(//evil.example/x.png)}',
			'body{background:URL(https://evil.example/x.png)}',
			'body{background:uRl( https://evil.example/x.png )}',
			'body{background:url(data:image/png;base64,iVBORw0KGgo=)}',
			"body{background:url('javascript:alert(1)')}",
			// Other addresses on this site count clicks and views, or answer as the owner.
			'body{background:url(/api/state)}',
			'body{background:url(/shop)}',
			'body{background:url(/_c/mei/link-1/link)}',
			'body{background:url(/media/../api/state)}',
			'body{background:url(/media/..)}',
			'body{background:url(/media/.)}',
			'body{background:url(/media/a.png?x=1)}',
			'body{background:url(media/a.png)}',
			'body{background:url(#filter)}',
			'body{background:url()}',
			'body{background:url("")}',
			// Escapes are decoded first, as a browser does.
			'body{background:u\\72l(https://evil.example/x.png)}',
			'body{background:\\75 rl(https://evil.example/x.png)}',
			'body{background:\\000075rl(https://evil.example/x.png)}',
			'body{background:ur\\l(https://evil.example/x.png)}',
			'body{background:\\55\\52\\4c(https://evil.example/x.png)}',
			'body{background:url(https\\3a //evil.example/x.png)}',
			// A picture's address is written out plainly, so backups can find it.
			'body{background:url(/media/a\\.png)}',
			'body{background:url("/media/a\\2e png")}',
			// Comments are taken out and the rest read again.
			'body{background:ur/**/l(https://evil.example/x.png)}',
			'body{background:u/* a */r/* b */l(https://evil.example/x.png)}',
			// A comment can't start inside a string and hide what follows.
			'.a{content:"/*"} .b{background:url(https://evil.example/x.png)} .c{content:"*/"}',
			".a{content:'/*'} .b{background:url(https://evil.example/x.png)} .c{content:'*/'}",
			// Every other way to load something.
			'body{background:image-set("https://evil.example/x.png" 1x)}',
			'body{background:-webkit-image-set(url(https://evil.example/x.png) 1x)}',
			'body{background:image-set("/media/a.png" 1x)}',
			'body{background:image("/media/a.png")}',
			'body{background:src("/media/a.png")}',
			'body{background:cross-fade(url(/media/a.png),url(/media/b.png),50%)}',
			'body{background:-webkit-cross-fade(url(/media/a.png),url(/media/b.png),50%)}',
			'body{background:-moz-element(#avatar)}',
			'body{background:paint(sparkle)}',
			'.link{cursor:url(https://evil.example/c.cur),auto}',
			'.link{mask:url(https://evil.example/m.svg#m)}',
			'.link{filter:url(https://evil.example/f.svg#f)}',
			'.link{list-style:url(https://evil.example/x.png)}',
			'.link::before{content:url(https://evil.example/x.png)}',
			'.link{border-image:url(https://evil.example/x.png) 30}',
			'@counter-style x{system:cyclic;symbols:url(https://evil.example/x.png)}',
			// Strings that look like addresses, which a function could load through a variable.
			':root{--picture:"https://evil.example/x.png"}',
			":root{--picture:'//evil.example/x.png'}",
			':root{--picture:"data:image/png;base64,iVBORw0KGgo="}',
			'.a::after{content:"javascript:alert(1)"}',
			'.a::after{content:"java\\9script:alert(1)"}',
			'.a::after{content:"\\6a avascript:alert(1)"}',
			'.a::after{content:"  JavaScript:alert(1)"}',
		]
		for (const css of refused) expect(problemOf(css), css).not.toBeNull()
		expect(problemOf('body{background:url(https://evil.example/x.png)}')).toBe(
			'Line 1: url() can only use a picture uploaded to this site, written as url(/media/<id>), not https://evil.example/x.png',
		)
	})

	it('refuses at-rules that load or change how the rest is read', () => {
		const refused = [
			'@import url(/media/a.css);',
			'@import "https://evil.example/x.css";',
			'@\\69mport "https://evil.example/x.css";',
			'@IMPORT "x.css";',
			'@font-face{font-family:Mine;src:url(/media/a.woff2)}',
			'@namespace svg url(http://www.w3.org/2000/svg);',
			'@charset "utf-8";',
			'@-moz-document url-prefix(){.a{color:red}}',
			'@document domain(example.com){.a{color:red}}',
			'@im/**/port "x.css";',
			'.a{color:red} @font-feature-values Font{@swash{fancy:1}}',
		]
		for (const css of refused) expect(problemOf(css), css).toMatch(/CSS can't use @/)
	})

	it('refuses the script hooks of old browsers', () => {
		for (const css of ['.a{width:expression(alert(1))}', '.a{behavior:url(/media/x.htc)}', '.a{-ms-behavior:url(/media/x.htc)}', '.a{-moz-binding:url(/media/x.xml#x)}', '.a{BEHAVIOR:none}']) {
			expect(problemOf(css), css).toMatch(/CSS can't use/)
		}
	})

	it('refuses what a browser would read differently from the check', () => {
		expect(problemOf('.a{content:"open')).toMatch(/string is missing its closing quote/)
		expect(problemOf('.a{content:"line\n} .b{background:url(https://evil.example/x.png)}"}')).toMatch(/^Line 1: a string/)
		expect(problemOf('.a{color:red} /* never closed')).toMatch(/comment is missing/)
		expect(problemOf('.a{background:url(/media/a.png')).toMatch(/url\(\) isn't written correctly/)
		expect(problemOf('.a{background:url(/media/a b.png)}')).toMatch(/url\(\) isn't written correctly/)
		expect(problemOf('.a{background:url(/media/a"b.png)}')).toMatch(/url\(\) isn't written correctly/)
		expect(problemOf('.a{background:url("/media/a.png" x)}')).toMatch(/url\(\) isn't written correctly/)
		expect(problemOf('.a{color:red')).toBe('The bracket opened on line 1 is missing its closing “}”')
		expect(problemOf('.a{color:red}}')).toBe('Line 1: nothing opens this “}”')
		expect(problemOf('.a{width:calc(1px + 2px}')).toMatch(/nothing opens this “}”/)
		// Taking a comment out mustn't make another.
		expect(problemOf('.a{color:red} //**/* x */')).toMatch(/comment runs into/)
	})

	it('says on which line', () => {
		expect(problemOf('.a{color:red}\n\n.b{background:url(https://evil.example/x.png)}')).toMatch(/^Line 3:/)
		expect(problemOf('.a{color:red}\r\n.b{content:"<"}')).toMatch(/^Line 2:/)
	})

	it('reads the longest CSS a page may have, comments and all', () => {
		// Time doesn't move inside the Workers runtime while code runs, so this checks the result, not the speed: the check is
		// one pass over the text, and one more without its comments.
		const rule = '/* a row */ .items>.link:nth-child(3n+1){background:url(/media/abcdefghijkl.webp) center/48px;content:"\\2192"}\n'
		const css = rule.repeat(Math.floor(CSS_LIMIT / rule.length))
		expect(css.length).toBeGreaterThan(CSS_LIMIT - rule.length)
		expect(cssProblem(css)).toBeNull()
		expect(cssProblem(`${css}.x{background:url(https://evil.example/x.png)}`)).not.toBeNull()
	})
})

describe('CSS in the page content', () => {
	it('is part of an appearance, empty by default', () => {
		expect(defaultAppearance().css).toBe('')
		const content = emptyContent('Mei')
		const { css: _css, ...withoutCss } = content.appearance
		expect(PageContentSchema.parse({ ...content, appearance: withoutCss }).appearance.css).toBe('')
		const parsed = PageContentSchema.safeParse({ ...content, appearance: { ...content.appearance, css: 'x'.repeat(CSS_LIMIT + 1) } })
		expect(parsed.success).toBe(false)
	})

	it('is checked where it comes in and when it is published, not each time it is read back', () => {
		const content = emptyContent('Mei')
		const bad = { ...content, appearance: { ...content.appearance, css: '.a{background:url(https://evil.example/x.png)}' } }
		// Reading pages back from D1 happens for many at once, so it doesn't check again: what is stored came in through these.
		expect(PageContentSchema.safeParse(bad).success).toBe(true)
		const coming = PageContentInputSchema.safeParse(bad)
		expect(coming.success).toBe(false)
		expect(coming.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['appearance.css'])
		expect(publishProblems(bad, 'mei').map((problem) => [problem.path, problem.message])).toEqual([
			['appearance.css', 'Line 1: url() can only use a picture uploaded to this site, written as url(/media/<id>), not https://evil.example/x.png'],
		])
		expect(ThemePresetInputSchema.safeParse({ ...presetFromAppearance('Bad', bad.appearance) }).success).toBe(false)
		const fine = { ...content, appearance: { ...content.appearance, css: '.link{border-style:dashed}' } }
		expect(PageContentInputSchema.parse(fine).appearance.css).toBe('.link{border-style:dashed}')
		expect(publishProblems(fine, 'mei')).toEqual([])
	})

	it('travels with a saved look, and not with a color set', () => {
		const appearance = { ...defaultAppearance(), theme: 'minimal' as const, css: '.link{border:2px dashed var(--fg)}' }
		const preset = presetFromAppearance('Dashed', appearance)
		expect(preset.css).toBe(appearance.css)
		expect(samePreset(preset, appearance)).toBe(true)
		expect(samePreset(preset, { ...appearance, css: '' })).toBe(false)
		expect(appearanceFromPreset(preset, defaultAppearance()).css).toBe(appearance.css)
		// A look without CSS takes it away, and the dashboard asks first.
		expect(appearanceFromPreset({ ...preset, css: undefined }, appearance).css).toBe('')
		expect(presetFromAppearance('Plain', defaultAppearance())).not.toHaveProperty('css')
		expect(CommunityThemeSchema.parse({ ...preset, id: 'dashed' })).not.toHaveProperty('css')
	})

	it('counts its pictures as used, for backups', () => {
		const content = emptyContent('Mei')
		const css = '.page-bg{background:url(/media/tile00000001.png)} .link{background:url("/media/tile00000002.webp")}'
		expect(mediaIdsOf({ ...content, appearance: { ...content.appearance, css } }).sort()).toEqual(['tile00000001.png', 'tile00000002.webp'])
	})
})

describe('CSS on the page', () => {
	const content = (css: string): PageContent => {
		const base = emptyContent('Mei')
		return { ...base, appearance: { ...base.appearance, css }, items: [{ ...emptyLink(), id: 'css-link', title: 'Shop', url: 'https://shop.example', slug: 'shop' }] }
	}

	it('comes after the theme, in a sheet of its own', () => {
		const html = renderBioPage(content('.link{border:2px dashed var(--fg)}'), { mode: 'live', mediaUrl: (id) => `/media/${id}` })
		const sheets = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1])
		expect(sheets.at(-1)).toBe('.link{border:2px dashed var(--fg)}')
		expect(sheets.length).toBeGreaterThan(1)
		expect(html.indexOf('.link{border:2px dashed')).toBeLessThan(html.indexOf('</head>'))
	})

	it('is left out when there is none, or when it could end its <style>', () => {
		const sheets = (css: string) => renderBioPage(content(css), { mode: 'preview', mediaUrl: (id) => `/media/${id}` }).match(/<style>/g)?.length
		expect(sheets('')).toBe(sheets('  '))
		// Never saved like this; checked again anyway, on the one thing that matters in HTML.
		expect(sheets('</style><script>alert(1)</script>')).toBe(sheets(''))
	})
})

describe('CSS through the API', () => {
	let page: PageJson
	const CSS = '.link{border:2px dashed var(--fg);border-radius:0}\n.page-bg{background:url(/media/apitile0001.png)}'

	beforeAll(async () => {
		page = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'css-page', name: 'Mei' } })).page
	})

	const draft = (css: string): PageContent => ({
		...page.draft,
		appearance: { ...page.draft.appearance, css },
		items: [{ ...emptyLink(), id: 'css-shop', title: 'Shop', url: 'https://shop.example', slug: 'css-shop' }],
	})

	it('saves, publishes and shows it, with a policy that loads pictures only from this site', async () => {
		expect((await api(`/pages/${page.id}/draft`, { method: 'PUT', json: draft(CSS) })).status).toBe(200)
		expect((await apiJson<{ page: PageJson }>(`/pages/${page.id}`)).page.draft.appearance.css).toBe(CSS)
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		const response = await visit('/css-page')
		const html = await response.text()
		expect(html).toContain(`<style>${CSS}</style>`)
		const policy = response.headers.get('content-security-policy') ?? ''
		expect(policy).toContain("img-src 'self';")
		expect(policy).not.toMatch(/img-src[^;]*(https:|data:)/)
		const preview = await api(`/pages/${page.id}/preview`)
		expect(await preview.text()).toContain(CSS)
		expect(preview.headers.get('content-security-policy')).toContain("img-src 'self';")
	})

	it('refuses CSS that loads from elsewhere, and says why in English', async () => {
		const response = await api(`/pages/${page.id}/draft`, { method: 'PUT', json: draft('.link{border:1px solid}\n.page-bg{background:url(https://evil.example/x.png)}') })
		expect(response.status).toBe(400)
		const body = (await response.json()) as { error: string; problems: { path: string; message: string; key?: string; params?: Record<string, unknown> }[] }
		expect(body.error).toBe('invalid')
		expect(body.problems).toEqual([
			{
				path: 'appearance.css',
				message: 'Line 2: url() can only use a picture uploaded to this site, written as url(/media/<id>), not https://evil.example/x.png',
				key: cssProblem('\n.page-bg{background:url(https://evil.example/x.png)}')!.key,
				params: { line: 2, url: 'https://evil.example/x.png' },
			},
		])
		expect((await apiJson<{ page: PageJson }>(`/pages/${page.id}`)).page.draft.appearance.css).toBe(CSS)
	})

	it('lets a YouTube thumbnail through on a page with a YouTube video, and nothing more', async () => {
		const video = { ...newItem('video'), id: 'css-video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
		await apiJson(`/pages/${page.id}/draft`, { method: 'PUT', json: { ...draft(CSS), items: [video] } })
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
		const policy = (await visit('/css-page')).headers.get('content-security-policy') ?? ''
		expect(policy).toContain("img-src 'self' https://i.ytimg.com;")
		const link = await apiJson<{ url: string }>(`/pages/${page.id}/preview-link`, { method: 'POST' })
		expect((await call(new URL(link.url).pathname)).headers.get('content-security-policy')).toContain("img-src 'self' https://i.ytimg.com;")
	})

	it('keeps it off system pages, which have markup of their own', async () => {
		await apiJson('/settings', { method: 'PUT', json: { home: page.id } })
		const missing = await visit('/no-such-page-here')
		expect(missing.status).toBe(404)
		expect(await missing.text()).not.toContain('dashed var(--fg)')
	})

	it('goes with a saved look, checked the same way', async () => {
		const saved = await apiJson<{ theme: { id: string; css?: string } }>('/themes', { method: 'POST', json: { name: 'Dashed', base: 'minimal', accent: '', font: 'auto', button: 'auto', css: CSS } })
		expect(saved.theme.css).toBe(CSS)
		const refused = await api('/themes', { method: 'POST', json: { name: 'Bad', base: 'minimal', accent: '', font: 'auto', button: 'auto', css: '@import "https://evil.example/x.css";' } })
		expect(refused.status).toBe(400)
		const backup = await apiJson<{ media: string[] }>('/export')
		expect(backup.media).toContain('apitile0001.png')
	})

	it('counts a picture only its CSS uses as used', async () => {
		const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
		const old = { type: 'image/png', at: Date.now() - 30 * 86_400_000 }
		await env.KV.put('media:apitile0001.png', PNG, { metadata: old })
		await env.KV.put('media:nobodyuses01.png', PNG, { metadata: old })
		const { unused } = await apiJson<{ unused: string[] }>('/media/unused')
		expect(unused).toContain('nobodyuses01.png')
		expect(unused).not.toContain('apitile0001.png')
	})

	it("won't publish a draft whose CSS the check refuses now", async () => {
		// As a draft saved under an older, looser check would be.
		const { page: before } = await apiJson<{ page: PageJson }>(`/pages/${page.id}`)
		const stale = { ...before.draft, appearance: { ...before.draft.appearance, css: '@import "https://evil.example/x.css";' } }
		await env.DB.prepare('UPDATE pages SET draft = ?1 WHERE id = ?2').bind(JSON.stringify(stale), page.id).run()
		const response = await api(`/pages/${page.id}/publish`, { method: 'POST' })
		expect(response.status).toBe(400)
		expect(((await response.json()) as { problems: { path: string }[] }).problems.map((problem) => problem.path)).toEqual(['appearance.css'])
		expect(await (await visit('/css-page')).text()).not.toContain('@import')
		await env.DB.prepare('UPDATE pages SET draft = ?1 WHERE id = ?2').bind(JSON.stringify(before.draft), page.id).run()
	})

	it('refuses a backup whose CSS would be refused', async () => {
		const backup = await apiJson<{ pages: { draft: PageContent }[] }>('/export')
		const bad = structuredClone(backup)
		bad.pages[0]!.draft.appearance.css = '.a{background:url(https://evil.example/x.png)}'
		expect((await api('/import', { method: 'POST', json: bad })).status).toBe(400)
	})
})

describe('the list of uploaded pictures', () => {
	const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))
	const upload = async () => {
		const response = await api('/media', { method: 'POST', body: PIXEL, headers: { 'content-type': 'image/png' } })
		expect(response.status).toBe(201)
		return ((await response.json()) as { id: string }).id
	}

	it('lists every upload with its type, size and date, a page at a time', async () => {
		const before = Date.now()
		const ids = [await upload(), await upload()]
		const all = await apiJson<MediaListResponse>('/media')
		for (const id of ids) {
			expect(all.media).toContainEqual({ id, url: `/media/${id}`, type: 'image/png', size: PIXEL.byteLength, uploadedAt: expect.any(Number) })
		}
		expect(all.media.find((entry) => entry.id === ids[0])!.uploadedAt).toBeGreaterThanOrEqual(before)
		expect(all.nextCursor).toBeNull()

		const seen: string[] = []
		let cursor: string | null = null
		do {
			const page: MediaListResponse = await apiJson<MediaListResponse>(`/media?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
			expect(page.media.length).toBeLessThanOrEqual(1)
			seen.push(...page.media.map((entry) => entry.id))
			cursor = page.nextCursor
		} while (cursor)
		expect(seen.sort()).toEqual(all.media.map((entry) => entry.id).sort())
	})

	it('says nothing of a size it never kept', async () => {
		await env.KV.put('media:oldupload001.png', PIXEL, { metadata: { type: 'image/png' } })
		const { media } = await apiJson<MediaListResponse>('/media')
		expect(media).toContainEqual({ id: 'oldupload001.png', url: '/media/oldupload001.png', type: 'image/png', size: null, uploadedAt: null })
	})

	it('needs a full token, and a sensible query', async () => {
		const { token } = await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'links only', scope: 'links' } })
		expect((await api('/media', { bearer: token })).status).toBe(403)
		expect((await api('/media?limit=0')).status).toBe(400)
		expect((await api('/media?limit=5000')).status).toBe(400)
	})
})

describe('the markup CSS is written against', () => {
	/** A page with one of everything, so every class a page can have is on it. */
	function everything(): PageContent {
		const base = emptyContent('Mei Lin')
		const link = (id: string, extra: Partial<ReturnType<typeof emptyLink>>) => ({ ...emptyLink(), id, title: 'Shop', url: 'https://shop.example', slug: id, ...extra })
		const image = (id: string, url = '') => ({ id, image: `${id}.webp`, alt: '', url })
		const product = (id: string, url = '') => ({ id, name: 'Beans', price: 'NT$ 160', image: `${id}.webp`, url })
		return {
			...base,
			profile: { name: 'Mei Lin', bio: 'Coffee', avatar: 'avatar000001.webp' },
			appearance: { ...base.appearance, coverImage: 'cover0000001.webp', bgImage: 'backdrop0001.webp' },
			socials: [{ id: 'social-ig', platform: 'instagram', url: 'https://instagram.com/mei' }],
			items: [
				link('link-plain', { subtitle: 'New beans', icon: 'shop' }),
				link('link-featured', { featured: true }),
				link('link-unfinished', { url: '' }),
				{ ...newItem('heading'), id: 'heading-1', title: 'More' },
				{ ...newItem('video'), id: 'video-1', title: 'Tour', url: 'https://youtu.be/dQw4w9WgXcQ' },
				{ ...newItem('gallery'), id: 'gallery-many', title: 'Photos', images: [image('photo-1', 'https://example.com'), image('photo-2')] },
				{ ...newItem('gallery'), id: 'gallery-one', images: [image('photo-3')] },
				{ ...newItem('product'), id: 'product-many', title: 'Beans', products: [product('bean-1', 'https://shop.example/1'), product('bean-2')], moreUrl: 'https://shop.example' },
				{ ...newItem('product'), id: 'product-one', products: [product('bean-3')] },
				{ ...newItem('hours'), id: 'hours-full', address: '1 Main St', phone: '02 1234 5678', note: 'Closed on holidays' },
				{ ...newItem('hours'), id: 'hours-short', address: '2 Main St', phone: '', showMap: false },
			] as PageContent['items'],
			lineButton: '@mei',
		}
	}

	function classesOn(html: string): Set<string> {
		const found = new Set<string>()
		for (const match of html.matchAll(/\bclass="([^"]*)"/g)) for (const name of match[1]!.split(/\s+/)) if (name) found.add(name)
		return found
	}

	it('has the class names the customize guide promises, and only those', () => {
		const media = (id: string) => `/media/${id}`
		// A Tuesday and a Monday at noon: open, and closed all day.
		const open = Date.UTC(2026, 10, 3, 12)
		const closed = Date.UTC(2026, 10, 2, 12)
		const pages = [
			renderBioPage(everything(), { mode: 'live', mediaUrl: media, linkHref: (item) => `/${item.slug}`, blockHref: (item, part) => `/_c/mei/${item.id}/${part}`, now: open }),
			renderBioPage(everything(), { mode: 'preview', mediaUrl: media, now: closed, draft: { nonce: 'n', versionUrl: '/v', version: 1 } }),
			renderBioPage({ ...everything(), appearance: { ...everything().appearance, theme: 'rail' }, items: everything().items.slice(0, 3) }, { mode: 'live', mediaUrl: media, locale: 'ar', now: open }),
		]
		const found = new Set(pages.flatMap((html) => [...classesOn(html)]))
		const promised = [
			'act', 'acts', 'addr', 'avatar', 'badge', 'bio', 'block-title', 'cap', 'closed', 'cover', 'draft-note', 'feat', 'frame', 'gallery', 'go',
			'grid', 'has-line', 'head', 'hint-line', 'hours', 'info', 'items', 'line-button', 'link', 'main', 'map', 'more', 'note', 'off', 'one',
			'open-pill', 'page-bg', 'panel', 'ph', 'price', 'product', 'products', 'sep', 'single', 'slide', 'socials', 't', 'today', 'todo', 'track', 'video',
		]
		// If this fails, a page's markup changed: CSS an AI wrote against it may stop working. Make sure that is meant, then update the
		// customize topic (bodies.customize in src/worker/lib/agentTopics.ts, "Page markup") and this list together.
		expect([...found].sort(), 'renderBioPage changed its class names: update the customize topic and this list').toEqual(promised.sort())

		const topic = guideTopic('customize', guideNames(ORIGIN))!
		for (const name of promised) expect(topic, `the customize topic doesn't mention the class "${name}"`).toMatch(new RegExp(`(?<=[\\s"\`.])${name}(?=[\\s"\`>])`))
	})

	it('names every color variable a theme sets', () => {
		const topic = guideTopic('customize', guideNames(ORIGIN))!
		const names = new Set(THEME_IDS.flatMap((theme) => Object.keys(resolveAppearance({ ...defaultAppearance(), theme, font: 'serif' }).vars)))
		// --c1 to --c6 and their --on- pairs are named as a range; --head-synthesis is how headings keep their weight, not a color.
		const named = [...names].filter((name) => !/^--(on-)?c\d$/.test(name) && name !== '--head-synthesis')
		expect(named.length).toBeGreaterThan(20)
		for (const name of named) expect(topic, name).toContain(`\`${name}\``)
	})
})
