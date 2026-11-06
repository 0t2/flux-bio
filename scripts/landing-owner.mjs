// Run first by `pnpm landing:deploy`, which puts the project's own site, fluxbio.link, online.
//
// That site lives on its maintainer's Cloudflare account. Anyone who has FluxBio's code has this command too, and
// on their account it would make a Worker named after the project's site and then fail on a domain that isn't theirs.
// So it only goes on where the signed-in account already serves fluxbio.link. An agent helping someone with their own
// FluxBio that finds its way here is told where to go instead.
import { spawnSync } from 'node:child_process'

// As in landing/build.mjs, which names the Worker and its domain (tests/landing.test.ts keeps the two in step).
const WORKER = 'fluxbio-showcase'
const DOMAIN = 'fluxbio.link'
const REPOSITORY = '0t2/flux-bio'

// GitHub Actions deploys from the project's repository only (.github/workflows/deploy.yml), with a token for that account.
if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === REPOSITORY) process.exit(0)

const asked = spawnSync('pnpm', ['exec', 'cf', 'workers', 'get', WORKER], { encoding: 'utf8' })
let domains = []
try {
	const answer = JSON.parse(asked.stdout)
	domains = ((answer.result ?? answer).references?.domains ?? []).map((domain) => domain.hostname)
} catch {
	// Not signed in, or no such Worker on this account: either way this isn't the account that serves the site.
}
if (domains.includes(DOMAIN)) process.exit(0)

console.error(`Nothing was deployed. \`pnpm landing:deploy\` puts the FluxBio project's own site, ${DOMAIN}, on its maintainer's Cloudflare account,
and the account signed in here doesn't serve it.

To put your own FluxBio online, follow section 1 of AGENTS.md: \`pnpm exec cf deploy --secrets-file .secrets.env\`.
If you maintain ${DOMAIN}, sign in to its account first: \`pnpm exec cf auth whoami\`.`)
process.exit(1)
