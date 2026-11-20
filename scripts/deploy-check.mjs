// What `pnpm run deploy` checks before anything is uploaded. A deploy from the wrong folder, or from a folder that lost
// a file, can't be taken back by the next one: it makes a second, empty site, takes a site offline, replaces someone
// else's Worker, or replaces the password. Each of those is refused here, with what to do instead.
import { execFile } from 'node:child_process'

/** The command for Cloudflare's CLI. A test puts its own in FLUXBIO_CF. */
const CF = process.env.FLUXBIO_CF ? [process.env.FLUXBIO_CF] : ['pnpm', '-s', 'exec', 'cf']

/** Runs Cloudflare's CLI and answers with what it printed, whether or not it worked. */
export function cf(args) {
	return new Promise((resolve) => {
		execFile(CF[0], [...CF.slice(1), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }, (error, stdout, stderr) => {
			resolve({ ok: !error, stdout, stderr: `${stderr}${error && !stderr ? error.message : ''}` })
		})
	})
}

/** The bindings of the version of a Worker that is running, or null when the account has no Worker of that name. */
export async function runningWorker(name) {
	const { ok, stdout, stderr } = await cf(['workers', 'versions', 'list', '--worker-id', name, '--per-page', '1'])
	// 10007: "This Worker does not exist on your account."
	if (!ok && stderr.includes('[10007]')) return null
	let versions
	try {
		versions = ok ? JSON.parse(stdout) : null
	} catch {
		versions = null
	}
	if (!Array.isArray(versions)) throw new Error(stderr.trim() || 'Cloudflare gave no answer.')
	return { bindings: Array.isArray(versions[0]?.bindings) ? versions[0].bindings : [] }
}

const textOf = (bindings, name) => bindings.find((binding) => binding.name === name && binding.type === 'plain_text')?.text

/** Whether a Worker's bindings are those of FluxBio deployed under that name. */
export function isFluxBio(name, bindings) {
	return textOf(bindings, 'WORKER_NAME') === name && textOf(bindings, 'TEST_SITE') !== undefined
}

/** The live FluxBio sites on the account, other than the one named. Looked for only when a deploy would make a new Worker. */
export async function otherFluxBios(except) {
	const { ok, stdout, stderr } = await cf(['workers', 'list'])
	let workers
	try {
		workers = ok ? JSON.parse(stdout) : null
	} catch {
		workers = null
	}
	if (!Array.isArray(workers)) throw new Error(stderr.trim() || 'Cloudflare gave no answer.')
	const names = workers.map((worker) => worker?.name).filter((name) => typeof name === 'string' && name !== except)
	const found = []
	const atOnce = 6
	for (let at = 0; at < names.length; at += atOnce) {
		await Promise.all(names.slice(at, at + atOnce).map(async (name) => {
			const worker = await runningWorker(name).catch(() => null)
			if (worker && isFluxBio(name, worker.bindings) && textOf(worker.bindings, 'TEST_SITE') !== 'true') found.push(name)
		}))
	}
	return found.sort()
}

/** The sites a running Worker holds besides "main", from its SITES binding: `{ id: hostnames }`. */
export function boundSites(bindings) {
	try {
		const sites = JSON.parse(textOf(bindings, 'SITES') ?? '{}')
		return Object.fromEntries(Object.entries(sites).filter(([id, hosts]) => id !== 'main' && Array.isArray(hosts)))
	} catch {
		return {}
	}
}

/**
 * Why a deploy must not go ahead, each with what to do instead; none when it may. `live` is the running Worker's
 * bindings, or null when the Worker would be new; `others` the account's other FluxBio sites, asked for only then.
 */
export function deployProblems({ name, staging = false, live, others = [], sites = {}, secretsFile = false, dropSites = [], makeNew = false }) {
	const problems = []
	if (!live) {
		if (!staging && others.length && !makeNew) {
			const one = others.length === 1
			problems.push(
				`The Worker "${name}" isn't on this Cloudflare account, so this would make a new, empty FluxBio, and the account already has ${one ? `one: "${others[0]}"` : `these: ${others.map((other) => `"${other}"`).join(', ')}`}.\n` +
				`  To update ${one ? 'that one' : 'one of them'}, write its name in worker.json beside cloudflare.config.ts: { "name": "${others[0]}" }\n` +
				'  To make another site on purpose, pass --new.',
			)
		}
		return problems
	}
	if (!isFluxBio(name, live.bindings)) {
		problems.push(
			`A Worker named "${name}" is already on this Cloudflare account, and it isn't FluxBio. Deploying would replace it.\n` +
			'  Give this site another name in worker.json beside cloudflare.config.ts: { "name": "<another name>" }',
		)
		return problems
	}
	const bound = boundSites(live.bindings)
	const gone = Object.keys(bound).filter((id) => !Object.hasOwn(sites, id) && !dropSites.includes(id))
	if (gone.length && !staging) {
		const list = gone.map((id) => `"${id}"${bound[id].length ? ` (${bound[id].join(', ')})` : ''}`).join(' and ')
		problems.push(
			`This would take ${gone.length === 1 ? 'the site' : 'the sites'} ${list} offline: the running Worker holds ${gone.length === 1 ? 'it' : 'them'}, and sites.json here doesn't.\n` +
			`  To keep everything as it runs now, save this as sites.json beside cloudflare.config.ts:\n  ${textOf(live.bindings, 'SITES')}\n` +
			`  To take ${gone.length === 1 ? 'that site' : 'those sites'} off on purpose, pass ${gone.map((id) => `--drop-site ${id}`).join(' ')}. Its database stays.`,
		)
	}
	if (secretsFile && live.bindings.some((binding) => binding.name === 'ADMIN_PASSWORD' && binding.type === 'secret_text')) {
		problems.push(
			`"${name}" already has its password, and --secrets-file would replace it: everyone is signed out and every API token stops working.\n` +
			'  Deploy without --secrets-file: Cloudflare keeps the password. If a first deploy stopped halfway, its password is the one that is set.\n' +
			'  To change the password, run pnpm reset-password.',
		)
	}
	return problems
}

/** Things worth saying that stop nothing. */
export function deployNotes({ live, analytics = true }) {
	if (live && analytics && !live.bindings.some((binding) => binding.name === 'ANALYTICS')) {
		return ['The running Worker has no detailed stats (no ANALYTICS binding), and this deploy adds them. If Cloudflare answers with code 10089, write "analytics": false in worker.json.']
	}
	return []
}
