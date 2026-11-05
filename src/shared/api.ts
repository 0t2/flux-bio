/**
 * Shapes of the JSON API under /api. The dashboard uses these types, and so
 * can scripts or AI agents (authenticate with `Authorization: Bearer <ADMIN_PASSWORD>`
 * or an API token from 設定 → API token).
 */
import type { Params } from '../templates/msg'
import type { CommunityTheme } from './community'
import type { PageContent, SavedTheme, Settings, ThemeId } from './content'
import type { GoogleFont } from './fonts'
import type { Untranslated } from './translations'
import type { Problem } from './validate'

/**
 * Text the API sends is in English. Where it has values in it, a translation key
 * and the values come along (`key` and `params`, or `labelKey`, `placeKey`…),
 * so the dashboard can show it in its own language (see src/templates/msg.ts).
 * Agents can read the English text and ignore them.
 */
export interface ApiErrorBody {
	error: string
	message: string
	key?: string
	params?: Params
	problems?: Problem[]
}

export type Role = 'admin' | 'token'

/** GET /api/auth/info — needs no sign-in. */
export interface AuthInfo {
	/** Why the dashboard can't be used yet (e.g. ADMIN_PASSWORD missing), or null. */
	setup: string | null
}

export interface PageSummary {
	id: string
	handle: string
	/** The picture in QR codes of this page's links that follow the default. */
	qrLogo: string | null
	name: string
	avatar: string | null
	theme: ThemeId
	/** A page of links, someone's own HTML, or a way on to another address. */
	kind: 'links' | 'html' | 'redirect'
	/** Served at "/". */
	home: boolean
	publishedAt: number | null
	draftUpdatedAt: number
	/** The draft differs from what visitors see. */
	dirty: boolean
	items: number
	links: number
	/** Clicks on this page's links and blocks over the last 7 days. */
	clicks7d: number
	/** Texts in the draft with no translation yet, added up over the languages turned on. */
	untranslated: number
}

/** GET /api/state */
export interface StateResponse {
	version: string
	origin: string
	role: Role
	settings: Settings
	pages: PageSummary[]
	/** Analytics Engine is reachable (it isn't in local development). */
	analytics: boolean
	/** This is the owner's test site, deployed with `--mode staging`, not their live site. */
	testSite: boolean
	limits: { pages: number; links: number }
}

export interface PageJson {
	id: string
	handle: string
	qrLogo: string | null
	position: number
	draft: PageContent
	published: PageContent | null
	draftUpdatedAt: number
	publishedAt: number | null
	/** GET /api/pages/:id only: per language turned on, the draft's texts with no translation yet. */
	untranslated?: Untranslated
}

/** POST /api/pages/:id/publish */
/** PUT /api/pages/:id/links/:itemId/short. */
export interface ShortLinkResponse {
	link: LinkJson
	draftUpdatedAt: number
}

export interface PublishResponse {
	publishedAt: number
	content: PageContent
	/** Publishing fills in slugs, so the draft has a new version: the one to send with the next change. */
	draftUpdatedAt: number
	/** Per language turned on, the texts that show as written because they have no translation yet. */
	untranslated: Untranslated
}

/** One published version of a page, kept so a publish can be undone. */
export interface PageVersionJson {
	id: string
	publishedAt: number
	/** Who published it. Null for a version from before these were recorded. */
	by: 'owner' | 'token' | null
	/** The token's name when `by` is "token", as it was then. */
	tokenName: string | null
	/** What visitors see now. */
	current: boolean
}

export interface LinkStatsJson {
	/** Clicks per day over `days`, oldest first. */
	series: number[]
	total: number
	sources: { source: string; count: number }[]
}

export interface LinkJson {
	id: string
	slug: string
	/** The full short URL, e.g. "https://fluxbio.link/lens". */
	short: string
	url: string
	title: string
	/** "bio" links are managed through a page draft; "solo" links stand alone. */
	kind: 'bio' | 'solo'
	/** The page a bio link is on. */
	pageId: string | null
	status: 'active' | 'archived'
	startsAt: number | null
	expiresAt: number | null
	hasPassword: boolean
	utm: UtmTags
	iosUrl: string | null
	androidUrl: string | null
	lineExternal: boolean
	inAppPrompt: boolean
	/** Saved QR code style (see shared/qr.ts), or null for the default. */
	qr: unknown
	createdAt: number
	updatedAt: number
	stats?: LinkStatsJson
}

/** GET /api/links */
export interface LinksResponse {
	days: string[]
	links: LinkJson[]
}

/** POST /api/links */
export interface CreateLinkResponse {
	link: LinkJson
	short: string
}

/** POST /api/links/bulk */
export interface BulkLinksResponse {
	created: LinkJson[]
	errors: ({ index: number } & Pick<ApiErrorBody, 'message' | 'key' | 'params'>)[]
}

/** A label the Worker made up, as a translation key with its values; absent when the label is the owner's own text, such as a link title. */
export interface LabelKey {
	labelKey?: string
	labelParams?: Params
}

export interface RankedJson {
	value: string
	count: number
}

export interface RecentEventJson extends LabelKey {
	/** Event time as reported by Analytics Engine (UTC). */
	at: string
	kind: 'view' | 'click'
	target: string
	/** "bio 頁" for page views, otherwise the link's or block's name. */
	label: string
	source: string
	country: string
	region: string
	city: string
	device: string
	os: string
	browser: string
}

/** A short link's campaign tags, added to its destination; null leaves a tag out. */
export interface UtmTags {
	source: string | null
	medium: string | null
	campaign: string | null
	/** Tells apart places on one platform, e.g. "bio", "story", "post". */
	content: string | null
}

/** Detailed numbers from Analytics Engine, covering at most the last 90 days. */
export interface InsightsJson {
	/** Distinct visitors per day, summed over the range. */
	visitors: number
	previousVisitors: number
	/** Keyed by "YYYY-MM-DD". */
	visitorsByDay: Record<string, number>
	countries: RankedJson[]
	/** `value` is "<country code>:<city>", e.g. "TW:Taipei". */
	cities: RankedJson[]
	/** Clicks by country and region, e.g. { country: "TW", region: "Kaohsiung City" }. */
	places: { country: string; region: string; count: number }[]
	devices: RankedJson[]
	os: RankedJson[]
	browsers: RankedJson[]
	/** BCP 47 tags such as "zh-TW". */
	languages: RankedJson[]
	/** Other sites that sent visitors, by host name. */
	referrers: RankedJson[]
	/** Networks visitors came through (Cloudflare's AS organization), e.g. "Chunghwa Telecom". */
	networks: RankedJson[]
	/** Where visitors were, from their IP, rounded to 0.1° (a town, not an address). The busiest 300 spots. */
	points: { lat: number; lon: number; country: string; city: string; count: number }[]
	/** Page views and clicks by their UTM tags; "" where a tag is missing. The busiest 12. */
	campaigns: { source: string; medium: string; campaign: string; content: string; views: number; clicks: number }[]
	/** Clicks by weekday (0 = Monday) × hour, in the site's time zone. */
	heatmap: number[][]
	recent: RecentEventJson[]
}

export interface TopTargetJson extends LabelKey {
	target: string
	/** The short link's title, or what was tapped in a block, e.g. "商品：招牌商品". */
	label: string
	/** The short link's slug; "" for clicks inside blocks. */
	slug: string
	kind: 'link' | 'block'
	count: number
}

/** POST /api/pages/:id/preview-link */
export interface PreviewLinkResponse {
	/** Opens the live draft without signing in. */
	url: string
	/** Epoch ms. */
	expiresAt: number
}

/** GET /api/stats?page=<id>&days=7|30|90 */
export interface StatsResponse {
	page: { id: string; handle: string } | null
	timezone: string
	days: string[]
	views: number[]
	clicks: number[]
	totals: { views: number; clicks: number }
	/** The same period length just before, for comparison. */
	previous: { views: number; clicks: number }
	topLinks: TopTargetJson[]
	/** Where clicks came from (exact counts from D1). */
	clickSources: RankedJson[]
	/** Where page views came from. */
	viewSources: RankedJson[]
	/** null when Analytics Engine isn't available, e.g. in local development. */
	insights: InsightsJson | null
}

/** GET /api/links/:id/stats?days=7|30|90 */
export interface LinkStatsResponse {
	link: LinkJson
	/** Where the link sits, e.g. "mei 的 bio 頁「週末市集」". */
	place: string
	/** `place` as a translation key with its values. */
	placeKey: string
	placeParams: Params
	timezone: string
	days: string[]
	clicks: number[]
	total: number
	previous: number
	sources: RankedJson[]
	insights: InsightsJson | null
}

export interface TokenJson {
	id: string
	name: string
	scope: 'links' | 'full'
	hint: string
	createdAt: number
	lastUsedAt: number | null
}

/** POST /api/tokens — the token itself is shown only in this response. */
export interface CreateTokenResponse {
	token: string
	info: TokenJson
}

export interface ThemesResponse {
	themes: SavedTheme[]
}

/** A preset from themes/community.json, with its style and the kinds of page it suits. */
export type { CommunityTheme }

export interface FontsResponse {
	fonts: GoogleFont[]
	/** How many families match, of which `fonts` are the first. */
	total: number
}

export interface CommunityThemesResponse {
	themes: CommunityTheme[]
	/** Where the list came from: GitHub, or the copy bundled with this version. */
	source: 'github' | 'bundled'
}
