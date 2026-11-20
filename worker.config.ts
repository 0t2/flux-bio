/**
 * What is this deployment's own, and not FluxBio's: the Worker's name, the custom domains the configuration attaches to
 * it, and whether it has detailed stats. It is read from `worker.json` beside this file, which isn't part of the code so
 * that updating FluxBio leaves it alone:
 *
 *   { "name": "my-links", "domains": ["links.example.com"], "analytics": false }
 *
 * Each of the three is optional, and so is the file: without it the Worker is `flux-bio`, with no domain of its own in
 * the configuration (one added in Cloudflare's dashboard stays) and with detailed stats. Where there is no file, as in
 * CI, the same JSON can come in FLUXBIO_WORKER.
 *
 * Nobody edits `cloudflare.config.ts` for these any more: an edit there is lost when the code is replaced, and a deploy
 * under the wrong name makes a second, empty site.
 */
export interface WorkerSettings {
	/** The Worker's name. `--mode staging` adds `-staging` to it. */
	name: string
	/** Custom domains for the configuration to attach. The live Worker's only: a test site has none. */
	domains: string[]
	/** False leaves out the Analytics Engine bindings, for an account where it can't be turned on (AGENTS.md 1.5). */
	analytics: boolean
}

export const DEFAULT_WORKER_NAME = 'flux-bio'

export function workerSettings(): WorkerSettings {
	// This file runs in Node, but the Worker's type check reads it too and knows nothing of Node: hence no import.
	const node = (globalThis as unknown as { process: { env: Record<string, string | undefined>; getBuiltinModule(id: string): unknown } }).process
	const { existsSync, readFileSync } = node.getBuiltinModule('node:fs') as { existsSync(path: URL): boolean; readFileSync(path: URL, encoding: 'utf8'): string }
	const file = new URL('./worker.json', import.meta.url)
	const text = existsSync(file) ? readFileSync(file, 'utf8') : (node.env.FLUXBIO_WORKER ?? '')
	const settings: WorkerSettings = { name: DEFAULT_WORKER_NAME, domains: [], analytics: true }
	if (!text.trim()) return settings
	const from = existsSync(file) ? 'worker.json' : 'FLUXBIO_WORKER'
	const example = '{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }'
	let own: unknown
	try {
		own = JSON.parse(text)
	} catch {
		throw new Error(`${from} is not JSON. It reads like ${example}.`)
	}
	if (!own || typeof own !== 'object' || Array.isArray(own)) throw new Error(`${from} has to be an object, like ${example}.`)
	for (const [key, value] of Object.entries(own)) {
		if (key === 'name') {
			// What Cloudflare takes for a Worker's name, since a site made before this file may have any of it. A test site
			// adds "-staging" to it, which Cloudflare refuses by itself where that makes it too long.
			if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(value)) {
				throw new Error(`${from}: "name" is the Worker's name: up to 63 lowercase letters, digits, hyphens and underscores, like "my-links".`)
			}
			settings.name = value
		} else if (key === 'domains') {
			if (!Array.isArray(value) || value.some((host) => typeof host !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host))) {
				throw new Error(`${from}: "domains" is a list of hostnames in lowercase, like ["links.example.com"], without https:// or a path.`)
			}
			settings.domains = value as string[]
		} else if (key === 'analytics') {
			if (typeof value !== 'boolean') throw new Error(`${from}: "analytics" is true or false.`)
			settings.analytics = value
		} else {
			throw new Error(`${from}: "${key}" isn't a setting. There are three: "name", "domains" and "analytics".`)
		}
	}
	return settings
}
