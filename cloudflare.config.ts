import { bindings, defineConfig } from 'cf/config'

/**
 * Cloudflare configuration for FluxBio, read by the `cf` CLI and the Vite plugin.
 * https://developers.cloudflare.com/workers/
 *
 * The D1 database and KV namespace are referenced by name only; `cf deploy`
 * creates them on the first deploy. The Worker creates its own database
 * tables on first use, so there is no migration step.
 *
 * `cf deploy --mode staging` deploys the owner's test site: a separate Worker,
 * named after this one, with its own D1, KV and stats, kept out of search engines.
 */

/** This site's Worker. If the name is taken on your account, change it here. */
const WORKER_NAME = 'flux-bio'

/**
 * More sites for this Worker to hold, each with a database and a KV namespace of its own (AGENTS.md 1.8). They are
 * listed in `sites.json` beside this file, which isn't part of the code so that updating FluxBio leaves it alone:
 *
 *   { "main": ["example.bio"], "link": ["example.link"] }
 *
 * An id, then the hostnames that reach that site. "main" is the site every Worker has, and the others are added to
 * it. Where there is no file, as in CI, the same JSON can come in FLUXBIO_SITES.
 *
 * A deploy binds exactly what is listed here. One made without the list unbinds the other sites, whose hostnames
 * would then show the main site: so a list that can't be read stops the deploy, and the file travels with the folder.
 */
function listedSites(): Record<string, string[]> {
	// This file runs in Node, but the Worker's type check reads it too and knows nothing of Node: hence no import.
	const node = (globalThis as unknown as { process: { env: Record<string, string | undefined>; getBuiltinModule(id: string): unknown } }).process
	const { existsSync, readFileSync } = node.getBuiltinModule('node:fs') as { existsSync(path: URL): boolean; readFileSync(path: URL, encoding: 'utf8'): string }
	const file = new URL('./sites.json', import.meta.url)
	const text = existsSync(file) ? readFileSync(file, 'utf8') : (node.env.FLUXBIO_SITES ?? '')
	if (!text.trim()) return {}
	const from = existsSync(file) ? 'sites.json' : 'FLUXBIO_SITES'
	let listed: unknown
	try {
		listed = JSON.parse(text)
	} catch {
		throw new Error(`${from} is not JSON. It reads like { "main": ["example.bio"], "link": ["example.link"] }.`)
	}
	if (!listed || typeof listed !== 'object' || Array.isArray(listed)) throw new Error(`${from} has to be an object: a site's id, then its hostnames.`)
	const claimed = new Map<string, string>()
	for (const [id, hosts] of Object.entries(listed)) {
		// The same rule as SITE_ID in src/worker/lib/sites.ts: an id goes into the names of a database and of bindings.
		if (!/^[a-z][a-z0-9-]{0,23}$/.test(id)) throw new Error(`${from}: "${id}" can't be a site's id. Use lowercase letters, digits and hyphens, starting with a letter.`)
		if (!Array.isArray(hosts) || hosts.some((host) => typeof host !== 'string' || !/^[a-z0-9.-]+$/.test(host))) {
			throw new Error(`${from}: "${id}" needs a list of hostnames in lowercase, like ["example.link"], without https:// or a path.`)
		}
		if (id !== 'main' && !hosts.length) throw new Error(`${from}: "${id}" has no hostname, so nothing could reach it.`)
		for (const host of hosts as string[]) {
			if (claimed.has(host)) throw new Error(`${from}: ${host} is listed for both "${claimed.get(host)}" and "${id}".`)
			claimed.set(host, id)
		}
	}
	return listed as Record<string, string[]>
}

export default defineConfig(({ mode }) => {
	const staging = mode === 'staging'
	const name = staging ? `${WORKER_NAME}-staging` : WORKER_NAME
	// Analytics Engine datasets are account-wide, so each instance writes to its own.
	const dataset = name.replace(/-/g, '_')
	// The test site is one site: the others' hostnames belong to the live Worker, so nothing could reach them here.
	const sites = staging ? {} : listedSites()
	// DB_LINK, KV_LINK and ANALYTICS_LINK for a site called "link", beside the main site's DB, KV and ANALYTICS.
	const more = Object.fromEntries(
		Object.keys(sites)
			.filter((id) => id !== 'main')
			.flatMap((id) => {
				const suffix = id.toUpperCase().replaceAll('-', '_')
				return [
					[`DB_${suffix}`, bindings.d1({ name: `${name}-${id}` })],
					[`KV_${suffix}`, bindings.kv({})],
					...(mode === 'development' ? [] : [[`ANALYTICS_${suffix}`, bindings.analyticsEngineDataset({ name: `${dataset}_${id.replaceAll('-', '_')}` })]]),
				]
			}),
	)
	return {
		worker: {
			name,
			compatibilityDate: '2026-10-15',
			entrypoint: 'src/worker/index.ts',
			workersDev: true,
			// One URL per instance is enough; per-version preview URLs would expose the dashboard twice.
			previewUrls: false,
			observability: {
				enabled: true,
				// console.error stays for us. The per-request log records each visitor's request headers, which FluxBio promises not to keep.
				logs: { invocationLogs: false },
			},
			assets: {
				notFoundHandling: 'none',
			},
			env: {
				/** The dashboard password, at least 12 characters. Set it with `cf deploy --secrets-file` (see AGENTS.md). */
				ADMIN_PASSWORD: bindings.secret(),
				DB: bindings.d1({ name }),
				KV: bindings.kv({}),
				ASSETS: bindings.assets(),
				// Not in `cf dev`: the SQL binding reaches Cloudflare and wants a sign-in, and that is what would stop
				// someone trying FluxBio on their own computer before they have an account. The Worker runs without them.
				...(mode === 'development'
					? {}
					: {
							/** Raw visit and click events (Workers Analytics Engine). Created on first write. */
							ANALYTICS: bindings.analyticsEngineDataset({ name: dataset }),
							/** Reads those events with SQL, without an API token. */
							ANALYTICS_SQL: bindings.analytics(),
						}),
				ANALYTICS_DATASET: bindings.text(dataset),
				/** The Worker's own name, for the commands the agent guide gives (a custom domain hides it). */
				WORKER_NAME: bindings.text(name),
				/** "true" makes this the owner's test site: kept out of search engines, and it says so to agents. */
				TEST_SITE: bindings.text(staging ? 'true' : 'false'),
				/** Which hostnames reach which site, when this Worker holds more than one (src/worker/lib/sites.ts). */
				SITES: bindings.text(JSON.stringify(sites)),
				// Typed as nothing, so the names this Worker's code knows keep their own types.
				...(more as Record<never, never>),
			},
		},
	}
})
