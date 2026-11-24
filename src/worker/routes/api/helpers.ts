import type { Context } from 'hono'
import type { LinkJson, PageJson, PageSummary, PageVersionJson, SiteJson, TopTargetJson } from '../../../shared/api'
import { LINE_PART, SOCIAL_PART, type PageContent, type Settings, type ThemeId } from '../../../shared/content'
import { EMBEDS, isEmbedProvider } from '../../../shared/embeds'
import { QrStyleSchema } from '../../../shared/qr'
import { untranslated } from '../../../shared/translations'
import { z } from '../../../shared/zod'
import { SOCIAL_META } from '../../../templates/icons'
import { fill, msg, type Message, type Params } from '../../../templates/msg'
import { ApiError, type AppEnv, type Auth } from '../../types'
import type { Insights } from '../../lib/analytics'
import { getPage, getPagesByIds, listPageRows, saveDraft, type LinkRow, type PageRow, type PageVersionRow } from '../../lib/db'
import { draftChanged, refuseTooLarge } from '../../lib/ops'
import { siteId, sitesOf } from '../../lib/sites'
import { clicksByPage, type LinkStats } from '../../lib/stats'

/** Where wrong tries at the admin password are counted (takePasswordTry in lib/db.ts): "/" is in no link's id. */
export const ADMIN_TRIES = '/admin'
export const tooManyTries = () => new ApiError(429, 'rate-limited', msg('嘗試次數太多，請稍後再試'))

export async function readBody<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
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
			parsed.error.issues.map((issue) => {
				const path = issue.path.map(String).join('.')
				// A check of ours gives its message as a key with values, as the CSS check does; zod's own are English already.
				const params = issue.code === 'custom' ? (issue.params as Params | undefined) : undefined
				const message = fill(issue.message, params)
				return message === issue.message && !params ? { path, message } : { path, message, key: issue.message, ...(params && { params }) }
			}),
		)
	}
	return parsed.data
}

/** Reads a response as UTF-8 text up to `limit` bytes, aborting if the body is larger. */
export async function readCappedText(response: Response, limit: number): Promise<string> {
	if (Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('Response too large')
	if (!response.body) {
		const text = await response.text()
		if (new TextEncoder().encode(text).byteLength > limit) throw new Error('Response too large')
		return text
	}
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		total += value.byteLength
		if (total > limit) {
			await reader.cancel().catch(() => {})
			throw new Error('Response too large')
		}
		chunks.push(value)
	}
	const combined = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		combined.set(chunk, offset)
		offset += chunk.byteLength
	}
	return new TextDecoder().decode(combined)
}

/** Links and QR codes use the custom domain when there is one. */
export function publicOrigin(c: Context<AppEnv>, settings: Settings): string {
	return settings.domain ? `https://${settings.domain}` : new URL(c.req.url).origin
}

export function linkJson(row: LinkRow, origin: string, stats?: LinkStats): LinkJson {
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

export function versionJson(row: PageVersionRow, page: PageRow): PageVersionJson {
	const token = row.publishedBy?.startsWith('token:') ? row.publishedBy.slice('token:'.length) : null
	return {
		id: row.id,
		publishedAt: row.publishedAt,
		by: token !== null ? 'token' : row.publishedBy === 'owner' ? 'owner' : null,
		tokenName: token,
		current: row.publishedAt === page.publishedAt,
	}
}

export function pageJson(page: PageRow): PageJson {
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

/** The pages' lines in a list. D1 works them out, so the Worker only reads a page in full to count what's untranslated. */
export async function pageSummaries(db: D1Database, settings: Settings): Promise<PageSummary[]> {
	const [rows, clicks] = await Promise.all([listPageRows(db), clicksByPage(db, settings.timezone)])
	const full = settings.languages.length ? new Map((await getPagesByIds(db, rows.map((row) => row.id))).map((page) => [page.id, page])) : new Map<string, never>()
	return rows.map((row) => {
		const page = full.get(row.id)
		const untranslatedCount = page ? Object.values(untranslated(page.draft, settings.languages)).reduce((sum, texts) => sum + texts.length, 0) : 0
		return {
			id: row.id,
			handle: row.handle,
			qrLogo: row.qrLogo,
			name: row.name,
			avatar: row.avatar ?? '',
			theme: row.theme as ThemeId,
			kind: (row.customKind as PageSummary['kind'] | null) ?? 'links',
			home: settings.home === row.id,
			publishedAt: row.publishedAt,
			draftUpdatedAt: row.draftUpdatedAt,
			dirty: !row.hasPublished || !row.sameAsPublished,
			items: row.items,
			links: row.links,
			clicks7d: clicks.get(row.id) ?? 0,
			untranslated: untranslatedCount,
		} satisfies PageSummary
	})
}

export type Label = Pick<TopTargetJson, 'label' | 'labelKey' | 'labelParams'>

/** A label the Worker words itself: the text, and its key and values for the dashboard. */
export function labelOf(key: string, params?: Params): Label {
	return { label: fill(key, params), labelKey: key, ...(params ? { labelParams: params } : {}) }
}

/** A readable name for a click target: a short link's title, or the block part that was tapped. */
export function targetLabel(target: string, rows: Map<string, LinkRow>, content: PageContent | null, pageId = ''): Label & { slug: string; kind: 'link' | 'block' } {
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
	if (!item) {
		if (part === LINE_PART) return block(labelOf(msg('LINE 按鈕')))
		// An embed card that was deleted counts under its own id, the floating button under the page's.
		return itemId === pageId && isEmbedProvider(part) ? block(labelOf(msg('{name} 按鈕'), { name: EMBEDS[part].name })) : deleted
	}
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
		case 'embed':
			// The service the tap was for, which the card may since have changed.
			return block(labelOf(msg('{name}：{title}'), { name: EMBEDS[isEmbedProvider(part) ? part : item.provider].name, title: named(item.title, msg('未命名')) }))
		default:
			return deleted
	}
}

export function insightsJson(details: Insights | null, label: (target: string) => Label) {
	return details && { ...details, recent: details.recent.map((event) => ({ ...event, ...label(event.target) })) }
}

/** The sites this Worker holds, for the dashboard to move between: none when this is the only one. */
export function siteList(c: Context<AppEnv>): SiteJson[] {
	const sites = sitesOf(c.env)
	if (sites.length < 2) return []
	const current = siteId(c.env)
	return sites.flatMap((site) => {
		// A site is opened at the first hostname listed for it. This one is at least where the request came in.
		const host = site.hosts[0] ?? (site.id === current ? new URL(c.req.url).hostname : '')
		return host ? [{ id: site.id, host, current: site.id === current }] : []
	})
}

export const deny = (message: string | Message) => new ApiError(403, 'forbidden', message)

/** Throws unless the caller signed in with the admin password (not a token). */
export function requireOwner(auth: Auth, what: string): void {
	if (auth.role === 'token') throw deny({ key: msg('API token 不能{what}，請登入後台操作'), params: { what: { key: what } } })
}

export async function loadPage(c: Context<AppEnv>): Promise<PageRow> {
	const page = await getPage(c.env.DB, c.req.param('id') ?? '')
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	return page
}

/** The draft version a request says it read, from If-Match: a page's draftUpdatedAt. */
export function seenDraft(c: Context<AppEnv>): number | undefined {
	const raw = c.req.header('if-match')?.trim().replace(/^"|"$/g, '')
	if (raw === undefined) return undefined
	const seen = Number(raw)
	if (!raw || !Number.isSafeInteger(seen)) throw needsDraftVersion()
	return seen
}

export const needsDraftVersion = (): ApiError => new ApiError(428, 'draft-version-required', msg('請先讀取頁面，再用 If-Match 標頭送回 draftUpdatedAt'))

/** Saves over a draft only if it is still the one the caller read; anything else would lose someone's work. */
export async function replaceDraft(c: Context<AppEnv>, seen: number, draft: PageContent): Promise<number> {
	const id = c.req.param('id') ?? ''
	refuseTooLarge(draft)
	const draftUpdatedAt = await saveDraft(c.env.DB, id, draft, seen)
	if (draftUpdatedAt !== null) return draftUpdatedAt
	if (!(await getPage(c.env.DB, id))) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	throw draftChanged()
}

export const rangeOf = (value: string | undefined) => {
	const days = Number(value)
	return [7, 30, 90].includes(days) ? days : 30
}
