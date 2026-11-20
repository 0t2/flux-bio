// Deploys FluxBio, after checking that the deploy does what was meant (scripts/deploy-check.mjs).
//   pnpm run deploy
//   pnpm run deploy --secrets-file .secrets.env      the first deploy, with its password
//   pnpm run deploy --mode staging                   the test site
//   pnpm run deploy --dry-run                        the checks and the build, nothing uploaded
//   pnpm run deploy --new                            a second FluxBio on an account that has one
//   pnpm run deploy --drop-site <id>                 take a site off this Worker
//   pnpm run deploy --skip-checks                    when Cloudflare can't be asked
// Anything else goes to `cf deploy` as it is.
import { spawn } from 'node:child_process'
import { listedSites } from '../sites.config.ts'
import { workerSettings } from '../worker.config.ts'
import { deployNotes, deployProblems, otherFluxBios, runningWorker, SHELL } from './deploy-check.mjs'

function fail(message) {
	console.error(message)
	process.exit(1)
}

const own = { makeNew: false, skip: false, dropSites: [] }
const rest = []
let mode = null
let secretsFile = false
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
	const arg = args[i]
	// `pnpm run deploy -- --flag` hands the `--` on.
	if (arg === '--') continue
	else if (arg === '--new') own.makeNew = true
	else if (arg === '--skip-checks') own.skip = true
	else if (arg === '--drop-site') {
		// Not the next option: `--drop-site --dry-run` would otherwise drop nothing and deploy for real.
		const id = args[++i]
		if (!id || id.startsWith('-')) fail('--drop-site needs the id of a site, as in sites.json.')
		own.dropSites.push(id)
	} else {
		if (arg === '--mode' || arg === '-m') mode = args[i + 1] ?? ''
		else if (/^(--mode|-m)=/.test(arg)) mode = arg.slice(arg.indexOf('=') + 1)
		// cf takes its options in camelCase too.
		else if (/^--secrets-?file(=|$)/i.test(arg)) secretsFile = true
		rest.push(arg)
	}
}
// Any other mode is the live site to cloudflare.config.ts, so a slip in the word would deploy it.
if (mode !== null && mode !== 'staging' && mode !== 'production') fail(`There is no mode "${mode}". --mode staging deploys the test site, and without it the live one.`)

let settings
let sites
try {
	settings = workerSettings()
	sites = listedSites()
} catch (error) {
	fail(error.message)
}
const staging = mode === 'staging'
const name = staging ? `${settings.name}-staging` : settings.name

if (own.skip) {
	console.log('Deploying without the checks.')
} else {
	let live
	let base = null
	let others = { found: [], unread: [] }
	try {
		live = await runningWorker(name)
		if (!live && !own.makeNew) {
			if (staging) base = await runningWorker(settings.name)
			else others = await otherFluxBios(name)
		}
	} catch (error) {
		fail(
			`Nothing was deployed: Cloudflare couldn't be asked what is running now.\n  ${error.message.split('\n').join('\n  ')}\n` +
			'  Sign in with `pnpm exec cf auth login` and try again. To deploy without the checks, pass --skip-checks.',
		)
	}
	const problems = deployProblems({ name, staging, live, others: others.found, unread: others.unread, base, sites: staging ? {} : sites, secretsFile, dropSites: own.dropSites, makeNew: own.makeNew })
	if (problems.length) fail(`Nothing was deployed.\n\n${problems.join('\n\n')}`)
	for (const note of deployNotes({ name, live, analytics: settings.analytics, sites: staging ? {} : sites })) console.log(`Note: ${note}`)
	const held = Object.keys(staging ? {} : sites).filter((id) => id !== 'main')
	console.log(`Checked: this ${live ? 'updates' : 'makes'} the Worker "${name}"${held.length ? `, with the sites main, ${held.join(', ')}` : ''}.`)
}

const cf = process.env.FLUXBIO_CF ? [process.env.FLUXBIO_CF] : ['pnpm', 'exec', 'cf']
const deploy = spawn(cf[0], [...cf.slice(1), 'deploy', ...rest], { stdio: 'inherit', shell: SHELL })
deploy.on('error', (error) => fail(`cf could not be started: ${error.message}`))
deploy.on('exit', (code) => process.exit(code ?? 1))
