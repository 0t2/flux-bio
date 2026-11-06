/**
 * More than one site in one Worker.
 *
 * A Worker has always been one site: its pages, short links, stats and settings in one D1 database and one KV
 * namespace. It can now hold others beside it, each with a database, a namespace and a stats dataset of its own,
 * and each reached through its own hostnames (`sites.json`, read by `cloudflare.config.ts`). Nothing is shared but
 * the code, the dashboard's files and the admin password, so a name can be one thing at one site and another at
 * the next, and a site can be moved out to a Worker of its own by giving that Worker its database.
 *
 * The rest of the Worker doesn't know. Every read and write goes through `env.DB`, `env.KV` and `env.ANALYTICS`,
 * and a request gets an `env` in which those are its site's: the hostname decides, before any route runs. What
 * a copy of the Worker remembers between requests (the schema check, the time zone, the "site" record) is kept
 * per site, by the id given here.
 */

/** The site a Worker has without any others: the bindings named DB, KV and ANALYTICS. Every hostname no other site claims is its. */
export const MAIN_SITE = 'main'

/** A site's id: it goes into the names of its database and its bindings. */
export const SITE_ID = /^[a-z][a-z0-9-]{0,23}$/

export interface SiteEntry {
	id: string
	/** Lowercase hostnames, the first being the one the dashboard links to. */
	hosts: string[]
}

type Bindings = Record<string, unknown>

/** `link` → `LINK`, `my-shop` → `MY_SHOP`: the end of a site's binding names (`DB_LINK`, `KV_LINK`, `ANALYTICS_LINK`). */
export const bindingSuffix = (id: string): string => id.toUpperCase().replaceAll('-', '_')

let parsed: { text: string; sites: SiteEntry[] } | null = null

/** The sites this Worker was deployed with, the main one first. Just the main one, with no hostnames, when none were listed. */
export function sitesOf(env: Env): SiteEntry[] {
	const text = String((env as Bindings).SITES ?? '')
	if (parsed?.text === text) return parsed.sites
	let listed: SiteEntry[] = []
	try {
		const raw = text ? (JSON.parse(text) as unknown) : {}
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			listed = Object.entries(raw as Record<string, unknown>).flatMap(([id, hosts]) =>
				SITE_ID.test(id) && Array.isArray(hosts) ? [{ id, hosts: hosts.filter((host): host is string => typeof host === 'string').map((host) => host.toLowerCase()) }] : [],
			)
		}
	} catch {
		// A list that can't be read is no list: everything is the main site's, as before there were lists.
		listed = []
	}
	const main = listed.find((site) => site.id === MAIN_SITE) ?? { id: MAIN_SITE, hosts: [] }
	const sites = [main, ...listed.filter((site) => site.id !== MAIN_SITE)]
	parsed = { text, sites }
	return sites
}

/** Which site each database is, for the things that are only handed a database. One not listed here is the main site's. */
const siteOfDatabase = new WeakMap<object, string>()

/** The id of the site this `env` is for. */
export const siteId = (env: Env): string => String((env as Bindings).SITE ?? MAIN_SITE)

/** The id of the site a database belongs to. */
export const siteOfDb = (db: D1Database): string => siteOfDatabase.get(db) ?? MAIN_SITE

/**
 * The `env` for the site a request is for, or null when the hostname belongs to a site this Worker was deployed
 * without the database or namespace of: that must never fall through to another site's data.
 */
export function siteEnv(request: Request, env: Env): Env | null {
	const sites = sitesOf(env)
	if (sites.length === 1) return env
	const host = new URL(request.url).hostname.toLowerCase()
	const site = sites.find((entry) => entry.id !== MAIN_SITE && entry.hosts.includes(host))
	if (!site) return env
	const bindings = env as Bindings
	const suffix = bindingSuffix(site.id)
	const db = bindings[`DB_${suffix}`] as D1Database | undefined
	const kv = bindings[`KV_${suffix}`] as KVNamespace | undefined
	if (!db || !kv) return null
	siteOfDatabase.set(db, site.id)
	return {
		...bindings,
		DB: db,
		KV: kv,
		// Left out in local development, as the main site's are.
		ANALYTICS: bindings[`ANALYTICS_${suffix}`],
		ANALYTICS_DATASET: `${String(bindings.ANALYTICS_DATASET ?? '')}_${site.id.replaceAll('-', '_')}`,
		SITE: site.id,
	} as unknown as Env
}

/** A value kept per site between requests, in a copy of the Worker. */
export function perSite<T>(): { get(site: string): T | undefined; set(site: string, value: T): void; delete(site: string): void; clear(): void } {
	return new Map<string, T>()
}
