// Deploys FluxBio with the pictures its pages use as static files.
//   pnpm deploy:images --site https://links.example.com
//   pnpm deploy:images --site <url> --no-deploy
//   pnpm deploy:images --site <url> --mode staging
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runnerImport } from 'vite'
import { listedSites } from '../sites.config.ts'
import { SCOPED_MEDIA_PATH } from '../src/shared/mediaAssetPaths.ts'

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

let selected
try {
	selected = new URL(opts.site)
	if (!['https:', 'http:'].includes(selected.protocol)) throw new Error('Not a web address')
} catch {
	fail(`${opts.site} is not an address. Write it as https://<your site>.`)
}

const staging = opts.mode === 'staging'
const sites = staging ? {} : listedSites()
const multisite = Object.keys(sites).some((id) => id !== 'main')
const selectedId = Object.entries(sites).find(([, hosts]) => hosts.includes(selected.hostname))?.[0] ?? 'main'
const secretFile = staging ? '.secrets.staging.env' : '.secrets.env'
const password = existsSync(secretFile) ? readFileSync(secretFile, 'utf8').match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim() : null

let siteTokens = {}
if (!staging && process.env.FLUXBIO_SITE_TOKENS) {
	try {
		siteTokens = JSON.parse(process.env.FLUXBIO_SITE_TOKENS)
		if (!siteTokens || typeof siteTokens !== 'object' || Array.isArray(siteTokens) || Object.values(siteTokens).some((token) => typeof token !== 'string')) throw new Error()
	} catch {
		fail('FLUXBIO_SITE_TOKENS must be a JSON object mapping site IDs to full API tokens.')
	}
}

const scopedDir = `public${SCOPED_MEDIA_PATH}`
const siteDir = (id) => join(scopedDir, 'sites', id)
const primaryKey = staging ? password : process.env.FLUXBIO_TOKEN || keyFor(selectedId)
const primaryDir = staging ? join(scopedDir, 'staging') : multisite ? siteDir(selectedId) : assets.MEDIA_ASSET_DIR
// Every bundle is rebuilt from verified sources. This also drops old modes, removed sites and sites that can no
// longer be reached: none of their previous files may shadow the current site's KV after deployment.
for (const dir of [assets.MEDIA_ASSET_DIR, scopedDir]) rmSync(dir, { recursive: true, force: true })
const primary = await syncImages(selected.origin, primaryKey, primaryDir, selectedId)
if (primary) fail(primary)

for (const [id, hosts] of Object.entries(sites)) {
	if (id === selectedId || !multisite) continue
	const result = hosts[0] ? await syncImages(`https://${hosts[0]}`, keyFor(id), siteDir(id), id) : 'No hostname listed.'
	if (result) console.error(`  The site "${id}" could not be read: ${result}`)
}

if (opts.deploy) {
	const deploy = spawn('pnpm', ['exec', 'cf', 'deploy', ...(opts.mode ? ['--mode', opts.mode] : [])], { stdio: 'inherit' })
	deploy.on('exit', (code) => process.exit(code ?? 1))
}

function keyFor(id) {
	return process.env[`FLUXBIO_TOKEN_${id.toUpperCase().replaceAll('-', '_')}`] || (Object.hasOwn(siteTokens, id) ? siteTokens[id] : null) || password
}

async function syncImages(origin, key, dir, expectedId) {
	if (!key) return 'Set a full API token for this site, or use the admin password.'
	const headers = { authorization: `Bearer ${key}` }
	const request = (path) => fetch(`${origin}${path}`, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) }).catch(() => null)
	// Local host assignments describe the NEXT deployment. The current deployment may still route this host to main.
	const stateResponse = await request('/api/state')
	if (!stateResponse?.ok) return `${origin}: could not verify the source site (${stateResponse?.status ?? 'unreachable'}).`
	const state = await stateResponse.json().catch(() => null)
	const current = Array.isArray(state?.sites) ? state.sites.filter((site) => site?.current === true) : []
	const actualId = Array.isArray(state?.sites) && state.sites.length === 0 ? 'main' : current.length === 1 ? current[0].id : null
	if (typeof actualId !== 'string' || typeof state?.testSite !== 'boolean') return `${origin}: could not verify the source site's identity.`
	if (actualId !== expectedId || state.testSite !== staging) {
		console.error(`${origin}: serves ${state.testSite ? 'staging' : 'live'} site "${actualId}", expected ${staging ? 'staging' : 'live'} site "${expectedId}". Pictures stay in KV; run deploy:images again after deploying the site configuration.`)
		return
	}
	const response = await request('/api/export')
	if (!response?.ok) return `${origin} ${response ? `answered ${response.status}` : 'could not be reached'}.`

	const backup = await response.json().catch(() => null)
	if (!Array.isArray(backup?.media) || backup.media.some((id) => typeof id !== 'string')) return `${origin}: the export has no valid media list.`
	mkdirSync(dir, { recursive: true })
	const plan = assets.planMediaAssets(backup.media, readdirSync(dir))
	for (const id of plan.remove) rmSync(join(dir, id), { force: true })
	let failed = 0
	const atOnce = 6
	for (let at = 0; at < plan.download.length; at += atOnce) {
		await Promise.all(plan.download.slice(at, at + atOnce).map(async (id) => {
			// Always read KV, including on a single site: the public URL may still return an older static asset.
			const picture = await request(`/api/media/${encodeURIComponent(id)}`)
			const bytes = picture?.ok ? await picture.arrayBuffer().catch(() => null) : null
			if (bytes === null) {
				failed++
				return
			}
			writeFileSync(join(dir, id), Buffer.from(bytes))
		}))
	}
	const shipped = readdirSync(dir).length
	console.log(`${origin}: ${shipped} static pictures (${plan.download.length - failed} fetched, ${plan.remove.length} removed, ${plan.skipped.length + failed} left to KV).`)
}
