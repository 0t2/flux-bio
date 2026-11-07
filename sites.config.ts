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
export function listedSites(): Record<string, string[]> {
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
