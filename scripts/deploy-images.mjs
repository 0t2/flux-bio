// Deploys FluxBio with the pictures its pages use as static files, so visitors load them without running the Worker
// and they cost none of the free plan's requests or KV reads (src/shared/mediaAssets.ts).
//   pnpm deploy:images --site https://links.example.com          download the pictures, then deploy
//   pnpm deploy:images --site <url> --no-deploy                  only update public/media
//   pnpm deploy:images --site <url> --mode staging               deploy the test site (passed to cf deploy)
// The site can also come from FLUXBIO_SITE. The key is FLUXBIO_TOKEN (a full token), or ADMIN_PASSWORD from
// .secrets.env (.secrets.staging.env with --mode staging). Pictures uploaded after this run cost as before until the next.
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
const used = (await response.json()).media ?? []

const dir = assets.MEDIA_ASSET_DIR
mkdirSync(dir, { recursive: true })
const plan = assets.planMediaAssets(used, readdirSync(dir))
for (const id of plan.remove) rmSync(join(dir, id), { force: true })
let failed = 0
for (const id of plan.download) {
	// Public, like any visitor's: one Worker request and one KV read each, once per picture ever.
	const picture = await fetch(`${site}/media/${encodeURIComponent(id)}`)
	if (!picture.ok) {
		failed++
		console.error(`  ${id}: ${picture.status}, left to the Worker`)
		continue
	}
	writeFileSync(join(dir, id), Buffer.from(await picture.arrayBuffer()))
}
const shipped = readdirSync(dir).length
console.log(
	`Pictures: ${shipped} ship as static files (${plan.download.length - failed} new, ${plan.remove.length} no longer used and removed${plan.skipped.length ? `, ${plan.skipped.length} left to the Worker` : ''}).`,
)

if (!opts.deploy) process.exit(0)
const deploy = spawn('pnpm', ['exec', 'cf', 'deploy', ...(opts.mode ? ['--mode', opts.mode] : [])], { stdio: 'inherit' })
deploy.on('exit', (code) => process.exit(code ?? 1))
