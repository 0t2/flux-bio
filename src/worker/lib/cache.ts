import type { UtmTags } from '../../shared/api'
import type { Appearance, Locale, PageContent } from '../../shared/content'
import type { HostedFont } from '../../shared/fonts'
import type { LinkRow } from './db'

/**
 * KV holds what visitors need, so a page view, a redirect or a tap is one KV read.
 * D1 stays the source of truth; KV is rewritten whenever D1 changes, and a
 * missing KV entry is rebuilt from D1 on the next visit.
 *
 * Pages and short links share one namespace, the first path segment, so they share one kind of key:
 * `name:<handle or slug>` holds whichever of the two is there, and "/<anything>" never needs a second read
 * to tell them apart. "/" reads the `site` record, which carries the home page's copy.
 */

export interface Snapshot {
	v: 3
	pageId: string
	handle: string
	content: PageContent
	publishedAt: number
	/** The page language, resolved per visitor against `languages`. */
	locale: Locale
	/** More languages visitors may get (settings.languages). */
	languages: Locale[]
	/** This page is also served at "/". */
	home: boolean
	/** Fonts served by this Worker; missing, the page loads them from Google. */
	fonts?: HostedFont[]
	/** Links whose button has to use the short link (linkNeedsWorker). */
	viaShortLink: string[]
}

/** What "/" and the system pages need: the home page itself, and how pages look. */
export interface SiteRecord {
	v: 3
	/** Handle of the page served at "/", or "". */
	home: string
	locale: Locale
	languages: Locale[]
	/** The home page's look, used for 404 and other system pages. */
	look: Appearance | null
	/** Handles of published pages, offered at "/" when no page is home. */
	published: string[]
	/** false: pages are switched off, and "/" goes to `homeUrl` or says this address is for short links. */
	bio: boolean
	homeUrl: string
	/**
	 * The time zone stats count days in and pages show times in. Pages and short links don't carry it, so changing
	 * it rewrites none of them: a visit to "/" has it from here, and any other asks siteTimeZone.
	 */
	timezone: string
	/** The home page as visitors get it, so "/" is this one read. Missing with no home page, before it is published, and with pages off. */
	page?: Snapshot
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
const nameKey = (name: string) => `name:${name}`
export const MEDIA_PREFIX = 'media:'
export const mediaKey = (id: string) => `${MEDIA_PREFIX}${id}`

/** What is at a first path segment: a published page, or a short link. */
export type Named = { page: Snapshot; link?: undefined } | { link: LinkRecord; page?: undefined }

/** The page or short link at a name, in one read. A copy in a shape this version doesn't write counts as missing, and is rebuilt from D1. */
export async function getNamed(env: Env, name: string): Promise<Named | null> {
	const named = await env.KV.get<Partial<Named>>(nameKey(name), 'json')
	if (named?.page?.v === 3) return { page: named.page }
	return named?.link ? { link: named.link } : null
}

export async function getSnapshot(env: Env, handle: string): Promise<Snapshot | null> {
	return (await getNamed(env, handle))?.page ?? null
}

export function putSnapshot(env: Env, snapshot: Snapshot): Promise<void> {
	return env.KV.put(nameKey(snapshot.handle), JSON.stringify({ page: snapshot } satisfies Named))
}

export async function getLinkRecord(env: Env, slug: string): Promise<LinkRecord | null> {
	return (await getNamed(env, slug))?.link ?? null
}

export function putLinkRecord(env: Env, slug: string, link: LinkRecord): Promise<void> {
	return env.KV.put(nameKey(slug), JSON.stringify({ link } satisfies Named))
}

/** Takes away whatever visitors get at a name: a page's copy or a short link's. */
export function deleteNamed(env: Env, name: string): Promise<void> {
	return env.KV.delete(nameKey(name))
}

export async function getSite(env: Env): Promise<SiteRecord | null> {
	const site = await env.KV.get<SiteRecord>(SITE_KEY, 'json')
	return site?.v === 3 && (!site.page || site.page.v === 3) ? site : null
}

export function putSite(env: Env, site: SiteRecord): Promise<void> {
	return env.KV.put(SITE_KEY, JSON.stringify(site))
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
