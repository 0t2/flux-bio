/** TEST_SITE is "true" on what `cf deploy --mode staging` deploys: the owner's test site, separate from the live one. */
export const isTestSite = (env: Env): boolean => String((env as { TEST_SITE?: unknown }).TEST_SITE) === 'true'

/** The admin password; v0.1 called it ADMIN_TOKEN, which still works. */
export function adminPassword(env: Env): string {
	const current = (env as { ADMIN_PASSWORD?: unknown }).ADMIN_PASSWORD
	const legacy = (env as { ADMIN_TOKEN?: unknown }).ADMIN_TOKEN
	return typeof current === 'string' && current ? current : typeof legacy === 'string' ? legacy : ''
}

/** How much one deployment may hold. */
export const LIMITS = { pages: 50, links: 5000, versions: 20 }
