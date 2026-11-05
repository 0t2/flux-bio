import type { UtmTags } from '../../shared/api'
import type { Appearance, Locale, LocaleSetting, PageContent } from '../../shared/content'
import type { HostedFont } from '../../shared/fonts'
import type { LinkRow } from './db'

/**
 * KV holds what visitors need, so a page view or a redirect is one KV read.
 * D1 stays the source of truth; KV is rewritten whenever D1 changes, and a
 * missing KV entry is rebuilt from D1 on the next visit.
 */

export interface Snapshot {
	v: 3
	pageId: string
	handle: string
	content: PageContent
	publishedAt: number
	/** The page language, resolved per visitor against `languages` ("auto" in copies from before v0.3). */
	locale: LocaleSetting
	/** More languages visitors may get (settings.languages); missing in copies from before v0.3. */
	languages?: Locale[]
	/** This page is also served at "/". */
	home: boolean
	/** Fonts served by this Worker; missing, the page loads them from Google. */
	fonts?: HostedFont[]
	/** Links whose button has to use the short link (linkNeedsWorker). */
	viaShortLink: string[]
}

/** What "/" and the system pages need: which page is home, and how pages look. */
export interface SiteRecord {
	v: 2
	/** Handle of the page served at "/", or "". */
	home: string
	locale: LocaleSetting
	languages?: Locale[]
	/** The home page's look, used for 404 and other system pages. */
	look: Appearance | null
	/** Handles of published pages, offered at "/" when no page is home. */
	published: string[]
	/** false: pages are switched off, and "/" goes to `homeUrl` or says this address is for short links. Missing in older copies, which means on. */
	bio?: boolean
	homeUrl?: string
	/**
	 * The time zone stats count days in and pages show times in. Visits read it from here at most once in
	 * 5 minutes per copy of the Worker (siteTimeZone), so changing it rewrites no page or short link.
	 * Missing in older copies, which are then rebuilt from D1.
	 */
	timezone?: string
}

export interface LinkRecord {
	id: string
	url: string
	startsAt: number | null
	expiresAt: number | null
	passwordHash: string | null
	utm: UtmTags
	/** The page a bio link belongs to, for the "see the other links" button on its expired page. */
	page: string | null
	ios: string | null
	android: string | null
	line: boolean
	inApp: boolean
}

const SITE_KEY = 'site'
const pageKey = (handle: string) => `page:${handle}`
const linkKey = (slug: string) => `link:${slug}`
export const mediaKey = (id: string) => `media:${id}`

export async function getSnapshot(env: Env, handle: string): Promise<Snapshot | null> {
	const snapshot = await env.KV.get<Snapshot>(pageKey(handle), 'json')
	return snapshot?.v === 3 ? snapshot : null
}

export function putSnapshot(env: Env, snapshot: Snapshot): Promise<void> {
	return env.KV.put(pageKey(snapshot.handle), JSON.stringify(snapshot))
}

export function deleteSnapshot(env: Env, handle: string): Promise<void> {
	return env.KV.delete(pageKey(handle))
}

export async function getSite(env: Env): Promise<SiteRecord | null> {
	const site = await env.KV.get<SiteRecord>(SITE_KEY, 'json')
	return site?.v === 2 ? site : null
}

export function putSite(env: Env, site: SiteRecord): Promise<void> {
	return env.KV.put(SITE_KEY, JSON.stringify(site))
}

export function getLinkRecord(env: Env, slug: string): Promise<LinkRecord | null> {
	return env.KV.get<LinkRecord>(linkKey(slug), 'json')
}

export function putLinkRecord(env: Env, slug: string, record: LinkRecord): Promise<void> {
	return env.KV.put(linkKey(slug), JSON.stringify(record))
}

export function deleteLinkRecord(env: Env, slug: string): Promise<void> {
	return env.KV.delete(linkKey(slug))
}

export function toLinkRecord(link: LinkRow): LinkRecord {
	return {
		id: link.id,
		url: link.url,
		startsAt: link.startsAt,
		expiresAt: link.expiresAt,
		passwordHash: link.passwordHash,
		utm: { source: link.utmSource, medium: link.utmMedium, campaign: link.utmCampaign, content: link.utmContent },
		page: link.pageId,
		ios: link.iosUrl,
		android: link.androidUrl,
		line: link.lineExternal,
		inApp: link.inAppPrompt,
	}
}
