// Sets a new admin password for this FluxBio, then makes a full API token for each of its sites, because a new
// password signs everyone out and revokes every token made before it.
//   pnpm reset-password --site https://links.example.com
//   pnpm reset-password --site <url> --site <another site's url>     where a site's address isn't in sites.json
//   pnpm reset-password --site <url> --mode staging                  the test site, which gets no token
//   pnpm reset-password --site <url> --token-name "Claude Code"
//   pnpm reset-password --site <url> --no-tokens
//   pnpm reset-password --site <url> --check                         only says what it would do: nothing is changed
// It prints nothing secret. The password goes to .secrets.env and the tokens to .tokens.env, both kept out of git:
// hand them over and delete the files.
import { randomInt } from 'node:crypto'
import { chmodSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { workerSettings } from '../worker.config.ts'
import { cf, heldSites, isFluxBio, runningWorker } from './deploy-check.mjs'

function fail(message) {
	console.error(message)
	process.exit(1)
}

const args = process.argv.slice(2)
const opts = { sites: process.env.FLUXBIO_SITE ? [process.env.FLUXBIO_SITE] : [], mode: null, tokenName: 'AI', tokens: true, check: false }
let given = false
for (let i = 0; i < args.length; i++) {
	const arg = args[i]
	const value = () => {
		const next = args[++i]
		return next && !next.startsWith('--') ? next : fail(`${arg} needs a value.`)
	}
	if (arg === '--') continue
	else if (arg === '--site') {
		// The first one given replaces FLUXBIO_SITE; more of them add sites.
		if (!given) opts.sites = []
		given = true
		opts.sites.push(value())
	} else if (arg === '--mode') opts.mode = value()
	else if (arg === '--token-name') opts.tokenName = value()
	else if (arg === '--no-tokens') opts.tokens = false
	else if (arg === '--check') opts.check = true
	else fail(`Unknown option ${arg}. Try --site <url>, --mode staging, --token-name <name>, --no-tokens or --check.`)
}
if (opts.mode !== null && opts.mode !== 'staging') fail(`There is no mode "${opts.mode}". --mode staging is the test site, and without it the live one.`)

let settings
try {
	settings = workerSettings()
} catch (error) {
	fail(error.message)
}
const staging = opts.mode === 'staging'
const name = staging ? `${settings.name}-staging` : settings.name
if (!opts.sites.length && !staging && settings.domains[0]) opts.sites = [`https://${settings.domains[0]}`]
if (!opts.sites.length) fail('Which site? Pass --site https://<your site>, or set FLUXBIO_SITE.')
const addresses = opts.sites.map((site) => {
	try {
		const address = new URL(site)
		if (!['https:', 'http:'].includes(address.protocol)) throw new Error('Not a web address')
		return address
	} catch {
		return fail(`${site} is not an address. Write it as https://<your site>.`)
	}
})

let live
try {
	live = await runningWorker(name)
} catch (error) {
	fail(`Nothing was changed: Cloudflare couldn't be asked about the Worker.\n  ${error.message.split('\n').join('\n  ')}\n  Sign in with \`pnpm exec cf auth login\` and try again.`)
}
if (!live) fail(`Nothing was changed: the Worker "${name}" isn't on this Cloudflare account. If the site runs under another name, write it in worker.json: { "name": "<its name>" }`)
if (!isFluxBio(live.bindings)) fail(`Nothing was changed: the Worker "${name}" on this account isn't FluxBio.`)

// Which sites share this password is the running Worker's to say, not a sites.json that may be missing or out of
// date: each of them loses its tokens, so each needs a new one.
const held = heldSites(live.bindings)
const origins = {}
for (const address of addresses) {
	const id = Object.entries(held).find(([, hosts]) => hosts.includes(address.hostname) || hosts.includes(address.host))?.[0] ?? 'main'
	if (origins[id]) fail(`${origins[id]} and ${address.origin} are both the site "${id}". Give each site once.`)
	origins[id] = address.origin
}
for (const [id, hosts] of Object.entries(held)) if (!origins[id] && hosts[0]) origins[id] = `https://${hosts[0]}`
const unknown = Object.keys(held).filter((id) => !origins[id])

const request = (origin, path, init = {}) => fetch(`${origin}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) }).catch(() => null)
const text = async (origin, path) => {
	const response = await request(origin, path)
	return response?.ok ? await response.text().catch(() => '') : ''
}

// Before the password goes, each address has to be this Worker's. The command is given on a site's sign-in page
// and in its guide, and a test site or the one on this computer gives it too: run as given there, it would
// otherwise replace the live site's password and reach no site that takes the new one.
for (const origin of Object.values(origins)) {
	const { hostname } = new URL(origin)
	const guide = await text(origin, '/llms.txt')
	if (!guide.includes('FluxBio')) fail(`Nothing was changed: ${origin} doesn't answer as a FluxBio site.`)
	if (hostname === 'localhost' || hostname.endsWith('.localhost') || guide.includes("running on the owner's own computer")) {
		fail(`Nothing was changed: ${origin} is the site on this computer, and its password isn't on Cloudflare. It is ADMIN_PASSWORD in .dev.vars: change it there and start \`pnpm dev\` again.`)
	}
	const served = /--worker ([a-z0-9_-]+)[\s`']/.exec(await text(origin, '/api/guide/password'))?.[1]
	if (!served) fail(`Nothing was changed: ${origin} doesn't say which Worker serves it, so it can't be told from another FluxBio. Update that site first, or set the secret yourself: AGENTS.md 1.8.`)
	if (served !== name) {
		fail(
			`Nothing was changed: ${origin} is served by the Worker "${served}", and ${staging ? '--mode staging here means' : 'this folder\'s is'} "${name}".` +
			(served === `${name}-staging` ? '\n  That is the test site: add --mode staging.' : name === `${served}-staging` ? '\n  That is the live site: leave --mode staging out.' : '\n  If that is the site you mean, write its Worker\'s name in worker.json: { "name": "<its name>" }'),
		)
	}
}

if (opts.check) {
	console.log(`Nothing was changed. This would set a new password on the Worker "${name}", for ${Object.keys(held).length === 1 ? 'its site' : `its ${Object.keys(held).length} sites`}:`)
	for (const id of Object.keys(held)) console.log(`  ${id}: ${origins[id] ?? 'no address known, so it would get no token: give it with another --site'}`)
	process.exit(0)
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const password = Array.from({ length: 24 }, () => LETTERS[randomInt(LETTERS.length)]).join('')
const secretFile = staging ? '.secrets.staging.env' : '.secrets.env'
// On disk before it is set: a password that is set and written nowhere locks the owner out.
const pending = secretFile.replace(/\.env$/, '.new.env')
try {
	writeFileSync(pending, `ADMIN_PASSWORD=${password}\n`, { mode: 0o600 })
	chmodSync(pending, 0o600)
} catch (error) {
	fail(`Nothing was changed: ${pending} could not be written (${error.code ?? error.message}).`)
}
const set = await cf(['workers', 'secrets', 'update', 'ADMIN_PASSWORD', '--worker', name, '--type', 'secret_text', '--text', password])
if (!set.ok) {
	rmSync(pending, { force: true })
	fail(`The password was not changed: Cloudflare refused.\n  ${set.stderr.trim().replaceAll(password, '<password>').split('\n').join('\n  ')}`)
}
let passwordFile = secretFile
try {
	renameSync(pending, secretFile)
} catch {
	passwordFile = pending
}
// Every token made before now is revoked, the ones a run before this one left here too. Not by a test site's
// reset, though: that is another Worker's password, and the tokens on file are the live site's.
if (!staging) rmSync('.tokens.env', { force: true })
console.log(`The password is changed, and it is in ${passwordFile}. Everyone is signed out, and every API token made before now has stopped working.`)

const headers = { authorization: `Bearer ${password}`, 'content-type': 'application/json' }
const accepts = async (origin) => (await (await request(origin, '/api/auth/me', { headers }))?.json().catch(() => null))?.role === 'admin'
// A new secret reaches every copy of the Worker within a few seconds.
const ready = new Set()
for (let tries = 0; tries < 20 && ready.size < Object.keys(origins).length; tries++) {
	if (tries) await new Promise((resolve) => setTimeout(resolve, Number(process.env.FLUXBIO_WAIT_MS ?? 3000)))
	for (const [id, origin] of Object.entries(origins)) if (!ready.has(id) && (await accepts(origin))) ready.add(id)
}
const waiting = Object.keys(origins).filter((id) => !ready.has(id))
if (waiting.length) console.error(`Not answering to the new password yet: ${waiting.map((id) => origins[id]).join(', ')}. Sign in there with it later.`)

// A site without a token is one the owner's AI can no longer reach, and running this again would only revoke the rest.
const without = [...unknown.map((id) => [id, null]), ...waiting.map((id) => [id, origins[id]])]
const tokenVar = (id) => (id === 'main' ? 'FLUXBIO_TOKEN' : `FLUXBIO_TOKEN_${id.toUpperCase().replaceAll('-', '_')}`)
let made = 0
if (opts.tokens && !staging) {
	const lines = []
	// The first site's line first, as the folder's files have them.
	for (const id of Object.keys(held).filter((id) => ready.has(id))) {
		const response = await request(origins[id], '/api/tokens', { method: 'POST', headers, body: JSON.stringify({ name: opts.tokenName, scope: 'full' }) })
		const token = response?.ok ? (await response.json().catch(() => null))?.token : null
		if (typeof token !== 'string') {
			without.push([id, origins[id]])
			continue
		}
		lines.push(`export ${tokenVar(id)}=${token}`)
	}
	if (lines.length) {
		writeFileSync('.tokens.env', `${lines.join('\n')}\n`, { mode: 0o600 })
		chmodSync('.tokens.env', 0o600)
		made = lines.length
		console.log(`A full token named "${opts.tokenName}" for ${Object.keys(held).length === 1 ? 'the site' : made === 1 ? 'one site' : `each of ${made} sites`} is in .tokens.env, as the ${made === 1 ? 'line' : 'lines'} to put where the old ${made === 1 ? 'one was' : 'ones were'}.`)
	}
	for (const [id, origin] of without) {
		console.error(`No token was made for the site "${id}"${origin ? ` (${origin})` : ', whose address isn\'t in the Worker\'s list of sites'}, and its old one has stopped working. Make one there with the new password: POST <its address>/api/tokens with { "name": "${opts.tokenName}", "scope": "full" }, or on Settings in its dashboard. Don't run this again for it: that would revoke the others.`)
	}
} else if (staging) {
	console.log('A test site gets no token: sign in to it with the password.')
}
console.log(staging
	? `Give the owner the password once, and keep ${passwordFile}: it is how you sign in to the test site, and how \`pnpm deploy:images --mode staging\` reads it.`
	: `Give the owner the password once${made ? ', put the tokens where the old ones were' : ''}, then delete ${passwordFile}${made ? ' and .tokens.env' : ''}.`)
if (waiting.length || (opts.tokens && !staging && without.length)) process.exitCode = 1
