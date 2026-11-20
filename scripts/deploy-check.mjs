// What `pnpm run deploy` checks before anything is uploaded. A deploy from the wrong folder, or from a folder that lost
// a file, can't be taken back by the next one: it makes a second, empty site, takes a site offline, replaces someone
// else's Worker, or replaces the password. Each of those is refused here, with what to do instead.
import { execFile } from 'node:child_process'

/** The command for Cloudflare's CLI. A test puts its own in FLUXBIO_CF. */
const CF = process.env.FLUXBIO_CF ? [process.env.FLUXBIO_CF] : ['pnpm', '-s', 'exec', 'cf']
/** On Windows pnpm is a .cmd file, which only a shell can start. */
export const SHELL = process.platform === 'win32' && !process.env.FLUXBIO_CF

/** Runs Cloudflare's CLI and answers with what it printed, whether or not it worked. */
export function cf(args) {
	return new Promise((resolve) => {
		execFile(CF[0], [...CF.slice(1), ...args], { encoding: 'utf8', maxBuffer: 1 << 26, shell: SHELL }, (error, stdout, stderr) => {
			resolve({ ok: !error, stdout, stderr: `${stderr}${error && !stderr ? error.message : ''}` })
		})
	})
}

const parsed = (text) => {
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

/**
 * The bindings of the newest version of a Worker, or null when the account has no Worker of that name. Enough to
 * tell whether a Worker is FluxBio, which no version of one stops being.
 */
export async function newestVersion(name) {
	const { ok, stdout, stderr } = await cf(['workers', 'versions', 'list', '--worker-id', name, '--per-page', '1'])
	// 10007: "This Worker does not exist on your account."
	if (!ok && stderr.includes('[10007]')) return null
	const versions = ok ? parsed(stdout) : null
	if (!Array.isArray(versions)) throw new Error(stderr.trim() || 'Cloudflare gave no answer.')
	return { bindings: Array.isArray(versions[0]?.bindings) ? versions[0].bindings : [] }
}

/**
 * The bindings of the version of a Worker that is running, or null when the account has no Worker of that name.
 * That is the version its last deployment names, which is not always the newest: after a rollback in Cloudflare's
 * dashboard an older one runs, and its sites and password are the ones a deploy would change.
 */
export async function runningWorker(name) {
	const { ok, stdout, stderr } = await cf(['workers', 'deployments', 'list', '--worker', name, '--per-page', '1'])
	if (!ok && stderr.includes('[10007]')) return null
	const deployments = ok ? parsed(stdout)?.deployments : null
	if (!Array.isArray(deployments)) throw new Error(stderr.trim() || 'Cloudflare gave no answer.')
	// A deployment can split visits between two versions: the one most of them reach is the one to go by.
	const version = [...(deployments[0]?.versions ?? [])].sort((a, b) => (b?.percentage ?? 0) - (a?.percentage ?? 0))[0]?.version_id
	// A Worker that was uploaded and never deployed has no deployment, only versions.
	if (typeof version !== 'string') return newestVersion(name)
	const got = await cf(['workers', 'versions', 'get', version, '--worker-id', name])
	const running = got.ok ? parsed(got.stdout) : null
	if (!running || typeof running !== 'object') throw new Error(got.stderr.trim() || 'Cloudflare gave no answer.')
	return { bindings: Array.isArray(running.bindings) ? running.bindings : [] }
}

const textOf = (bindings, name) => bindings.find((binding) => binding.name === name && binding.type === 'plain_text')?.text

/**
 * Whether a Worker's bindings are FluxBio's. Not whether WORKER_NAME says the Worker's own name: one renamed in
 * Cloudflare's dashboard keeps the name it was deployed under there, and is FluxBio all the same.
 */
export function isFluxBio(bindings) {
	return textOf(bindings, 'WORKER_NAME') !== undefined && textOf(bindings, 'TEST_SITE') !== undefined
}

/** Every Worker on the account, by name. Cloudflare lists them a page at a time, ten unless asked for more. */
async function workerNames() {
	const names = []
	const perPage = 100
	for (let page = 1; page <= 50; page++) {
		const { ok, stdout, stderr } = await cf(['workers', 'list', '--per-page', String(perPage), '--page', String(page)])
		let workers
		try {
			workers = ok ? JSON.parse(stdout) : null
		} catch {
			workers = null
		}
		if (!Array.isArray(workers)) throw new Error(stderr.trim() || 'Cloudflare gave no answer.')
		names.push(...workers.map((worker) => worker?.name).filter((name) => typeof name === 'string'))
		if (workers.length < perPage) break
	}
	return names
}

/**
 * The live FluxBio sites on the account, other than the one named, and the Workers that couldn't be read, any of
 * which might be one. Looked for only when a deploy would make a new Worker.
 */
export async function otherFluxBios(except) {
	const names = (await workerNames()).filter((name) => name !== except)
	const found = []
	const unread = []
	const atOnce = 6
	for (let at = 0; at < names.length; at += atOnce) {
		await Promise.all(names.slice(at, at + atOnce).map(async (name) => {
			try {
				const worker = await newestVersion(name)
				if (worker && isFluxBio(worker.bindings) && textOf(worker.bindings, 'TEST_SITE') !== 'true') found.push(name)
			} catch {
				unread.push(name)
			}
		}))
	}
	return { found: found.sort(), unread: unread.sort() }
}

/** Every site a running Worker holds, "main" first: `{ id: hostnames }`. A Worker with one site has only "main". */
export function heldSites(bindings) {
	let main = []
	try {
		const listed = JSON.parse(textOf(bindings, 'SITES') ?? '{}').main
		if (Array.isArray(listed)) main = listed
	} catch {
		// A list that can't be read is a Worker with one site.
	}
	return { main, ...boundSites(bindings) }
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
export function deployProblems({ name, staging = false, live, others = [], unread = [], base = null, sites = {}, secretsFile = false, dropSites = [], makeNew = false }) {
	const problems = []
	if (!live) {
		if (makeNew) return problems
		if (staging) {
			// A test site is new the first time, but it is the test site of a live one: without that one, the folder
			// has lost its Worker's name, and this would make a stray Worker and use up a database.
			const liveName = name.replace(/-staging$/, '')
			if (!base || !isFluxBio(base.bindings)) {
				problems.push(
					`"${name}" would be the test site of "${liveName}", and ${base ? `the Worker "${liveName}" on this Cloudflare account isn't FluxBio` : `there is no Worker "${liveName}" on this Cloudflare account`}.\n` +
					'  If the live site runs under another name, write it in worker.json beside cloudflare.config.ts: { "name": "<its name>" }\n' +
					'  To make this test site anyway, pass --new.',
				)
			}
			return problems
		}
		if (!others.length && unread.length) {
			problems.push(
				`The Worker "${name}" isn't on this Cloudflare account, so this would make a new FluxBio. Whether the account already has one couldn't be told: ${unread.length === 1 ? 'one Worker' : `${unread.length} Workers`} couldn't be read (${unread.slice(0, 5).join(', ')}${unread.length > 5 ? '…' : ''}).\n` +
				'  Try again in a moment. To make a new site without knowing, pass --new.',
			)
		}
		if (others.length) {
			const one = others.length === 1
			problems.push(
				`The Worker "${name}" isn't on this Cloudflare account, so this would make a new, empty FluxBio, and the account already has ${one ? `one: "${others[0]}"` : `these: ${others.map((other) => `"${other}"`).join(', ')}`}.\n` +
				`  To update ${one ? 'that one' : 'one of them'}, write its name in worker.json beside cloudflare.config.ts: { "name": "${others[0]}" }\n` +
				'  To make another site on purpose, pass --new.',
			)
		}
		return problems
	}
	if (!isFluxBio(live.bindings)) {
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
export function deployNotes({ name, live, analytics = true, sites = {} }) {
	const notes = []
	if (!live) return notes
	const carried = textOf(live.bindings, 'WORKER_NAME')
	if (name && carried !== undefined && carried !== name) notes.push(`This Worker was deployed as "${carried}" and has been renamed to "${name}" since. The deploy updates it, and it will say its new name from now on.`)
	if (analytics && isFluxBio(live.bindings) && !live.bindings.some((binding) => binding.name === 'ANALYTICS')) {
		notes.push('The running Worker has no detailed stats (no ANALYTICS binding), and this deploy adds them. If Cloudflare answers with code 10089, write "analytics": false in worker.json.')
	}
	// A site that stays can still lose one of its addresses: a hostname no site lists shows the first site.
	for (const [id, hosts] of Object.entries(boundSites(live.bindings))) {
		if (!Object.hasOwn(sites, id)) continue
		const dropped = hosts.filter((host) => !Object.values(sites).some((listed) => Array.isArray(listed) && listed.includes(host)))
		if (dropped.length) notes.push(`${dropped.join(', ')} ${dropped.length === 1 ? 'reaches' : 'reach'} the site "${id}" now, and sites.json here doesn't list ${dropped.length === 1 ? 'it' : 'them'}: after this deploy ${dropped.length === 1 ? 'it shows' : 'they show'} the first site instead.`)
	}
	return notes
}
