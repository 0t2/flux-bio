import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type {
	AuthInfo,
	BulkLinksResponse,
	LinksResponse,
	CommunityThemesResponse,
	CreateLinkResponse,
	CreateTokenResponse,
	DeletedMediaResponse,
	FontsResponse,
	LinkJson,
	LinkStatsResponse,
	ShortLinkResponse,
	PageJson,
	PageVersionJson,
	PageSummary,
	StateResponse,
	StatsExportResponse,
	StatsResponse,
	TopTargetJson,
	UnusedMediaResponse,
	UsageResponse,
	PreviewLinkResponse,
} from '../../shared/api'
import { BackupSchema } from '../../shared/backup'
import {
	linkItems,
	MEDIA_ID,
	newId,
	PageContentInputSchema,
	LINE_PART,
	SOCIAL_PART,
	randomString,
	ThemePresetSchema,
	THEME_IDS,
	type PageContent,
	type Settings,
	type ThemeId,
} from '../../shared/content'
import { FONT_CATEGORIES, FONT_SCRIPTS, searchFonts } from '../../shared/fonts'
import { requestedLocale } from '../../shared/locale'
import { untranslated } from '../../shared/translations'
import { DEFAULT_QR_STYLE, QR_SIZE_IDS, qrLogoMedia, qrSvg, QrStyleSchema, type QrStyle } from '../../shared/qr'
import { addDays, dayIn } from '../../shared/time'
import { fill, msg, type Message, type Params } from '../../templates/msg'
import { SOCIAL_META } from '../../templates/icons'
import { renderBioPage } from '../../templates/render'
import communityThemes from '../../../themes/community.json'
import { CommunityListSchema } from '../../shared/community'
import { guideNames, openApi, workerNameOf } from '../lib/agent'
import { guideTopic } from '../lib/agentTopics'
import { accountUse, countsSince, insights, type Insights } from '../lib/analytics'
import { D1_DAILY_LIMITS, D1_STORAGE, KV_DAILY_LIMITS } from '../../shared/usage'
import {
	adminPasswordProblem,
	createSession,
	secretsMatch,
	SESSION_COOKIE,
	SESSION_MAX_AGE,
	sessionKeyOf,
	createPreviewToken,
	sha256Hex,
	TOKEN_PATTERN,
	tokenTag,
	verifySession,
} from '../lib/auth'
import { clearAllData, exportData, importData } from '../lib/backup'
import { deleteUnusedMedia, unusedMedia, UNUSED_AFTER } from '../lib/media'
import { mediaKey } from '../lib/cache'
import {
	deleteToken,
	ensureSchema,
	findTokenByHash,
	getLink,
	getPage,
	getPageVersion,
	listPageVersions,
	insertToken,
	firstPage,
	getLinksByIds,
	getPagesByIds,
	listLinkPage,
	listOwnLinks,
	listPageRows,
	type PageListRow,
	listTokens,
	loadSettings,
	loadThemes,
	saveDraft,
	saveThemesStatement,
	touchToken,
	type LinkRow,
	type PageRow,
	type PageVersionRow,
} from '../lib/db'
import { verifyDomain } from '../lib/domain'
import { adminPassword, isTestSite } from '../lib/mode'
import {
	createPage,
	createSoloLinks,
	deletePage,
	normalizeDomain,
	draftChanged,
	publishPage,
	renamePage,
	setPageQrLogo,
	setPageLinkSlug,
	updateLink,
	updateSettings,
} from '../lib/ops'
import {
	BulkLinksInput,
	CLICKED_LINKS,
	LINKS_PER_PAGE,
	LinkListQuery,
	DomainInput,
	LinkPatchInput,
	LinkShortInput,
	LoginInput,
	NewLinkInput,
	NewPageInput,
	NewTokenInput,
	PagePatchInput,
	PreviewLinkInput,
	SettingsInput,
	StatsClearInput,
	StatsExportQuery,
	ThemeFetchInput,
	WipeInput,
} from '../lib/schemas'
import { clearStats, DATABASE_LIMIT, databaseBytes, EXPORT_COLUMNS, exportStats, statsHistory, tidyStats } from '../lib/statsHistory'
import { VERSION } from '../lib/version'
import { clicksByPage, emptyLinkStats, linkStats, overview, targetOverview, type LinkStats } from '../lib/stats'
import { ApiError, type AppEnv, type Auth } from '../types'
import { customPageResponse, PREVIEW_CSP } from './site'

export const api = new Hono<AppEnv>()

async function readBody<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
	let json: unknown
	try {
		json = await c.req.json()
	} catch {
		throw new ApiError(400, 'invalid', msg('請求內容不是有效的 JSON'))
	}
	const parsed = schema.safeParse(json)
	if (!parsed.success) {
		throw new ApiError(
			400,
			'invalid',
			msg('資料格式不正確'),
			parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
		)
	}
	return parsed.data
}

/** Links and QR codes use the custom domain when there is one. */
function publicOrigin(c: Context<AppEnv>, settings: Settings): string {
	return settings.domain ? `https://${settings.domain}` : new URL(c.req.url).origin
}

function linkJson(row: LinkRow, origin: string, stats?: LinkStats): LinkJson {
	const qr = QrStyleSchema.safeParse(row.qr)
	return {
		id: row.id,
		slug: row.slug,
		short: `${origin}/${encodeURIComponent(row.slug)}`,
		url: row.url,
		title: row.title,
		kind: row.kind,
		pageId: row.pageId,
		status: row.status,
		startsAt: row.startsAt,
		expiresAt: row.expiresAt,
		hasPassword: Boolean(row.passwordHash),
		utm: { source: row.utmSource, medium: row.utmMedium, campaign: row.utmCampaign, content: row.utmContent },
		iosUrl: row.iosUrl,
		androidUrl: row.androidUrl,
		lineExternal: row.lineExternal,
		inAppPrompt: row.inAppPrompt,
		qr: qr.success ? qr.data : null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		...(stats ? { stats } : {}),
	}
}

function versionJson(row: PageVersionRow, page: PageRow): PageVersionJson {
	const token = row.publishedBy?.startsWith('token:') ? row.publishedBy.slice('token:'.length) : null
	return {
		id: row.id,
		publishedAt: row.publishedAt,
		by: token !== null ? 'token' : row.publishedBy === 'owner' ? 'owner' : null,
		tokenName: token,
		current: row.publishedAt === page.publishedAt,
	}
}

function pageJson(page: PageRow): PageJson {
	return {
		id: page.id,
		handle: page.handle,
		qrLogo: page.qrLogo,
		position: page.position,
		draft: page.draft,
		published: page.published,
		draftUpdatedAt: page.draftUpdatedAt,
		publishedAt: page.publishedAt,
	}
}

/** Which click targets belong to a page: its short links, and the parts of its blocks ("<item id>.<part>"). */
/** The pages' lines in a list. D1 works them out, so the Worker only reads a page in full if its draft is in an older shape, or to count what's untranslated. */
async function pageSummaries(db: D1Database, settings: Settings): Promise<PageSummary[]> {
	const [rows, clicks] = await Promise.all([listPageRows(db), clicksByPage(db, settings.timezone)])
	const current = (row: PageListRow) => row.items !== null && THEME_IDS.includes(row.theme as ThemeId) && row.name !== null
	const needed = settings.languages.length ? rows : rows.filter((row) => !current(row))
	const full = new Map((await getPagesByIds(db, needed.map((row) => row.id))).map((page) => [page.id, page]))
	return rows.flatMap((row) => {
		const page = full.get(row.id)
		const clicks7d = clicks.get(row.id) ?? 0
		const untranslatedCount = page ? Object.values(untranslated(page.draft, settings.languages)).reduce((sum, texts) => sum + texts.length, 0) : 0
		if (current(row)) {
			return [
				{
					id: row.id,
					handle: row.handle,
					qrLogo: row.qrLogo,
					name: row.name ?? '',
					avatar: row.avatar ?? '',
					theme: row.theme as ThemeId,
					kind: (row.customKind as PageSummary['kind'] | null) ?? 'links',
					home: settings.home === row.id,
					publishedAt: row.publishedAt,
					draftUpdatedAt: row.draftUpdatedAt,
					dirty: !row.hasPublished || !row.sameAsPublished,
					items: row.items ?? 0,
					links: row.links,
					clicks7d,
					untranslated: untranslatedCount,
				} satisfies PageSummary,
			]
		}
		if (!page) return []
		const content = page.published ?? page.draft
		return [
			{
				id: page.id,
				handle: page.handle,
				qrLogo: page.qrLogo,
				name: page.draft.profile.name,
				avatar: page.draft.profile.avatar,
				theme: content.appearance.theme,
				kind: page.draft.custom?.kind ?? 'links',
				home: settings.home === page.id,
				publishedAt: page.publishedAt,
				draftUpdatedAt: page.draftUpdatedAt,
				dirty: !page.published || JSON.stringify(page.published) !== JSON.stringify(page.draft),
				items: page.draft.items.length,
				links: linkItems(page.draft).filter((link) => link.url.trim()).length,
				clicks7d,
				untranslated: untranslatedCount,
			} satisfies PageSummary,
		]
	})
}

type Label = Pick<TopTargetJson, 'label' | 'labelKey' | 'labelParams'>

/** A label the Worker words itself: the text, and its key and values for the dashboard. */
function labelOf(key: string, params?: Params): Label {
	return { label: fill(key, params), labelKey: key, ...(params ? { labelParams: params } : {}) }
}

/** A readable name for a click target: a short link's title, or the block part that was tapped. */
function targetLabel(target: string, rows: Map<string, LinkRow>, content: PageContent | null): Label & { slug: string; kind: 'link' | 'block' } {
	const row = rows.get(target)
	if (row) return { label: row.title || row.slug, slug: row.slug.startsWith('~') ? '' : row.slug, kind: 'link' }
	const [itemId, part = ''] = target.split('.')
	const item = content?.items.find((entry) => entry.id === itemId)
	const block = (label: Label) => ({ ...label, slug: '', kind: 'block' as const })
	const social = part === SOCIAL_PART ? content?.socials.find((entry) => entry.id === itemId) : undefined
	// Brand names stay as they are.
	if (social) return block(labelOf(msg('社群圖示：{name}'), { name: social.platform === 'website' ? { key: msg('網站') } : SOCIAL_META[social.platform].label }))
	// Fallbacks for an untitled block are translated; the owner's own titles are not.
	const named = (text: string, fallback: string): string | Message => text || { key: fallback }
	const deleted = block(labelOf(msg('（已刪除的項目）')))
	if (!item) return part === LINE_PART ? block(labelOf(msg('LINE 按鈕'))) : deleted
	switch (item.kind) {
		case 'video':
			return block(labelOf(msg('影片：{title}'), { title: named(item.title, msg('未命名')) }))
		case 'product': {
			if (part === 'more') return block(labelOf(msg('看全部商品')))
			const product = item.products.find((entry) => entry.id === part)
			return block(labelOf(msg('商品：{name}'), { name: named(product?.name ?? '', msg('已刪除的商品')) }))
		}
		case 'gallery': {
			const image = item.images.find((entry) => entry.id === part)
			return block(labelOf(msg('圖片：{name}'), { name: named(image?.alt || item.title, msg('輪播圖片')) }))
		}
		case 'hours':
			return block(labelOf(msg('地圖導航')))
		default:
			return deleted
	}
}

function insightsJson(details: Insights | null, label: (target: string) => Label) {
	return details && { ...details, recent: details.recent.map((event) => ({ ...event, ...label(event.target) })) }
}

const deny = (message: string | Message) => new ApiError(403, 'forbidden', message)

/** Throws unless the caller signed in with the admin password (not a token). */
function requireOwner(auth: Auth, what: string): void {
	if (auth.role === 'token') throw deny({ key: msg('API token 不能{what}，請登入後台操作'), params: { what: { key: what } } })
}


// Browsers send Origin on cross-site requests; reject those for anything that writes.
api.use('*', async (c, next) => {
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		const origin = c.req.header('origin')
		if (origin && origin !== new URL(c.req.url).origin) throw new ApiError(403, 'forbidden', msg('不接受跨站請求'))
	}
	await next()
})

api.get('/auth/info', (c) => {
	const body: AuthInfo = { setup: adminPasswordProblem(adminPassword(c.env)) }
	return c.json(body)
})

api.post('/auth/login', async (c) => {
	const secret = adminPassword(c.env)
	const problem = adminPasswordProblem(secret)
	if (problem) throw new ApiError(503, 'setup', problem)
	// v0.1 sent { token }; v0.2 sends { password }.
	const body = await readBody(c, LoginInput)
	const given = body.password ?? body.token ?? ''
	if (!(await secretsMatch(given, secret))) {
		// Slows down guessing without spending CPU time.
		await scheduler.wait(800)
		throw new ApiError(401, 'wrong-password', msg('密碼不正確'))
	}
	setCookie(c, SESSION_COOKIE, await createSession(await sessionKeyOf(c.env)), {
		httpOnly: true,
		secure: new URL(c.req.url).protocol === 'https:',
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_MAX_AGE,
	})
	return c.json({ ok: true, role: 'admin' })
})

api.post('/auth/logout', (c) => {
	deleteCookie(c, SESSION_COOKIE, { path: '/' })
	return c.json({ ok: true })
})

// The API described for agents and tools; public, like the code it describes.
api.get('/openapi.json', (c) => c.json(openApi(new URL(c.req.url).origin), 200, { 'cache-control': 'public, max-age=300' }))

// The parts of the guide an agent reads when it needs them. Public, like /llms.txt.
api.get('/guide/:topic', (c) => {
	const text = guideTopic(c.req.param('topic'), guideNames(new URL(c.req.url).origin, workerNameOf(c.env)))
	if (!text) throw new ApiError(404, 'not-found', msg('找不到'))
	return c.text(text, 200, { 'cache-control': 'public, max-age=300' })
})

// Everything below needs the session cookie, `Authorization: Bearer <ADMIN_PASSWORD>`,
// or `Authorization: Bearer fbk_…` (an API token).
api.use('*', async (c, next) => {
	const secret = adminPassword(c.env)
	const problem = adminPasswordProblem(secret)
	if (problem) throw new ApiError(503, 'setup', problem)
	const bearer = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
	let auth: Auth | null = null
	if (bearer && TOKEN_PATTERN.test(bearer)) {
		await ensureSchema(c.env.DB)
		const token = await findTokenByHash(c.env.DB, await sha256Hex(bearer), await tokenTag(await sessionKeyOf(c.env)))
		if (token) {
			auth = { role: 'token', tokenId: token.id, scope: token.scope, name: token.name }
			const now = Date.now()
			// "Last used" only needs minute precision; skip the write otherwise.
			if (!token.lastUsedAt || now - token.lastUsedAt > 60_000) c.executionCtx.waitUntil(touchToken(c.env.DB, token.id, now).catch(() => {}))
		}
	} else if (bearer) {
		if (await secretsMatch(bearer, secret)) auth = { role: 'admin' }
	} else {
		if (await verifySession(await sessionKeyOf(c.env), getCookie(c, SESSION_COOKIE))) auth = { role: 'admin' }
	}
	if (!auth) throw new ApiError(401, 'unauthorized', msg('請先登入'))
	if (auth.role === 'token' && auth.scope === 'links') {
		const path = c.req.path.replace(/\/+$/, '')
		const allowed = (c.req.method === 'POST' && (path === '/api/links' || path === '/api/links/bulk')) || path === '/api/auth/me'
		if (!allowed) throw deny(msg('這個 token 只能建立短網址'))
	}
	c.set('auth', auth)
	await ensureSchema(c.env.DB)
	await next()
})

api.get('/auth/me', (c) => c.json({ ok: true, role: c.get('auth').role }))

api.get('/state', async (c) => {
	const db = c.env.DB
	const settings = await loadSettings(db)
	const body: StateResponse = {
		version: VERSION,
		origin: publicOrigin(c, settings),
		role: c.get('auth').role,
		settings,
		pages: await pageSummaries(db, settings),
		analytics: Boolean((c.env as { ANALYTICS_SQL?: unknown }).ANALYTICS_SQL),
		testSite: isTestSite(c.env),
	}
	// Old numbers are merged, or deleted as asked, a slice per dashboard visit, after it has its answer.
	c.executionCtx.waitUntil(tidyStats(db, settings).catch((error: unknown) => console.error('Could not tidy old stats', error)))
	return c.json(body)
})

/** The free plan's limits, per account and per UTC day. */
const FREE_DAILY: NonNullable<UsageResponse['dailyLimits']> = {
	requests: 100_000,
	kv: KV_DAILY_LIMITS,
	d1: D1_DAILY_LIMITS,
	databases: { count: D1_STORAGE.databases, bytes: D1_STORAGE.account },
}

api.get('/usage', async (c) => {
	const db = c.env.DB
	const settings = await loadSettings(db)
	const now = Date.now()
	const since = `${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`
	const bytes = await databaseBytes(db)
	const quietly = <T>(read: Promise<T>) =>
		read.catch((error: unknown) => {
			console.error('Cloudflare analytics did not answer', error)
			return null
		})
	const [history, counted, account] = await Promise.all([statsHistory(db, settings, bytes, now), quietly(countsSince(c.env, since)), quietly(accountUse(c.env, since))])
	let today: UsageResponse['today']
	if (counted) today = { since, ...counted, from: 'analytics' }
	else {
		const { results } = await db
			.prepare("SELECT kind, SUM(count) AS n FROM stats WHERE day = ?1 AND dim = 'source' GROUP BY kind")
			.bind(dayIn(settings.timezone, now))
			.all<{ kind: string; n: number }>()
		const count = (kind: string) => results.find((row) => row.kind === kind)?.n ?? 0
		today = { since, views: count('view'), clicks: count('click'), from: 'stats' }
	}
	const body: UsageResponse = {
		plan: settings.plan,
		database: { bytes, limit: DATABASE_LIMIT[settings.plan] },
		today,
		estimate: { requests: today.views + today.clicks },
		account,
		dailyLimits: settings.plan === 'free' ? FREE_DAILY : null,
		stats: history,
	}
	return c.json(body)
})

// ---------------------------------------------------------------- pages

async function loadPage(c: Context<AppEnv>): Promise<PageRow> {
	const page = await getPage(c.env.DB, c.req.param('id') ?? '')
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	return page
}

api.get('/pages', async (c) => {
	const db = c.env.DB
	return c.json({ pages: await pageSummaries(db, await loadSettings(db)) })
})

api.post('/pages', async (c) => {
	const input = await readBody(c, NewPageInput)
	const page = await createPage(c.env, input)
	return c.json({ page: pageJson(page), settings: await loadSettings(c.env.DB) }, 201)
})

api.get('/pages/:id', async (c) => {
	// A caller that says which draft it holds (If-None-Match with its draftUpdatedAt) gets 304 while that is still
	// the one. The dashboard asks every time its window comes back, and reading and sending a whole page to
	// compare one number would be most of what that costs. No ETag goes out: a draft's version says nothing of
	// the page's address or the languages turned on, so no cache may answer in the Worker's place.
	const held = c.req.header('if-none-match')?.trim().replace(/^"|"$/g, '')
	if (held) {
		const row = await c.env.DB.prepare('SELECT draft_updated_at AS version FROM pages WHERE id = ?1').bind(c.req.param('id')).first<{ version: number }>()
		if (row && String(row.version) === held) return c.body(null, 304, { 'cache-control': 'no-store' })
	}
	const [page, settings] = await Promise.all([loadPage(c), loadSettings(c.env.DB)])
	return c.json({ page: { ...pageJson(page), untranslated: untranslated(page.draft, settings.languages) } })
})

api.patch('/pages/:id', async (c) => {
	const id = c.req.param('id')
	const { handle, qrLogo } = await readBody(c, PagePatchInput)
	if (handle !== undefined) await renamePage(c.env, id, handle)
	return c.json({ page: pageJson(await setPageQrLogo(c.env, id, qrLogo)) })
})

api.delete('/pages/:id', async (c) => {
	await deletePage(c.env, c.req.param('id'))
	return c.json({ ok: true, settings: await loadSettings(c.env.DB) })
})

/** The draft version a request says it read, from If-Match: a page's draftUpdatedAt. */
function seenDraft(c: Context<AppEnv>): number | undefined {
	const raw = c.req.header('if-match')?.trim().replace(/^"|"$/g, '')
	if (raw === undefined) return undefined
	const seen = Number(raw)
	if (!raw || !Number.isSafeInteger(seen)) throw needsDraftVersion()
	return seen
}

const needsDraftVersion = (): ApiError => new ApiError(428, 'draft-version-required', msg('請先讀取頁面，再用 If-Match 標頭送回 draftUpdatedAt'))

/** Saves over a draft only if it is still the one the caller read; anything else would lose someone's work. */
async function replaceDraft(c: Context<AppEnv>, seen: number, draft: PageContent): Promise<number> {
	const id = c.req.param('id') ?? ''
	const draftUpdatedAt = await saveDraft(c.env.DB, id, draft, seen)
	if (draftUpdatedAt !== null) return draftUpdatedAt
	if (!(await getPage(c.env.DB, id))) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	throw draftChanged()
}

api.put('/pages/:id/draft', async (c) => {
	const seen = seenDraft(c)
	if (seen === undefined) throw needsDraftVersion()
	const draft = await readBody(c, PageContentInputSchema)
	return c.json({ draftUpdatedAt: await replaceDraft(c, seen, draft) })
})

api.post('/pages/:id/publish', async (c) => {
	const auth = c.get('auth')
	const by = auth.role === 'token' ? `token:${auth.name}` : 'owner'
	return c.json(await publishPage(c.env, c.req.param('id'), { by, seen: seenDraft(c) }))
})

api.put('/pages/:id/links/:itemId/short', async (c) => {
	const { slug } = await readBody(c, LinkShortInput)
	const { row, draftUpdatedAt } = await setPageLinkSlug(c.env, c.req.param('id'), c.req.param('itemId'), { slug, seen: seenDraft(c) })
	const body: ShortLinkResponse = { link: linkJson(row, publicOrigin(c, await loadSettings(c.env.DB))), draftUpdatedAt }
	return c.json(body)
})

api.get('/pages/:id/versions', async (c) => {
	const page = await loadPage(c)
	const versions = await listPageVersions(c.env.DB, page.id)
	return c.json({ versions: versions.map((row) => versionJson(row, page)) })
})

async function loadVersion(c: Context<AppEnv>) {
	const page = await loadPage(c)
	const version = await getPageVersion(c.env.DB, page.id, c.req.param('versionId') ?? '')
	if (!version) throw new ApiError(404, 'not-found', msg('找不到'))
	return { page, version }
}

api.get('/pages/:id/versions/:versionId', async (c) => {
	const { page, version } = await loadVersion(c)
	return c.json({ version: versionJson(version, page), content: version.content })
})

// Into the draft, never straight to visitors: going live is a publish like any other.
api.post('/pages/:id/versions/:versionId/restore', async (c) => {
	const seen = seenDraft(c)
	if (seen === undefined) throw needsDraftVersion()
	const { version } = await loadVersion(c)
	return c.json({ draft: version.content, draftUpdatedAt: await replaceDraft(c, seen, version.content) })
})

api.get('/pages/:id/preview', async (c) => {
	const [page, settings] = await Promise.all([loadPage(c), loadSettings(c.env.DB)])
	if (page.draft.custom) return customPageResponse(page.draft.custom, { 'cache-control': 'no-store' })
	const html = renderBioPage(page.draft, {
		mode: 'preview',
		// With more languages turned on, the owner sees the page as their own browser's language would, or as ?lang= says.
		locale: requestedLocale(c.req.query('lang'), settings.locale, settings.languages, c.req.header('accept-language')),
		mediaUrl: (id) => `/media/${id}`,
		timeZone: settings.timezone,
	})
	return c.html(html, 200, { 'cache-control': 'no-store', 'content-security-policy': PREVIEW_CSP })
})

// ---------------------------------------------------------------- settings

api.post('/pages/:id/preview-link', async (c) => {
	const [page, settings] = await Promise.all([loadPage(c), loadSettings(c.env.DB)])
	if (!settings.bio) throw new ApiError(409, 'bio-off', msg('頁面功能關閉時，預覽連結打不開，請先把它打開'))
	// A bare POST is fine: the length has a default.
	const raw = await c.req.raw.clone().text()
	const { minutes, hours } = raw.trim() ? await readBody(c, PreviewLinkInput) : {}
	const expiresAt = Math.floor(Date.now() / 1000 + (minutes ?? (hours ? hours * 60 : 10)) * 60) * 1000
	const token = await createPreviewToken(await sessionKeyOf(c.env), page.id, expiresAt)
	const body: PreviewLinkResponse = { url: `${publicOrigin(c, settings)}/_draft/${token}`, expiresAt }
	return c.json(body)
})

api.put('/settings', async (c) => {
	const input = await readBody(c, SettingsInput)
	const current = await loadSettings(c.env.DB)
	// Whatever a request leaves out stays as it is.
	const domain = input.domain === undefined ? current.domain : normalizeDomain(input.domain)
	if (domain !== current.domain) {
		if (domain) {
			const check = await verifyDomain(c.env, domain)
			if (!check.ok) throw new ApiError(400, 'domain', { key: check.key, params: check.params })
		}
	}
	const { home = current.home, timezone = current.timezone, locale = current.locale } = input
	const { settings, copiesLeft } = await updateSettings(c.env, { ...input, home, timezone, locale, domain })
	return c.json({ settings, ...(copiesLeft ? { copiesLeft } : {}) })
})

api.post('/settings/verify-domain', async (c) => {
	const { domain } = await readBody(c, DomainInput)
	const host = normalizeDomain(domain)
	if (!host) throw new ApiError(400, 'invalid', msg('請輸入網域'))
	return c.json({ domain: host, ...(await verifyDomain(c.env, host)) })
})

// ---------------------------------------------------------------- media

const MEDIA_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
}
const MAX_MEDIA_BYTES = 2 * 1024 * 1024

async function readImage(c: Context<AppEnv>): Promise<{ bytes: ArrayBuffer; type: string; ext: string }> {
	const type = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
	const ext = MEDIA_TYPES[type]
	if (!ext) throw new ApiError(415, 'unsupported', msg('只接受 PNG、JPEG、WebP、GIF 或 AVIF 圖片'))
	if (Number(c.req.header('content-length') ?? 0) > MAX_MEDIA_BYTES) throw new ApiError(413, 'too-large', msg('圖片太大了，不能超過 2 MB'))
	const bytes = await c.req.arrayBuffer()
	if (!bytes.byteLength) throw new ApiError(400, 'invalid', msg('沒有收到圖片'))
	if (bytes.byteLength > MAX_MEDIA_BYTES) throw new ApiError(413, 'too-large', msg('圖片太大了，不能超過 2 MB'))
	return { bytes, type, ext }
}

api.post('/media', async (c) => {
	const { bytes, type, ext } = await readImage(c)
	const id = `${randomString(12)}.${ext}`
	// Dated, so one nothing uses yet isn't taken for one nothing uses any more (lib/media.ts).
	await c.env.KV.put(mediaKey(id), bytes, { metadata: { type, at: Date.now() } })
	return c.json({ id, url: `/media/${id}` }, 201)
})

// Pictures nothing uses any more: what would go, and letting them go. Before /media/:id.
api.get('/media/unused', async (c) => {
	const { ids, more } = await unusedMedia(c.env)
	const body: UnusedMediaResponse = { unused: ids, more, keptDays: UNUSED_AFTER / 86_400_000 }
	return c.json(body)
})

api.delete('/media/unused', async (c) => {
	const body: DeletedMediaResponse = await deleteUnusedMedia(c.env)
	return c.json(body)
})

// Imports re-upload images under the ids the settings file uses.
api.put('/media/:id', async (c) => {
	const id = c.req.param('id')
	if (!MEDIA_ID.test(id)) throw new ApiError(400, 'invalid', msg('圖片 id 格式不正確'))
	const { bytes, type } = await readImage(c)
	await c.env.KV.put(mediaKey(id), bytes, { metadata: { type, at: Date.now() } })
	return c.json({ id, url: `/media/${id}` })
})

// ---------------------------------------------------------------- short links

api.get('/links', async (c) => {
	const query = LinkListQuery.safeParse(c.req.query())
	if (!query.success) throw new ApiError(400, 'invalid', msg('查詢參數不正確'))
	const { limit = LINKS_PER_PAGE, cursor, kind, q } = query.data
	const [{ rows, nextCursor }, settings] = await Promise.all([listLinkPage(c.env.DB, { limit, cursor, kind, q }), loadSettings(c.env.DB)])
	const { days, byLink } = await linkStats(c.env.DB, settings.timezone, 7, rows.map((row) => row.id))
	const origin = publicOrigin(c, settings)
	const body: LinksResponse = { days, links: rows.map((row) => linkJson(row, origin, byLink.get(row.id) ?? emptyLinkStats(days.length))), nextCursor }
	return c.json(body)
})

// Before /links/:id. For adding up a whole site without paging through links nobody clicked.
api.get('/links/clicked', async (c) => {
	const settings = await loadSettings(c.env.DB)
	const { days, byLink } = await linkStats(c.env.DB, settings.timezone, 7)
	const top = [...byLink].sort((a, b) => b[1].total - a[1].total).slice(0, CLICKED_LINKS)
	const rows = await getLinksByIds(c.env.DB, top.map(([id]) => id))
	const byId = new Map(rows.map((row) => [row.id, row]))
	const origin = publicOrigin(c, settings)
	const links = top.flatMap(([id, stats]) => {
		const row = byId.get(id)
		return row ? [linkJson(row, origin, stats)] : []
	})
	const body: LinksResponse = { days, links, nextCursor: null }
	return c.json(body)
})

api.post('/links', async (c) => {
	const input = await readBody(c, NewLinkInput)
	const { created, errors } = await createSoloLinks(c.env, [input])
	if (errors[0]) throw errors[0].error
	const link = linkJson(created[0]!, publicOrigin(c, await loadSettings(c.env.DB)))
	const body: CreateLinkResponse = { link, short: link.short }
	return c.json(body, 201)
})

api.post('/links/bulk', async (c) => {
	const { links } = await readBody(c, BulkLinksInput)
	const { created, errors } = await createSoloLinks(c.env, links)
	const origin = publicOrigin(c, await loadSettings(c.env.DB))
	const body: BulkLinksResponse = {
		created: created.map((row) => linkJson(row, origin)),
		errors: errors.map(({ index, error }) => ({ index, ...error.text() })),
	}
	return c.json(body, created.length ? 201 : 400)
})

api.get('/links/:id', async (c) => {
	const [row, settings] = await Promise.all([getLink(c.env.DB, c.req.param('id')), loadSettings(c.env.DB)])
	if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
	return c.json({ link: linkJson(row, publicOrigin(c, settings)) })
})

/** Up to this size a picture goes inside the file, so it prints anywhere. Encoding more could run past the free plan's CPU limit. */
const QR_EMBED_MAX = 256 * 1024

async function qrLogoHref(c: Context<AppEnv>, media: string | null, origin: string): Promise<string | null> {
	if (!media) return null
	const { value, metadata } = await c.env.KV.getWithMetadata<{ type?: string }>(mediaKey(media), 'arrayBuffer')
	if (!value) return null
	if (value.byteLength > QR_EMBED_MAX) return `${origin}/media/${encodeURIComponent(media)}`
	const bytes = new Uint8Array(value)
	let binary = ''
	for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
	return `data:${metadata?.type ?? 'image/png'};base64,${btoa(binary)}`
}

// The same code the dashboard's download draws, for an agent that has to hand over a file.
api.get('/links/:id/qr', async (c) => {
	const db = c.env.DB
	const [row, settings] = await Promise.all([getLink(db, c.req.param('id')), loadSettings(db)])
	if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
	if (row.status !== 'active') throw new ApiError(409, 'archived', msg('已封存，這個短網址不會再轉址'))
	const saved = QrStyleSchema.safeParse(row.qr)
	const size = QR_SIZE_IDS.find((id) => id === c.req.query('size'))
	const style: QrStyle = { ...(saved.success ? saved.data : DEFAULT_QR_STYLE), ...(size ? { size } : {}) }
	const owner = await getPage(db, row.pageId ?? settings.home)
	const media = qrLogoMedia(style, {
		avatar: (owner?.published ?? owner?.draft)?.profile.avatar,
		pageLogo: row.pageId ? owner?.qrLogo : null,
		siteLogo: settings.qrLogo,
	})
	const origin = publicOrigin(c, settings)
	const svg = qrSvg(`${linkJson(row, origin).short}?s=qr`, style, { logoHref: await qrLogoHref(c, media, origin) })
	return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, 200, {
		'content-type': 'image/svg+xml; charset=utf-8',
		'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`qr-${row.slug}.svg`)}`,
		'cache-control': 'no-store',
		'x-content-type-options': 'nosniff',
	})
})

api.patch('/links/:id', async (c) => {
	const patch = await readBody(c, LinkPatchInput)
	const row = await updateLink(c.env, c.req.param('id'), patch)
	return c.json({ link: linkJson(row, publicOrigin(c, await loadSettings(c.env.DB))) })
})

const rangeOf = (value: string | undefined) => {
	const days = Number(value)
	return [7, 30, 90].includes(days) ? days : 30
}

api.get('/links/:id/stats', async (c) => {
	const db = c.env.DB
	const days = rangeOf(c.req.query('days'))
	const [row, settings] = await Promise.all([getLink(db, c.req.param('id')), loadSettings(db)])
	if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
	const data = await targetOverview(db, settings.timezone, days, row.id)
	const from = data.days[0]!
	const details = await insights(c.env, { target: row.id }, { from, to: data.days.at(-1)!, previousFrom: addDays(from, -days) })
	const page = row.pageId ? await getPage(db, row.pageId) : null
	const title = row.title || row.slug
	const placeKey = page ? msg('{name} 頁面上的「{title}」') : msg('獨立短網址「{title}」')
	const placeParams: Params = page ? { name: page.draft.profile.name || page.handle, title } : { title }
	const body: LinkStatsResponse = {
		link: linkJson(row, publicOrigin(c, settings)),
		place: fill(placeKey, placeParams),
		placeKey,
		placeParams,
		timezone: settings.timezone,
		days: data.days,
		clicks: data.clicks,
		total: data.total,
		previous: data.previous,
		sources: data.sources,
		insights: insightsJson(details, () => ({ label: title })),
	}
	return c.json(body)
})

// ---------------------------------------------------------------- stats

api.get('/stats', async (c) => {
	const db = c.env.DB
	const days = rangeOf(c.req.query('days'))
	const settings = await loadSettings(db)
	const asked = c.req.query('page')
	const page = (asked ? await getPage(db, asked) : null) ?? (settings.home ? await getPage(db, settings.home) : null) ?? (await firstPage(db))
	const rows = page ? await listOwnLinks(db, page.id) : []
	const byId = new Map(rows.map((row) => [row.id, row]))
	const data = await overview(db, settings.timezone, days, page?.id ?? '', rows.map((row) => row.id))
	const from = data.days[0]!
	const details = page ? await insights(c.env, { page: page.id }, { from, to: data.days.at(-1)!, previousFrom: addDays(from, -days) }) : null
	const content = page ? (page.published ?? page.draft) : null
	const label = (target: string): Label => {
		if (page && target === page.id) return labelOf(msg('bio 頁'))
		// Only the label: an event has a kind of its own.
		const { label: text, labelKey, labelParams } = targetLabel(target, byId, content)
		return { label: text, labelKey, labelParams }
	}
	const topLinks: TopTargetJson[] = data.clicksByTarget.slice(0, 20).map((entry) => ({ target: entry.target, count: entry.count, ...targetLabel(entry.target, byId, content) }))
	const body: StatsResponse = {
		page: page ? { id: page.id, handle: page.handle } : null,
		timezone: settings.timezone,
		days: data.days,
		views: data.views,
		clicks: data.clicks,
		totals: data.totals,
		previous: data.previous,
		topLinks,
		clickSources: data.clickSources,
		viewSources: data.viewSources,
		insights: insightsJson(details, label),
	}
	return c.json(body)
})

api.get('/stats/export', async (c) => {
	const query = StatsExportQuery.safeParse(c.req.query())
	if (!query.success) throw new ApiError(400, 'invalid', msg('查詢參數不正確'))
	const body: StatsExportResponse = { columns: EXPORT_COLUMNS, ...(await exportStats(c.env.DB, query.data.cursor, query.data.before)) }
	return c.json(body)
})

api.post('/stats/clear', async (c) => {
	requireOwner(c.get('auth'), msg('清除點擊數據'))
	const { before } = await readBody(c, StatsClearInput)
	const db = c.env.DB
	const settings = await loadSettings(db)
	await clearStats(db, settings, before)
	return c.json({ stats: await statsHistory(db, settings, await databaseBytes(db)) })
})

// ---------------------------------------------------------------- themes

api.get('/themes', async (c) => c.json({ themes: await loadThemes(c.env.DB) }))

api.post('/themes', async (c) => {
	const preset = await readBody(c, ThemePresetSchema)
	const themes = await loadThemes(c.env.DB)
	if (themes.length >= 100) throw new ApiError(409, 'limit', msg('最多存 100 個主題'))
	const theme = { ...preset, id: newId(), createdAt: Date.now() }
	await saveThemesStatement(c.env.DB, [theme, ...themes]).run()
	return c.json({ theme }, 201)
})

api.delete('/themes/:id', async (c) => {
	const themes = await loadThemes(c.env.DB)
	const next = themes.filter((theme) => theme.id !== c.req.param('id'))
	if (next.length === themes.length) throw new ApiError(404, 'not-found', msg('找不到這個主題'))
	await saveThemesStatement(c.env.DB, next).run()
	return c.json({ ok: true })
})

const COMMUNITY_URL = 'https://raw.githubusercontent.com/0t2/flux-bio/main/themes/community.json'

api.get('/fonts', (c) => {
	const category = FONT_CATEGORIES.find((value) => value === c.req.query('category'))
	const script = FONT_SCRIPTS.find((value) => value === c.req.query('script'))
	const limit = Math.min(Math.max(Math.trunc(Number(c.req.query('limit'))) || 20, 1), 100)
	const found = searchFonts({ q: c.req.query('q')?.slice(0, 60), category, script })
	return c.json<FontsResponse>({ fonts: found.slice(0, limit), total: found.length })
})

api.get('/themes/community', async (c) => {
	let body: CommunityThemesResponse = { themes: CommunityListSchema.parse(communityThemes).themes, source: 'bundled' }
	try {
		const response = await fetch(COMMUNITY_URL, { cf: { cacheTtl: 3600, cacheEverything: true }, signal: AbortSignal.timeout(4000) })
		if (response.ok) {
			const parsed = CommunityListSchema.safeParse(await response.json())
			if (parsed.success) body = { themes: parsed.data.themes, source: 'github' }
		}
	} catch {
		// Offline, or the repository isn't public yet: the bundled list is fine.
	}
	return c.json(body)
})

/** "https://github.com/a/b/blob/main/x.json" → its raw URL; only GitHub hosts are fetched. */
function rawGithubUrl(input: string): string | null {
	let url: URL
	try {
		url = new URL(input.trim())
	} catch {
		return null
	}
	if (url.protocol !== 'https:') return null
	if (url.hostname === 'github.com') {
		const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/)
		return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}` : null
	}
	if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'gist.githubusercontent.com') return url.href
	return null
}

api.post('/themes/fetch', async (c) => {
	const { url } = await readBody(c, ThemeFetchInput)
	const raw = rawGithubUrl(url)
	if (!raw) throw new ApiError(400, 'invalid', msg('請貼 GitHub 上的主題檔網址（github.com 或 raw.githubusercontent.com）'))
	let json: unknown
	try {
		const response = await fetch(raw, { signal: AbortSignal.timeout(5000) })
		if (!response.ok) throw new Error(String(response.status))
		json = await response.json()
	} catch {
		throw new ApiError(400, 'fetch', msg('讀不到這個主題檔，請確認網址是公開的 JSON 檔'))
	}
	const single = ThemePresetSchema.safeParse(json)
	if (single.success) return c.json({ themes: [single.data] })
	const list = z.object({ themes: z.array(ThemePresetSchema).min(1).max(500) }).safeParse(json)
	if (list.success) return c.json({ themes: list.data.themes })
	throw new ApiError(400, 'invalid', msg('這不是 FluxBio 的主題檔（需要 name、base、accent、font、button）'))
})

// ---------------------------------------------------------------- API tokens

api.get('/tokens', async (c) => {
	requireOwner(c.get('auth'), msg('管理 token'))
	return c.json({ tokens: await listTokens(c.env.DB, await tokenTag(await sessionKeyOf(c.env))) })
})

api.post('/tokens', async (c) => {
	requireOwner(c.get('auth'), msg('管理 token'))
	const { name, scope } = await readBody(c, NewTokenInput)
	const tag = await tokenTag(await sessionKeyOf(c.env))
	if ((await listTokens(c.env.DB, tag)).length >= 50) throw new ApiError(409, 'limit', msg('最多 50 個 token'))
	const token = `fbk_${randomString(32)}`
	const info = { id: newId(), name, scope, hint: token.slice(-4), createdAt: Date.now(), lastUsedAt: null }
	await insertToken(c.env.DB, { ...info, hash: await sha256Hex(token), tag })
	const body: CreateTokenResponse = { token, info }
	return c.json(body, 201)
})

api.delete('/tokens/:id', async (c) => {
	requireOwner(c.get('auth'), msg('管理 token'))
	if (!(await deleteToken(c.env.DB, c.req.param('id')))) throw new ApiError(404, 'not-found', msg('找不到這個 token'))
	return c.json({ ok: true })
})

// ---------------------------------------------------------------- backup and reset

api.get('/export', async (c) => c.json(await exportData(c.env)))

// Agents restore and move deployments, so full tokens may import; "links" tokens never get this far.
api.post('/import', async (c) => c.json(await importData(c.env, await readBody(c, BackupSchema))))

api.delete('/data', async (c) => {
	requireOwner(c.get('auth'), msg('清除資料'))
	await readBody(c, WipeInput)
	return c.json(await clearAllData(c.env))
})
