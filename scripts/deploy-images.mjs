// Deploys FluxBio with the pictures its pages use as static files, so visitors load them without running the Worker
// and they cost none of the free plan's requests or KV reads (src/shared/mediaAssets.ts).
//   pnpm deploy:images --site https://links.example.com          download the pictures, then deploy
//   pnpm deploy:images --site <url> --no-deploy                  only update public/media
//   pnpm deploy:images --site <url> --mode staging               deploy the test site (passed to cf deploy)
// The site can also come from FLUXBIO_SITE. The key is FLUXBIO_TOKEN (a full token), or ADMIN_PASSWORD from
// .secrets.env (.secrets.staging.env with --mode staging). Pictures uploaded after this run cost as before until the next.
// A Worker that holds several sites (sites.json) ships all their pictures from the one folder, so the others are read
// too: each with FLUXBIO_TOKEN_<ID> or the admin password, since a token is for one site.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runnerImport } from 'vite'

const { module: assets } = await runnerImport('./src/shared/mediaAssets.ts')

function fail(message) {
	console.error(message)
	process.exit(1)
}

const args = process.argv.slice(2)
const opts = { site: process.env.FLUXBIO_SITE, deploy: true, mode: null }
for (let i = 0; i < args.length; i++) {
	const arg = args[i]
	const value = () => args[++i] ?? fail(`${arg} needs a value.`)
	if (arg === '--site') opts.site = value()
	else if (arg === '--no-deploy') opts.deploy = false
	else if (arg === '--mode') opts.mode = value()
	else fail(`Unknown option ${arg}. Try --site <url>, --no-deploy or --mode staging.`)
}
if (!opts.site) fail('Which site? Pass --site https://<your site>, or set FLUXBIO_SITE.')
let site
try {
	site = new URL(opts.site).origin
} catch {
	fail(`${opts.site} is not an address. Write it as https://<your site>.`)
}

// FLUXBIO_TOKEN is for the live site, so a test site uses its own password first.
function secret() {
	const file = opts.mode === 'staging' ? '.secrets.staging.env' : '.secrets.env'
	const password = existsSync(file) ? readFileSync(file, 'utf8').match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim() : null
	return opts.mode === 'staging' ? (password ?? null) : (process.env.FLUXBIO_TOKEN ?? password ?? null)
}
const key = secret() ?? fail('No key to read the site with. Set FLUXBIO_TOKEN to a full API token, or keep ADMIN_PASSWORD in .secrets.env.')

// The export lists the pictures the pages use.
const response = await fetch(`${site}/api/export`, { headers: { authorization: `Bearer ${key}` } })
if (response.status === 401 || response.status === 403) fail(`${site} refused the key (${response.status}). It needs a full token, or the admin password.`)
if (!response.ok) fail(`${site} answered ${response.status}. Is it a FluxBio, and is it online?`)
/** Which site each picture is fetched from. */
const from = new Map(((await response.json()).media ?? []).map((id) => [id, site]))

// The other sites this Worker holds. One that can't be read keeps the files it has: a picture is only removed when
// every site has said it doesn't use it.
let everySiteRead = true
if (opts.mode !== 'staging' && existsSync('sites.json')) {
	let listed
	try {
		listed = JSON.parse(readFileSync('sites.json', 'utf8'))
	} catch {
		fail('sites.json is not JSON, so there is no telling which other sites this Worker holds.')
	}
	const password = existsSync('.secrets.env') ? readFileSync('.secrets.env', 'utf8').match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim() : null
	for (const [id, hosts] of Object.entries(listed)) {
		if (!Array.isArray(hosts) || hosts.includes(new URL(site).host)) continue
		const other = hosts[0] ? `https://${hosts[0]}` : null
		const otherKey = process.env[`FLUXBIO_TOKEN_${id.toUpperCase().replaceAll('-', '_')}`] ?? password
		const answer = other && otherKey ? await fetch(`${other}/api/export`, { headers: { authorization: `Bearer ${otherKey}` } }).catch(() => null) : null
		if (!answer?.ok) {
			everySiteRead = false
			console.error(`  The site "${id}" could not be read${other ? ` at ${other}` : ', which has no hostname listed'}: its pictures stay as they are.`)
			continue
		}
		for (const picture of (await answer.json()).media ?? []) if (!from.has(picture)) from.set(picture, other)
	}
}

const dir = assets.MEDIA_ASSET_DIR
mkdirSync(dir, { recursive: true })
const plan = assets.planMediaAssets([...from.keys()], readdirSync(dir))
if (!everySiteRead) plan.remove = []
for (const id of plan.remove) rmSync(join(dir, id), { force: true })
let failed = 0
// Public, like any visitor's: a picture still in KV costs one Worker request and one KV read, and one that already
// ships as a static file costs nothing. A few at a time, because a deploy from a fresh checkout fetches every one.
const AT_ONCE = 6
for (let at = 0; at < plan.download.length; at += AT_ONCE) {
	await Promise.all(
		plan.download.slice(at, at + AT_ONCE).map(async (id) => {
			const picture = await fetch(`${from.get(id)}/media/${encodeURIComponent(id)}`)
			if (!picture.ok) {
				failed++
				console.error(`  ${id}: ${picture.status}, left to the Worker`)
				return
			}
			writeFileSync(join(dir, id), Buffer.from(await picture.arrayBuffer()))
		}),
	)
}
const shipped = readdirSync(dir).length
console.log(
	`Pictures: ${shipped} ship as static files (${plan.download.length - failed} new, ${plan.remove.length} no longer used and removed${plan.skipped.length ? `, ${plan.skipped.length} left to the Worker` : ''}).`,
)

if (!opts.deploy) process.exit(0)
const deploy = spawn('pnpm', ['exec', 'cf', 'deploy', ...(opts.mode ? ['--mode', opts.mode] : [])], { stdio: 'inherit' })
deploy.on('exit', (code) => process.exit(code ?? 1))
