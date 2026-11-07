import { bindings, defineConfig } from 'cf/config'
import { listedSites } from './sites.config.ts'
import { SCOPED_MEDIA_PATH } from './src/shared/mediaAssetPaths.ts'

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

export default defineConfig(({ mode }) => {
	const staging = mode === 'staging'
	const name = staging ? `${WORKER_NAME}-staging` : WORKER_NAME
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
					...(mode === 'development' ? [] : [[`ANALYTICS_${suffix}`, bindings.analyticsEngineDataset({ name: `${dataset}_${id.replaceAll('-', '_')}` })]]),
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
			// One URL per instance is enough; per-version preview URLs would expose the dashboard twice.
			previewUrls: false,
			observability: {
				enabled: true,
				// console.error stays for us. The per-request log records each visitor's request headers, which FluxBio promises not to keep.
				logs: { invocationLogs: false },
			},
			assets: {
				notFoundHandling: 'none',
				// Scoped files are only reachable through the selected site's /media route.
				runWorkerFirst: [`${SCOPED_MEDIA_PATH}/*`, ...(staging || otherSites.length ? ['/media/*'] : [])],
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
