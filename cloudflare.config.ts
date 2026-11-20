import { bindings, defineConfig } from 'cf/config'
import { listedSites } from './sites.config.ts'
import { workerSettings } from './worker.config.ts'

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

// What is one deployment's own is not written here, where the next update would replace it: the Worker's name, its
// custom domains and whether it has detailed stats are in worker.json (worker.config.ts), and its other sites in
// sites.json (sites.config.ts).

export default defineConfig(({ mode }) => {
	const staging = mode === 'staging'
	const own = workerSettings()
	const name = staging ? `${own.name}-staging` : own.name
	// Not in `cf dev`: the SQL binding reaches Cloudflare and wants a sign-in, and that is what would stop someone
	// trying FluxBio on their own computer before they have an account. The Worker runs without them. Nor on an
	// account where Analytics Engine can't be turned on, which worker.json says with "analytics": false.
	const analytics = mode !== 'development' && own.analytics
	// Analytics Engine datasets are account-wide, so each instance writes to its own.
	const dataset = name.replace(/-/g, '_')
	// The test site is one site: the others' hostnames belong to the live Worker, so nothing could reach them here.
	const sites = staging ? {} : listedSites()
	// DB_LINK, KV_LINK and ANALYTICS_LINK for a site called "link", beside the main site's DB, KV and ANALYTICS.
	const otherSites = Object.keys(sites).filter((id) => id !== 'main')
	const more = Object.fromEntries(
		otherSites
			.flatMap((id) => {
				const suffix = id.toUpperCase().replaceAll('-', '_')
				return [
					[`DB_${suffix}`, bindings.d1({ name: `${name}-${id}` })],
					[`KV_${suffix}`, bindings.kv({})],
					...(analytics ? [[`ANALYTICS_${suffix}`, bindings.analyticsEngineDataset({ name: `${dataset}_${id.replaceAll('-', '_')}` })]] : []),
				]
			}),
	)
	return {
		worker: {
			name,
			compatibilityDate: '2026-10-15',
			// fetch() to this Worker's own custom domain goes in at the front door, as anyone's would. Without it a request to a
			// hostname on the Worker's own zone goes to the zone's origin, which a custom domain doesn't have, and the custom
			// domain check (lib/domain.ts) got 522 for every domain it was meant to confirm.
			compatibilityFlags: ['global_fetch_strictly_public'],
			entrypoint: 'src/worker/index.ts',
			workersDev: true,
			// A domain added in Cloudflare's dashboard needs no line here and stays through a deploy. The test site has none.
			...(staging || !own.domains.length ? {} : { domains: own.domains }),
			// One URL per instance is enough; per-version preview URLs would expose the dashboard twice.
			previewUrls: false,
			observability: {
				enabled: true,
				// console.error stays for us. The per-request log records each visitor's request headers, which FluxBio promises not to keep.
				logs: { invocationLogs: false },
			},
			assets: {
				notFoundHandling: 'none',
				// Scoped files are only reachable through the selected site's /media route. The path is SCOPED_MEDIA_PATH, written
				// out: a module this file imports can't be loaded by the Worker in `cf dev` (tests/media-assets.test.ts).
				runWorkerFirst: ['/_site-media/*', ...(staging || otherSites.length ? ['/media/*'] : [])],
			},
			env: {
				/** The dashboard password, at least 12 characters. Set it with `cf deploy --secrets-file` (see AGENTS.md). */
				ADMIN_PASSWORD: bindings.secret(),
				DB: bindings.d1({ name }),
				KV: bindings.kv({}),
				ASSETS: bindings.assets(),
				...(analytics
					? {
							/** Raw visit and click events (Workers Analytics Engine). Created on first write. */
							ANALYTICS: bindings.analyticsEngineDataset({ name: dataset }),
							/** Reads those events with SQL, without an API token. */
							ANALYTICS_SQL: bindings.analytics(),
						}
					: {}),
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
