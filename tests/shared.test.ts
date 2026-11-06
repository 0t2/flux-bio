import { describe, expect, it } from 'vitest'
import { config } from 'zod'
import { defaultContent, emptyLink, newItem, socialHref, upgradeContent, videoEmbed, PageContentSchema, type LinkItem, type PageContent } from '../src/shared/content'
import { toCsv } from '../src/shared/csv'
import { openStatus, weekRows } from '../src/shared/hours'
import { normalizeSlug, slugFromText, slugFromUrl, slugProblem, uniqueSlug } from '../src/shared/slug'
import { detectBrowser, detectDevice, detectOs, detectSource } from '../src/shared/source'
import { addDays, dayIn, lastDays } from '../src/shared/time'
import { publishProblems } from '../src/shared/validate'
import { renderBioPage, TAP_SCRIPT } from '../src/templates/render'
import { inkFor, resolveAppearance } from '../src/templates/themes'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

describe('slugs', () => {
	it('accept words written with combining marks (Thai, Hindi)', () => {
		for (const slug of ['ร้าน', 'สินค้า', 'ที่', 'हिंदी', 'café']) expect(slugProblem(normalizeSlug(slug)), slug).toBeNull()
		expect(slugProblem('\u0301abc')).toBe('format')
	})

	it('normalizes case and Unicode form', () => {
		expect(normalizeSlug('  Lens ')).toBe('lens')
		expect(normalizeSlug('講座報名')).toBe('講座報名')
	})

	it('accepts Chinese, digits, dashes and underscores', () => {
		expect(slugProblem('講座報名')).toBeNull()
		expect(slugProblem('oct-live_2026')).toBeNull()
	})

	it('rejects bad shapes and reserved words', () => {
		expect(slugProblem('')).toBe('empty')
		expect(slugProblem('-lens')).toBe('format')
		expect(slugProblem('a b')).toBe('format')
		expect(slugProblem('a/b')).toBe('format')
		expect(slugProblem('admin')).toBe('reserved')
		expect(slugProblem('x'.repeat(65))).toBe('format')
	})

	it('derives slugs from titles and URLs', () => {
		expect(slugFromText('Latest Videos!')).toBe('latest-videos')
		expect(slugFromText('免費 Prompt 範本')).toBe('prompt')
		expect(slugFromText('最新教學影片')).toBe('')
		expect(slugFromUrl('https://www.youtube.com/@me')).toBe('youtube')
	})

	it('finds a free slug', () => {
		expect(uniqueSlug('lens', new Set())).toBe('lens')
		expect(uniqueSlug('lens', new Set(['lens']))).toBe('lens-2')
		expect(uniqueSlug('', new Set())).toMatch(/^[a-z2-9]{5}$/)
	})
})

describe('sources', () => {
	const base = { userAgent: IPHONE, selfHost: 'bio.example' }

	it('prefers an explicit ?s= parameter', () => {
		expect(detectSource({ ...base, param: 'ig', referrer: 'https://www.google.com/' })).toBe('instagram')
		expect(detectSource({ ...base, param: 'Newsletter-Oct' })).toBe('newsletter-oct')
	})

	it('recognizes in-app browsers', () => {
		expect(detectSource({ ...base, userAgent: `${IPHONE} Instagram 350.0` })).toBe('instagram')
		expect(detectSource({ ...base, userAgent: `${IPHONE} Instagram 350.0 Barcelona 350.0` })).toBe('threads')
		expect(detectSource({ ...base, userAgent: `${IPHONE} Line/14.5.0` })).toBe('line')
		expect(detectSource({ ...base, userAgent: `${IPHONE} [FBAN/FBIOS;FBAV/480.0]` })).toBe('facebook')
		expect(detectSource({ ...base, userAgent: `${IPHONE} MicroMessenger/8.0.50 NetType/WIFI` })).toBe('wechat')
		expect(detectSource({ ...base, userAgent: `${IPHONE} KAKAOTALK 10.8.0` })).toBe('kakaotalk')
		expect(detectSource({ ...base, userAgent: `${IPHONE} NAVER(inapp; search; 2000; 12.6.4)` })).toBe('naver')
		expect(detectSource({ ...base, userAgent: `${IPHONE} ZaloTheme/light ZaloLanguage/vn` })).toBe('zalo')
		expect(detectSource({ ...base, userAgent: `${IPHONE} [LinkedInApp]/9.30` })).toBe('linkedin')
	})

	it('names messaging apps and search engines from the referrer', () => {
		expect(detectSource({ ...base, referrer: 'https://t.co/abc' })).toBe('x')
		expect(detectSource({ ...base, referrer: 'https://out.reddit.com/t3_x' })).toBe('reddit')
		expect(detectSource({ ...base, referrer: 'https://web.telegram.org/' })).toBe('telegram')
		expect(detectSource({ ...base, referrer: 'https://search.yahoo.co.jp/' })).toBe('yahoo')
		expect(detectSource({ ...base, param: 'wa' })).toBe('whatsapp')
	})

	it('falls back to the referrer, ignoring our own host', () => {
		expect(detectSource({ ...base, referrer: 'https://l.threads.com/?u=x' })).toBe('threads')
		expect(detectSource({ ...base, referrer: 'https://news.example.org/post' })).toBe('news.example.org')
		expect(detectSource({ ...base, referrer: 'https://bio.example/' })).toBe('direct')
		expect(detectSource(base)).toBe('direct')
	})

	it('names browsers and operating systems', () => {
		expect(detectBrowser(`${IPHONE} Instagram 350.0`)).toBe('Instagram')
		expect(detectBrowser(`${IPHONE} Line/14.5.0`)).toBe('LINE')
		expect(detectBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0')).toBe('Edge')
		expect(detectBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')).toBe('Safari')
		expect(detectOs(IPHONE)).toBe('iOS')
		expect(detectOs('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('Android')
	})

	it('classifies devices', () => {
		expect(detectDevice(IPHONE)).toBe('mobile')
		expect(detectDevice('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('tablet')
		expect(detectDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)')).toBe('desktop')
	})
})

describe('time', () => {
	it('buckets days in a time zone', () => {
		const at = Date.UTC(2026, 9, 31, 20, 0) // 04:00 on Nov 1 in Taipei
		expect(dayIn('UTC', at)).toBe('2026-10-31')
		expect(dayIn('Asia/Taipei', at)).toBe('2026-11-01')
	})

	it('does calendar arithmetic', () => {
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
		expect(lastDays('UTC', 3, Date.UTC(2026, 0, 2))).toEqual(['2025-12-31', '2026-01-01', '2026-01-02'])
	})
})

describe('publishProblems', () => {
	const page = (links: Partial<LinkItem>[]): PageContent => {
		const content = defaultContent()
		content.items = links.map((link, i) => ({ ...emptyLink(), id: `link${i}xx`, ...link }))
		return content
	}

	it('allows empty cards and complete links', () => {
		expect(publishProblems(page([{ title: '', url: '' }, { title: 'Site', url: 'https://a.example' }]), 'me')).toEqual([])
	})

	it('reports half-filled links, bad URLs and slug clashes', () => {
		const problems = publishProblems(
			page([
				{ title: 'No URL', url: '' },
				{ title: 'Bad', url: 'javascript:alert(1)' },
				{ title: 'A', url: 'https://a.example', slug: 'same' },
				{ title: 'B', url: 'https://b.example', slug: 'SAME' },
				{ title: 'C', url: 'https://c.example', slug: 'me' },
				{ title: 'D', url: 'https://d.example', startsAt: 2000, endsAt: 1000 },
			]),
			'me',
		).map((problem) => problem.path)
		expect(problems).toEqual(['items.0.url', 'items.1.url', 'items.3.slug', 'items.4.slug', 'items.5.endsAt'])
	})

	it('checks blocks', () => {
		const content = defaultContent()
		content.items = [
			{ ...newItem('video'), url: 'https://example.com/not-a-video' },
			{ ...newItem('product'), products: [{ id: 'prod-1', name: '', price: '', image: null, url: 'https://shop.example/1' }] },
		]
		expect(publishProblems(content, 'me').map((problem) => problem.path)).toEqual(['items.0.url', 'items.1.products.0.name'])
	})

	it('checks social links', () => {
		expect(socialHref('email', 'hello@example.com')).toBe('mailto:hello@example.com')
		expect(socialHref('instagram', 'instagram.com/me')).toBe('https://instagram.com/me')
		expect(socialHref('website', 'not a url')).toBeNull()
	})
})

describe('content', () => {
	it('upgrades v0.1 content that had only links', () => {
		const legacy = {
			profile: { name: 'Mei', bio: '', avatar: null },
			appearance: { theme: 'liquid', accent: '', font: 'auto', button: 'auto', showSocial: true },
			socials: [],
			links: [{ id: 'lens-link', title: 'Lens', subtitle: '', url: 'https://example.com/lens/', slug: 'lens', icon: 'auto', featured: true, hidden: false }],
			seo: { title: '', description: '', image: 'cover.webp' },
			showBadge: true,
		}
		const parsed = PageContentSchema.parse(upgradeContent(legacy))
		expect(parsed.items[0]).toMatchObject({ kind: 'link', slug: 'lens', startsAt: null, endsAt: null })
		expect(parsed.seo.imageMode).toBe('upload')
	})

	it('finds YouTube and Vimeo videos', () => {
		expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ')
		expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')?.embed).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
		expect(videoEmbed('https://youtube.com/shorts/abcdefghijk')?.id).toBe('abcdefghijk')
		expect(videoEmbed('https://vimeo.com/123456789')?.provider).toBe('vimeo')
		expect(videoEmbed('https://example.com/watch?v=x')).toBeNull()
	})
})

describe('toCsv', () => {
	it('keeps text that starts like a formula from running in a spreadsheet', () => {
		const csv = toCsv([['referrer'], ['=1+2'], ['@SUM(A1)'], ['-x'], ['ok, "quoted"']])
		expect(csv).toContain("'=1+2")
		expect(csv).toContain("'@SUM(A1)")
		expect(csv).toContain('"ok, ""quoted"""')
		expect(csv.replace(/^﻿/, '')).not.toMatch(/^[=+\-@]/m)
	})
})

describe('opening hours', () => {
	// Tuesday to Friday 10–18, Saturday 18:00–02:00, closed Sunday and Monday.
	const week = [[], ...Array.from({ length: 4 }, () => [{ open: '10:00', close: '18:00' }]), [{ open: '18:00', close: '02:00' }], []]
	const taipei = (iso: string) => Date.parse(`${iso}+08:00`)

	it('knows when a place is open and when that changes', () => {
		expect(openStatus(week, 'Asia/Taipei', taipei('2026-11-03T12:00:00'))).toEqual({ open: true, closesAt: '18:00', closesToday: true })
		expect(openStatus(week, 'Asia/Taipei', taipei('2026-11-03T19:00:00'))).toMatchObject({ open: false, opensAt: { inDays: 1, time: '10:00' } })
		// Saturday's late opening runs past midnight into Sunday.
		expect(openStatus(week, 'Asia/Taipei', taipei('2026-11-08T01:00:00'))).toEqual({ open: true, closesAt: '02:00', closesToday: true })
		expect(openStatus(week, 'Asia/Taipei', taipei('2026-11-02T09:00:00'))).toMatchObject({ open: false, opensAt: { inDays: 1, day: 1 } })
	})

	it('groups days with the same hours', () => {
		expect(weekRows(week, 'zh-TW', 2).map((row) => [row.days, row.hours])).toEqual([
			['週一', '公休'],
			['週二至週五（今天）', '10:00–18:00'],
			['週六', '18:00–02:00'],
			['週日', '公休'],
		])
	})
})

describe('renderBioPage', () => {
	const options = {
		mode: 'live' as const,
		mediaUrl: (id: string) => `/media/${id}`,
		linkHref: (l: { slug: string }) => `/${l.slug}`,
		blockHref: (item: { id: string }, part: string) => `/_c/me/${item.id}/${part}`,
		timeZone: 'Asia/Taipei',
	}
	const link = (patch: Partial<LinkItem>): LinkItem => ({ ...emptyLink(), url: 'https://example.com', ...patch })

	it('shows the FluxBio badge only while the page asks for it', () => {
		const content = defaultContent()
		expect(renderBioPage(content, options)).toContain('class="badge"')
		content.showBadge = false
		expect(renderBioPage(content, options)).not.toContain('<footer>')
	})

	it('escapes everything a person typed', () => {
		const content = defaultContent()
		content.profile.name = '<script>alert(1)</script>'
		content.items = [link({ title: '"><img src=x onerror=alert(1)>', slug: 'x' })]
		const html = renderBioPage(content, options)
		expect(html).not.toContain('<script>alert(1)</script>')
		expect(html).not.toContain('<img src=x')
		expect(html).toContain('&lt;script&gt;')
	})

	it('leaves out hidden, unfinished and off-schedule links and ships only the script that reports taps', () => {
		const content = defaultContent()
		const now = Date.UTC(2026, 10, 1)
		content.items = [
			link({ id: 'shown-id', title: 'Shown', slug: 'shown' }),
			link({ id: 'hidden-id', title: 'Hidden', slug: 'hidden', hidden: true }),
			link({ id: 'empty-id', title: 'Empty', slug: 'empty', url: '' }),
			link({ id: 'later-id', title: 'Later', slug: 'later', startsAt: now + 1000 }),
			link({ id: 'over-id', title: 'Over', slug: 'over', endsAt: now - 1000 }),
		]
		const html = renderBioPage(content, { ...options, now })
		expect(html).toContain('href="https://example.com" ping=')
		for (const text of ['Hidden', 'Empty', 'Later', 'Over']) expect(html).not.toContain(text)
		expect(html.match(/<script/g)).toHaveLength(1)
		expect(html).toContain(`<script>${TAP_SCRIPT}</script>`)
	})

	it('renders blocks with counted links', () => {
		const content = defaultContent()
		content.items = [
			{ ...newItem('heading'), title: '本週推薦' },
			{ ...newItem('video'), id: 'video-1', url: 'https://youtu.be/dQw4w9WgXcQ', title: '烘豆日常' },
			{ ...newItem('product'), id: 'prod-blk', products: [{ id: 'bean-1', name: '日曬耶加雪菲', price: 'NT$ 160', image: null, url: 'https://shop.example/beans' }], moreUrl: 'https://shop.example' },
			{ ...newItem('hours'), id: 'hours-1', address: '高雄市鹽埕區', phone: '07-123 4567' },
		]
		const html = renderBioPage(content, options)
		expect(html).toContain('<h2 class="sep">本週推薦</h2>')
		expect(html).toContain('/_c/me/video-1/play')
		expect(html).toContain('ping="/_c/me/prod-blk/bean-1"')
		expect(html).toContain('ping="/_c/me/prod-blk/more"')
		expect(html).toContain('ping="/_c/me/hours-1/map"')
		expect(html).toContain('href="tel:071234567"')
		expect(html).toContain('class="open-pill')
		expect(html.match(/<script/g)).toHaveLength(1)
	})

	it('skips item kinds it does not know', () => {
		const content = defaultContent()
		const unknown = { id: 'poll-1', kind: 'poll', title: '投票', hidden: false }
		content.items = [unknown as unknown as PageContent['items'][number]]
		expect(renderBioPage(content, options)).not.toContain('投票')
	})

	it('applies theme choices', () => {
		const look = resolveAppearance({ theme: 'brutal', accent: '#7b5cff', font: 'serif', button: 'pill', showSocial: true })
		expect(look.accent).toBe('#7B5CFF')
		expect(look.font).toBe('serif')
		expect(look.vars['--radius']).toBe('999px')
		expect(inkFor('#CCFF4D')).toBe('#0B0B12')
		expect(inkFor('#7B5CFF')).toBe('#0B0B12')
		expect(inkFor('#1E3A8A')).toBe('#FFFFFF')
	})
})

describe('zod', () => {
	// To parse faster zod tries `new Function` when the first schema is made. The dashboard's CSP refuses, and the
	// browser reports the asking as a violation on every load. Told `jitless`, zod never asks.
	it('is told not to ask whether it may build code from strings', () => {
		expect(PageContentSchema.safeParse(defaultContent()).success).toBe(true)
		expect(config().jitless).toBe(true)
	})

	it('gives every schema its `z` through src/shared/zod.ts, so that is settled before the first one is made', () => {
		const sources = import.meta.glob<string>(['../src/**/*.{ts,tsx}', '../landing/*.ts', '../vite.openapi.ts'], { query: '?raw', import: 'default', eager: true })
		const direct = Object.entries(sources)
			.filter(([path, source]) => !path.endsWith('/src/shared/zod.ts') && /from ['"]zod(?:\/[^'"]*)?['"]/.test(source))
			.map(([path]) => path)
		expect(Object.keys(sources).length).toBeGreaterThan(100)
		expect(direct).toEqual([])
	})
})
