import { Hono, type Context } from 'hono'
import {
	DEFAULT_SETTINGS,
	isHttpUrl,
	LINE_PART,
	mapsUrl,
	MEDIA_ID,
	LINK_PART,
	randomString,
	SOCIAL_PART,
	socialHref,
	videoEmbed,
	type Appearance,
	type CustomPage,
	type Item,
	type Locale,
	type PageContent,
	type Settings,
} from '../../shared/content'
import { embedAccount, EMBEDS, type EmbedProvider } from '../../shared/embeds'
import { FONT_FILE } from '../../shared/fonts'
import { pageLanguages, requestedLocale, resolveLocale } from '../../shared/locale'
import { normalizeSlug, slugProblem } from '../../shared/slug'
import { detectOs, detectSource, sourceFromUserAgent } from '../../shared/source'
import { translatedLocales } from '../../shared/translations'
import { pageEmbeds, renderBioPage, SHEET_SCRIPT_HASH, TAP_SCRIPT_HASH, visibleItems } from '../../templates/render'
import { renderSystemPage, type SystemPageKind, type SystemPageOptions } from '../../templates/system'
import { agentGuide, agentSkill, guideSite, workerNameOf } from '../lib/agent'
import { getLinkRecord, getNamed, getSnapshot, mediaKey, type LinkRecord, type SiteRecord, type Snapshot } from '../lib/cache'
import { readPreviewToken, sessionKeyOf } from '../lib/auth'
import { ensureSchema, getPage, listPublished, loadSettings, publicNames } from '../lib/db'
import { fontKey } from '../lib/fonts'
import { isTestSite } from '../lib/mode'
import { findSite, linkRecordFromDb, siteFromDb, siteTimeZone, snapshotFromDb, systemSite } from '../lib/ops'
import { verifyLinkPassword } from '../lib/password'
import { pingSignature } from '../lib/domain'
import { UTM_PARAMS } from '../lib/analytics'
import { languageUrls, robotsTxt, sitemapXml, type SitemapPage } from '../lib/seo'
import { recordHit } from '../lib/stats'
import type { AppEnv } from '../types'

type SiteContext = Context<AppEnv>

/** Videos and maps load in frames only after a tap; everything else on public pages is plain HTML. */
const FRAMES = "'self' https://www.youtube-nocookie.com https://player.vimeo.com https://maps.google.com https://www.google.com"
const csp = (ancestors: string, script = "'none'", frames = FRAMES) =>
	`default-src 'none'; script-src ${script}; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; frame-src ${frames}; form-action 'self'; base-uri 'none'; frame-ancestors ${ancestors}`
const PAGE_CSP = csp("'none'")
/**
 * A page of links: the script that reports a tap, by its hash, and somewhere for it and the ping attribute to report to.
 * A page with an embed also runs the one that opens its panel, and may frame that service, and only that one: its
 * panel loads only after a tap.
 */
function bioCsp(embeds: readonly EmbedProvider[]): string {
	if (!embeds.length) return `${csp("'none'", `'${TAP_SCRIPT_HASH}'`)}; connect-src 'self'`
	const frames = new Set(embeds.flatMap((provider) => EMBEDS[provider].origins))
	return `${csp("'none'", `'${TAP_SCRIPT_HASH}' '${SHEET_SCRIPT_HASH}'`, [FRAMES, ...frames].join(' '))}; connect-src 'self'`
}

/** The dashboard's preview tab; it may be framed by the dashboard. */
export const PREVIEW_CSP = csp("'self'")
/**
 * Someone's own HTML, scripts and all. Without allow-same-origin it runs as if from nowhere: no cookies, no storage and
 * no way into the dashboard or the API, which share this address.
 */
export const CUSTOM_CSP = 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'

/** Uploaded images are never documents: no scripts even when opened directly. */
/** Also in public/_headers, for pictures shipped as static files (pnpm deploy:images). */
export const MEDIA_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"

export const site = new Hono<AppEnv>({ strict: false })

site.get('/media/:id', async (c) => {
	const id = c.req.param('id')
	if (!MEDIA_ID.test(id)) return c.notFound()
	const { value, metadata } = await c.env.KV.getWithMetadata<{ type?: string }>(mediaKey(id), 'stream')
	if (!value) return c.notFound()
	return new Response(value, {
		headers: {
			'content-type': metadata?.type ?? 'application/octet-stream',
			'cache-control': 'public, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff',
			'content-security-policy': MEDIA_CSP,
		},
	})
})

// Fonts copied from Google Fonts for published pages (lib/fonts.ts). A file's name changes with its contents.
site.get('/_fonts/:name', async (c) => {
	const name = c.req.param('name')
	const file = name.endsWith('.woff2') ? name.slice(0, -'.woff2'.length) : ''
	if (!FONT_FILE.test(file)) return c.notFound()
	const value = await c.env.KV.get(fontKey(file), 'stream')
	if (!value) return c.notFound()
	return new Response(value, {
		headers: {
			'content-type': 'font/woff2',
			'cache-control': 'public, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff',
		},
	})
})

// A custom domain counts as verified when it answers with this deployment's signature.
site.get('/_fluxbio/ping', async (c) => {
	const nonce = c.req.query('n') ?? ''
	if (!/^[\w-]{16,64}$/.test(nonce)) return c.text('bad nonce', 400)
	return c.text(await pingSignature(c.env, nonce), 200, { 'cache-control': 'no-store' })
})

// Guides for AI agents (see lib/agent.ts). Slugs can't contain dots, so these never shadow a link.
site.get('/llms.txt', (c) => c.text(agentGuide(new URL(c.req.url).origin, workerNameOf(c.env), isTestSite(c.env), guideSite(c.env)), 200, { 'cache-control': 'public, max-age=300' }))
site.get('/skill.md', (c) =>
	c.body(agentSkill(new URL(c.req.url).origin, workerNameOf(c.env), isTestSite(c.env), guideSite(c.env)), 200, {
		'content-type': 'text/markdown; charset=utf-8',
		'cache-control': 'public, max-age=300',
	}),
)

// For search engines. Neither can be a page or a short link: slugs can't contain dots.
site.get('/robots.txt', async (c) => {
	const pages = ((await systemSite(c.env)) ?? (await findSite(c.env))).bio !== false
	return c.text(robotsTxt(new URL(c.req.url).origin, pages, isTestSite(c.env)), 200, { 'cache-control': 'public, max-age=3600' })
})
site.get('/sitemap.xml', async (c) => {
	const pages = isTestSite(c.env) ? [] : await sitemapPages(c.env)
	return c.body(sitemapXml(new URL(c.req.url).origin, pages), 200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' })
})

/** Every published page at the address it says is its own, with the languages it is fully translated into. None while pages are off. */
function fullyTranslated(published: string, languages: Settings['languages']): Locale[] {
	try {
		return translatedLocales(JSON.parse(published) as PageContent, languages)
	} catch {
		return []
	}
}

async function sitemapPages(env: Env): Promise<SitemapPage[]> {
	await ensureSchema(env.DB)
	const settings = await loadSettings(env.DB)
	if (!settings.bio) return []
	// The text of a page only matters with other languages to list, and even then needs no schema check: this runs for anyone who asks.
	const pages = await listPublished(env.DB, { content: settings.languages.length > 0 })
	return pages
		.flatMap((page) => {
			// A page that sends visitors elsewhere isn't a page for search engines to list.
			if (page.customKind === 'redirect') return []
			return [
				{
					path: page.id === settings.home ? '/' : `/${encodeURIComponent(page.handle)}`,
					updatedAt: page.publishedAt,
					locale: settings.locale,
					languages: page.published ? fullyTranslated(page.published, settings.languages) : [],
				},
			]
		})
		.sort((a, b) => Number(b.path === '/') - Number(a.path === '/'))
}

site.get('/', async (c) => {
	const record = await findSite(c.env)
	if (record.bio === false) return record.homeUrl ? redirect(record.homeUrl, 302) : systemPage(c, 'short-links', 200, { site: record })
	// The home page comes with the record, so this is the only read.
	if (record.page) return serveBio(c, record.page)
	if (record.home) {
		// Its copy was taken out for a change whose last write never arrived: the page is served from its own copy
		// or D1, and the record is written again.
		const snapshot = (await getSnapshot(c.env, record.home)) ?? (await snapshotFromDb(c.env, record.home))
		if (snapshot) {
			c.executionCtx.waitUntil(siteFromDb(c.env).catch((error: unknown) => console.error('Could not rewrite the site record', error)))
			return serveBio(c, snapshot)
		}
	}
	if (!record.published.length) return systemPage(c, 'unpublished', 200, { site: record })
	return systemPage(c, 'not-found', 404, { site: record, suggestions: record.published.slice(0, 3) })
})

/** ?lang=<code> when it names a language, else the visitor's browser, else English. */
// Counted clicks inside blocks: /_c/<page handle>/<item id>/<part>.
// A draft preview link: no sign-in, signed and short-lived, never counted in the stats.
const draftHeaders = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' }

site.get('/_draft/:token', async (c) => {
	const token = c.req.param('token')
	const link = await readPreviewToken(await sessionKeyOf(c.env), token)
	if (!link) return systemPage(c, 'not-found', 404)
	if (link.expiresAt < Date.now()) return systemPage(c, 'expired', 410, { expiredAt: link.expiresAt })
	const [page, settings] = await Promise.all([getPage(c.env.DB, link.pageId), loadSettings(c.env.DB)])
	if (!page || !settings.bio) return systemPage(c, 'not-found', 404)
	if (page.draft.custom) return customPageResponse(page.draft.custom, draftHeaders)
	const nonce = randomString(18)
	const html = renderBioPage(page.draft, {
		mode: 'preview',
		locale: requestedLocale(c.req.query('lang'), settings.locale, settings.languages, c.req.header('accept-language')),
		mediaUrl: (id) => `/media/${id}`,
		timeZone: settings.timezone,
		draft: { nonce, versionUrl: `/_draft/${encodeURIComponent(token)}/version`, version: page.draftUpdatedAt },
	})
	return c.html(html, 200, { ...draftHeaders, 'content-security-policy': `${csp("'none'", `'nonce-${nonce}'`)}; connect-src 'self'` })
})

// The open preview asks this while it is on screen, and reloads when the answer changes.
site.get('/_draft/:token/version', async (c) => {
	const link = await readPreviewToken(await sessionKeyOf(c.env), c.req.param('token'))
	if (!link || link.expiresAt < Date.now()) return c.json({ error: 'gone' }, 410, draftHeaders)
	const [row, settings] = await Promise.all([
		c.env.DB.prepare('SELECT draft_updated_at AS version FROM pages WHERE id = ?1').bind(link.pageId).first<{ version: number }>(),
		loadSettings(c.env.DB),
	])
	return row && settings.bio ? c.json({ version: row.version }, 200, draftHeaders) : c.json({ error: 'gone' }, 410, draftHeaders)
})

site.get('/_c/:handle/:item/:part', async (c) => {
	const handle = normalizeSlug(c.req.param('handle'))
	const snapshot = (await getSnapshot(c.env, handle)) ?? (await snapshotFromDb(c.env, handle))
	if (!snapshot) return systemPage(c, 'not-found', 404)
	const tap = tapOn(snapshot, c.req.param('item'), c.req.param('part'))
	if (!tap) return c.redirect(snapshot.home ? '/' : `/${encodeURIComponent(snapshot.handle)}`, 302)
	countTap(c, snapshot, tap)
	return redirect(tap.url, 302)
})

// What TAP_SCRIPT and the ping attribute send: the browser is already on its way to the address.
site.post('/_c/:handle/:item/:part', async (c) => {
	const handle = normalizeSlug(c.req.param('handle'))
	const snapshot = (await getSnapshot(c.env, handle)) ?? (await snapshotFromDb(c.env, handle))
	const tap = snapshot && tapOn(snapshot, c.req.param('item'), c.req.param('part'))
	if (snapshot && tap) countTap(c, snapshot, tap)
	return c.body(null, 204, { 'cache-control': 'no-store' })
})

site.get('/:segment', async (c) => {
	const slug = normalizeSlug(c.req.param('segment'))
	// Paths like "wp-login.php" can never be a page or a short link; skip the lookups.
	if (slugProblem(slug) === 'format') return systemPage(c, 'not-found', 404)
	// Pages and short links share their names, so one read says which of them this is.
	const named = await getNamed(c.env, slug)
	if (named?.link) return serveLink(c, named.link, slug)
	if (named?.page) return serveBio(c, named.page)
	const [stored, page] = await Promise.all([linkRecordFromDb(c.env, slug), snapshotFromDb(c.env, slug)])
	if (stored) return serveLink(c, stored, slug)
	if (page) return serveBio(c, page)
	// Whether pages are on decides if any address may be suggested, so a site with no record in KV yet gets one made.
	const record = (await systemSite(c.env)) ?? (await findSite(c.env).catch(() => undefined))
	return systemPage(c, 'not-found', 404, { site: record, suggestions: await suggestionsFor(c.env, slug, record), meta: `${new URL(c.req.url).host}/${slug}` })
})

// The password form on a protected link posts back to the link itself.
site.post('/:segment', async (c) => {
	const slug = normalizeSlug(c.req.param('segment'))
	if (slugProblem(slug) === 'format') return systemPage(c, 'not-found', 404)
	const record = (await getLinkRecord(c.env, slug)) ?? (await linkRecordFromDb(c.env, slug))
	if (!record) return systemPage(c, 'not-found', 404)
	const closed = await closedPage(c, record, slug)
	if (closed) return closed
	if (!record.passwordHash) return c.redirect(c.req.path, 303)
	const form = await c.req.parseBody()
	const password = typeof form.password === 'string' ? form.password : ''
	if (await verifyLinkPassword(password, record.passwordHash)) return click(c, record, slug, 303)
	await scheduler.wait(500)
	return systemPage(c, 'password', 401, { ...(await linkPage(c, record)), wrongPassword: true, meta: `${new URL(c.req.url).host}/${slug}` })
})

function sourceOf(c: SiteContext): string {
	const url = new URL(c.req.url)
	return detectSource({
		param: url.searchParams.get('s'),
		userAgent: c.req.header('user-agent') ?? '',
		referrer: c.req.header('referer'),
		selfHost: url.hostname,
	})
}

function withParam(href: string, key: string, value: string): string {
	const url = new URL(href)
	url.searchParams.set(key, value)
	return `${url.pathname}${url.search}`
}

/** A page that isn't links, as visitors or a preview get it. */
export function customPageResponse(custom: CustomPage, headers: Record<string, string>): Response {
	if (custom.kind === 'redirect') return redirect(custom.url.trim(), 302)
	return new Response(custom.html, {
		headers: { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers, 'content-security-policy': CUSTOM_CSP },
	})
}

async function serveBio(c: SiteContext, snapshot: Snapshot): Promise<Response> {
	const url = new URL(c.req.url)
	// Counting the view can wait for the time zone after the page has left. Only opening hours are drawn in it,
	// so only a page with them waits, and only in a copy of the Worker that doesn't know it yet.
	const zone = siteTimeZone(c.env)
	const languages = pageLanguages(snapshot.locale, snapshot.languages)
	const source = sourceOf(c)
	if (snapshot.content.custom) {
		recordHit(c.env, c.executionCtx, c.req.raw, { kind: 'view', target: snapshot.pageId, source, timeZone: zone, slug: snapshot.handle, url: '', page: snapshot.pageId })
		return customPageResponse(snapshot.content.custom, { 'cache-control': 'no-cache' })
	}
	// Links carry the visit's source and campaign tags along, so a click from a page
	// opened in Instagram still counts as Instagram even though the referrer is us,
	// and a click from a page opened through a story link counts under that story.
	const carried = new URLSearchParams()
	if (source !== 'direct') carried.set('s', source)
	for (const key of UTM_PARAMS) {
		const value = url.searchParams.get(key)?.trim().slice(0, 100)
		if (value) carried.set(key, value)
	}
	const suffix = carried.size ? `?${carried}` : ''
	const path = snapshot.home ? '/' : `/${encodeURIComponent(snapshot.handle)}`
	const handle = encodeURIComponent(snapshot.handle)
	const asked = url.searchParams.get('lang')
	// Search engines only hear of languages the page is fully translated into; with the others it would mostly repeat itself.
	const translated = languages.languages.length ? translatedLocales(snapshot.content, languages.languages) : []
	const html = renderBioPage(snapshot.content, {
		mode: 'live',
		canonicalUrl: `${url.origin}${path}${translated.some((code) => code === asked) ? `?lang=${asked}` : ''}`,
		alternates: languageUrls(`${url.origin}${path}`, languages.locale, translated),
		locale: requestedLocale(asked, languages.locale, languages.languages, c.req.header('accept-language')),
		mediaUrl: (id) => `/media/${id}`,
		linkHref: (link) => `/${encodeURIComponent(link.slug)}${suffix}`,
		blockHref: (item, part) => `/_c/${handle}/${encodeURIComponent(item.id)}/${encodeURIComponent(part)}${suffix}`,
		viaShortLink: snapshot.viaShortLink,
		timeZone: snapshot.content.items.some((item) => item.kind === 'hours') ? await zone : undefined,
		fonts: snapshot.fonts,
	})
	recordHit(c.env, c.executionCtx, c.req.raw, {
		kind: 'view',
		target: snapshot.pageId,
		source,
		timeZone: zone,
		slug: snapshot.handle,
		url: '',
		page: snapshot.pageId,
	})
	return c.html(html, 200, { 'cache-control': 'no-cache', 'content-security-policy': bioCsp(pageEmbeds(snapshot.content)), ...varyByLanguage(languages.languages) })
}

/** A page whose built-in text can follow the visitor's browser differs by Accept-Language, which caches must know. */
function varyByLanguage(languages: readonly Locale[]): Record<string, string> {
	return languages.length ? { vary: 'Accept-Language' } : {}
}

/** Where a tap inside a block goes. */
interface Tap {
	target: string
	url: string
	slug: string
}

/** What a tap on this part of a page counts as and where it goes, or null when there's nothing there to count. */
function tapOn({ content, handle, pageId }: Snapshot, id: string, part: string): Tap | null {
	if (id === 'page' && part === LINE_PART) {
		const url = content.lineButton?.trim() ? socialHref('line', content.lineButton) : null
		return url ? { target: `${pageId}.${LINE_PART}`, url, slug: handle } : null
	}
	// "page" is a possible item id too: only a page with the button takes it for the button.
	const button = content.embedButton
	const account = id === 'page' && button?.provider === part ? embedAccount(button) : null
	if (button && account) return { target: `${pageId}.${part}`, url: EMBEDS[button.provider].page(account), slug: handle }
	if (part === SOCIAL_PART && content.countSocials) {
		const social = content.socials.find((entry) => entry.id === id)
		const url = social ? socialHref(social.platform, social.url) : null
		// A mail address has nowhere to report from.
		if (url && isHttpUrl(url)) return { target: `${id}.${part}`, url, slug: handle }
	}
	const item = visibleItems(content).find((entry) => entry.id === id)
	if (!item) return null
	if (item.kind === 'link') return part === LINK_PART && item.url.trim() ? { target: item.id, url: item.url.trim(), slug: item.slug } : null
	const url = blockTarget(item, part)
	return url ? { target: `${id}.${part}`, url, slug: handle } : null
}

function countTap(c: SiteContext, snapshot: Snapshot, tap: Tap): void {
	recordHit(c.env, c.executionCtx, c.req.raw, { kind: 'click', source: sourceOf(c), timeZone: siteTimeZone(c.env), page: snapshot.pageId, ...tap })
}

function blockTarget(item: Item, part: string): string | null {
	const typed = (value: string) => value.trim() || null
	switch (item.kind) {
		case 'video':
			return part === 'play' ? (videoEmbed(item.url)?.embed ?? null) : null
		case 'gallery':
			return typed(item.images.find((image) => image.id === part)?.url ?? '')
		case 'product':
			return part === 'more' ? typed(item.moreUrl) : typed(item.products.find((product) => product.id === part)?.url ?? '')
		case 'hours':
			return part === 'map' && item.address.trim() ? mapsUrl(item.address) : null
		case 'embed': {
			const account = part === item.provider ? embedAccount(item) : null
			return account ? EMBEDS[item.provider].page(account) : null
		}
		default:
			return null
	}
}

async function serveLink(c: SiteContext, record: LinkRecord, slug: string): Promise<Response> {
	const closed = await closedPage(c, record, slug)
	if (closed) return closed
	const url = new URL(c.req.url)
	const ua = c.req.header('user-agent') ?? ''
	// "?inapp=preview" lets the dashboard show the prompt in any browser; "?go=1" is the prompt's "continue here".
	const promptPreview = url.searchParams.get('inapp') === 'preview'
	const inApp = ['instagram', 'threads', 'facebook'].includes(sourceFromUserAgent(ua) ?? '')
	if (promptPreview || (record.inApp && inApp && !url.searchParams.has('go'))) {
		const continueHref = withParam(promptPreview ? `${url.origin}${url.pathname}` : c.req.url, 'go', '1')
		const shareUrl = `${url.origin}/${encodeURIComponent(slug)}`
		return systemPage(c, 'in-app', 200, {
			...(await linkPage(c, record)),
			continueHref,
			shareUrl,
			androidIntent: detectOs(ua) === 'Android' ? `intent://${url.host}${continueHref}#Intent;scheme=https;end` : undefined,
			nonce: randomString(18),
			meta: `${url.host}/${slug}`,
		})
	}
	if (record.passwordHash) return systemPage(c, 'password', 401, { ...(await linkPage(c, record)), meta: `${url.host}/${slug}` })
	return click(c, record, slug, 302)
}

async function closedPage(c: SiteContext, record: LinkRecord, slug: string): Promise<Response | null> {
	const now = Date.now()
	const meta = `${new URL(c.req.url).host}/${slug}`
	if (record.startsAt && now < record.startsAt) {
		return systemPage(c, 'scheduled', 403, { ...(await linkPage(c, record)), opensAt: record.startsAt, timeZone: await siteTimeZone(c.env), meta })
	}
	if (record.expiresAt && now >= record.expiresAt) {
		// The page adds the expiry date to `meta`, in its language.
		return systemPage(c, 'expired', 410, { ...(await linkPage(c, record)), expiredAt: record.expiresAt, timeZone: await siteTimeZone(c.env), meta })
	}
	return null
}

/** The page a bio link sits on, so its system pages wear that page's look and can point back to it. */
async function linkPage(c: SiteContext, record: LinkRecord): Promise<Pick<SystemPageOptions, 'page' | 'appearance'> & { site?: SiteRecord }> {
	if (!record.page) return {}
	const site = (await systemSite(c.env)) ?? (await findSite(c.env))
	// With pages off there is nothing to point back to.
	if (site.bio === false) return { site }
	const page = await getPage(c.env.DB, record.page)
	const content = page?.published
	if (!page || !content) return { site }
	return {
		page: { href: site.home === page.handle ? '/' : `/${encodeURIComponent(page.handle)}`, name: content.profile.name.trim() || page.handle },
		appearance: content.appearance,
		site,
	}
}

/** The address for this visitor's phone, before campaign tags and LINE's flag are added. */
function deviceUrl(record: LinkRecord, ua: string): string {
	const os = detectOs(ua)
	if (os === 'iOS' && record.ios) return record.ios
	if (os === 'Android' && record.android) return record.android
	return record.url
}

function destination(record: LinkRecord, ua: string): string {
	let target = deviceUrl(record, ua)
	if (target === record.url) {
		const pairs = [
			['utm_source', record.utm.source],
			['utm_medium', record.utm.medium],
			['utm_campaign', record.utm.campaign],
			// KV records written before v0.3 have no content.
			['utm_content', record.utm.content ?? null],
		] as const
		if (pairs.some(([, value]) => value)) {
			try {
				const url = new URL(record.url)
				for (const [key, value] of pairs) if (value && !url.searchParams.has(key)) url.searchParams.set(key, value)
				target = url.href
			} catch {
				// Keep the URL as stored.
			}
		}
	}
	// LINE opens links in its own browser unless the URL asks for the phone's browser.
	if (record.line && /\bLine\//i.test(ua)) {
		try {
			const url = new URL(target)
			url.searchParams.set('openExternalBrowser', '1')
			target = url.href
		} catch {
			// Not a URL we can add to.
		}
	}
	return target
}

function redirect(location: string, status: 302 | 303): Response {
	return new Response(null, {
		status,
		headers: {
			location,
			'cache-control': 'no-store',
			'referrer-policy': 'strict-origin-when-cross-origin',
			'x-robots-tag': 'noindex',
		},
	})
}

function click(c: SiteContext, record: LinkRecord, slug: string, status: 302 | 303): Response {
	const location = destination(record, c.req.header('user-agent') ?? '')
	recordHit(c.env, c.executionCtx, c.req.raw, {
		kind: 'click',
		target: record.id,
		source: sourceOf(c),
		timeZone: siteTimeZone(c.env),
		slug,
		url: location,
		page: record.page ?? '',
		utm: record.utm,
	})
	return redirect(location, status)
}

/** Edit distance where swapping two neighbors counts as one typo ("lnes" → "lens"), for "did you mean". */
function distance(a: string, b: string): number {
	const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1)
			d[i]![j] = best
		}
	}
	return d[a.length]![b.length]!
}

/**
 * Close matches among public addresses only: published page handles and the
 * links visible on them. Standalone and hidden links are never suggested, so
 * a typo can't reveal a link someone shared privately.
 */
async function suggestionsFor(env: Env, slug: string, site: SiteRecord | undefined): Promise<string[]> {
	// With pages off there are no public addresses to suggest.
	if (slugProblem(slug) || slug.length < 2 || site?.bio === false) return []
	try {
		await ensureSchema(env.DB)
		const now = Date.now()
		const names = new Set(
			(await publicNames(env.DB, now)).filter((entry) => (entry.startsAt === null || entry.startsAt <= now) && (entry.endsAt === null || entry.endsAt > now)).map((entry) => entry.name),
		)
		const limit = slug.length <= 4 ? 1 : 2
		return [...names]
			.map((name) => ({ name, d: distance(slug, name) }))
			.filter((entry) => entry.d <= limit && entry.d > 0)
			.sort((a, b) => a.d - b.d)
			.slice(0, 2)
			.map((entry) => entry.name)
	} catch {
		return []
	}
}

export async function systemPage(
	c: SiteContext,
	kind: SystemPageKind,
	status: 200 | 401 | 403 | 404 | 410,
	extra: Partial<SystemPageOptions> & { site?: SiteRecord } = {},
): Promise<Response> {
	const { site: known, ...options } = extra
	// The site record holds the language setting, and the look when the page has none of its own.
	const record = known ?? (await systemSite(c.env))
	const look: Appearance | undefined = options.appearance ?? record?.look ?? undefined
	const languages = pageLanguages(record?.locale ?? DEFAULT_SETTINGS.locale, record?.languages)
	const html = renderSystemPage({
		kind,
		host: new URL(c.req.url).host,
		locale: resolveLocale(languages.locale, languages.languages, c.req.header('accept-language')),
		...options,
		appearance: look,
	})
	return c.html(html, status, {
		'cache-control': 'no-store',
		'content-security-policy': options.nonce ? csp("'none'", `'nonce-${options.nonce}'`) : PAGE_CSP,
		...varyByLanguage(languages.languages),
	})
}
