// Sets a new admin password for this FluxBio, then makes a full API token for each of its sites, because a new
// password signs everyone out and revokes every token made before it.
//   pnpm reset-password --site https://links.example.com
//   pnpm reset-password --site <url> --mode staging
//   pnpm reset-password --site <url> --token-name "Claude Code"
//   pnpm reset-password --site <url> --no-tokens
// It prints nothing secret. The password goes to .secrets.env and the tokens to .tokens.env, both kept out of git:
// hand them over and delete the files.
import { randomInt } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { listedSites } from '../sites.config.ts'
import { workerSettings } from '../worker.config.ts'
import { cf, isFluxBio, runningWorker } from './deploy-check.mjs'

function fail(message) {
	console.error(message)
	process.exit(1)
}

const args = process.argv.slice(2)
const opts = { site: process.env.FLUXBIO_SITE, mode: null, tokenName: 'AI', tokens: true }
for (let i = 0; i < args.length; i++) {
	const arg = args[i]
	const value = () => args[++i] ?? fail(`${arg} needs a value.`)
	if (arg === '--') continue
	else if (arg === '--site') opts.site = value()
	else if (arg === '--mode') opts.mode = value()
	else if (arg === '--token-name') opts.tokenName = value()
	else if (arg === '--no-tokens') opts.tokens = false
	else fail(`Unknown option ${arg}. Try --site <url>, --mode staging, --token-name <name> or --no-tokens.`)
}

let settings
let sites
try {
	settings = workerSettings()
	sites = listedSites()
} catch (error) {
	fail(error.message)
}
const staging = opts.mode === 'staging'
if (staging) sites = {}
const name = staging ? `${settings.name}-staging` : settings.name
if (!opts.site && !staging && settings.domains[0]) opts.site = `https://${settings.domains[0]}`
if (!opts.site) fail('Which site? Pass --site https://<your site>, or set FLUXBIO_SITE.')
let selected
try {
	selected = new URL(opts.site)
	if (!['https:', 'http:'].includes(selected.protocol)) throw new Error('Not a web address')
} catch {
	fail(`${opts.site} is not an address. Write it as https://<your site>.`)
}

// Every site the Worker holds shares the password, and each needs a token of its own.
const selectedId = Object.entries(sites).find(([, hosts]) => hosts.includes(selected.hostname))?.[0] ?? 'main'
const origins = { [selectedId]: selected.origin }
for (const [id, hosts] of Object.entries(sites)) if (!origins[id] && hosts[0]) origins[id] = `https://${hosts[0]}`

let live
try {
	live = await runningWorker(name)
} catch (error) {
	fail(`Nothing was changed: Cloudflare couldn't be asked about the Worker.\n  ${error.message.split('\n').join('\n  ')}\n  Sign in with \`pnpm exec cf auth login\` and try again.`)
}
if (!live) fail(`Nothing was changed: the Worker "${name}" isn't on this Cloudflare account. If the site runs under another name, write it in worker.json: { "name": "<its name>" }`)
if (!isFluxBio(name, live.bindings)) fail(`Nothing was changed: the Worker "${name}" on this account isn't FluxBio.`)

const request = (origin, path, init = {}) => fetch(`${origin}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) }).catch(() => null)
// Before the password goes, make sure the address is this Worker's: a token made at another site would open nothing here.
const guide = await request(selected.origin, '/llms.txt')
if (!guide?.ok || !(await guide.text().catch(() => '')).includes('FluxBio')) fail(`Nothing was changed: ${selected.origin} doesn't answer as a FluxBio site.`)

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const password = Array.from({ length: 24 }, () => LETTERS[randomInt(LETTERS.length)]).join('')
const set = await cf(['workers', 'secrets', 'update', 'ADMIN_PASSWORD', '--worker', name, '--type', 'secret_text', '--text', password])
if (!set.ok) fail(`The password was not changed: Cloudflare refused.\n  ${set.stderr.trim().replaceAll(password, '<password>').split('\n').join('\n  ')}`)
const secretFile = staging ? '.secrets.staging.env' : '.secrets.env'
writeFileSync(secretFile, `ADMIN_PASSWORD=${password}\n`, { mode: 0o600 })
console.log(`The password is changed, and it is in ${secretFile}. Everyone is signed out, and every API token made before now has stopped working.`)

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

if (opts.tokens) {
	const lines = []
	for (const id of ready) {
		const made = await request(origins[id], '/api/tokens', { method: 'POST', headers, body: JSON.stringify({ name: opts.tokenName, scope: 'full' }) })
		const token = made?.ok ? (await made.json().catch(() => null))?.token : null
		if (typeof token !== 'string') {
			console.error(`${origins[id]}: no token was made (${made?.status ?? 'unreachable'}). Make one on Settings there.`)
			continue
		}
		lines.push(`export ${id === 'main' ? 'FLUXBIO_TOKEN' : `FLUXBIO_TOKEN_${id.toUpperCase().replaceAll('-', '_')}`}=${token}`)
	}
	if (lines.length) {
		writeFileSync('.tokens.env', `${lines.join('\n')}\n`, { mode: 0o600 })
		console.log(`A full token named "${opts.tokenName}" for ${lines.length === 1 ? 'the site' : `each of ${lines.length} sites`} is in .tokens.env, as the lines to put where the old ones were.`)
	}
}
console.log(`Give the owner the password once, put the tokens where the old ones were, then delete ${secretFile}${opts.tokens ? ' and .tokens.env' : ''}.`)
if (waiting.length) process.exitCode = 1
