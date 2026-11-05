/** TEST_SITE is "true" on what `cf deploy --mode staging` deploys: the owner's test site, separate from the live one. */
export const isTestSite = (env: Env): boolean => String((env as { TEST_SITE?: unknown }).TEST_SITE) === 'true'

/** The admin password; v0.1 called it ADMIN_TOKEN, which still works. */
export function adminPassword(env: Env): string {
	const current = (env as { ADMIN_PASSWORD?: unknown }).ADMIN_PASSWORD
	const legacy = (env as { ADMIN_TOKEN?: unknown }).ADMIN_TOKEN
	return typeof current === 'string' && current ? current : typeof legacy === 'string' ? legacy : ''
}

/** Published versions kept per page. A site itself can hold any number of pages and short links. */
export const VERSIONS_KEPT = 20

/**
 * KV operations one request may start. The free plan allows 1,000 writes and deletes a day and 1,000 calls to Cloudflare's
 * services per request. KV is a copy of D1 that a visit rebuilds, so a change to a whole site drops at most this many copies,
 * newest first, and says how many it left.
 */
export const KV_OPS_AT_ONCE = 800

/** Pages whose fonts one settings change copies: each takes several requests to Google, and the free plan allows 50 outside requests. */
export const FONT_PAGES_AT_ONCE = 8
