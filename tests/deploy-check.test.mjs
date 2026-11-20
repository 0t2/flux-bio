import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { boundSites, deployNotes, deployProblems, heldSites, isFluxBio } from '../scripts/deploy-check.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

/** The bindings of a running FluxBio, as Cloudflare lists them. */
const fluxbio = (name, { sites = {}, testSite = false, analytics = true } = {}) => [
	{ type: 'secret_text', name: 'ADMIN_PASSWORD' },
	...(analytics ? [{ type: 'analytics_engine', name: 'ANALYTICS', dataset: name.replaceAll('-', '_') }] : []),
	{ type: 'd1', name: 'DB', id: 'db-1' },
	{ type: 'kv_namespace', name: 'KV', namespace_id: 'kv-1' },
	{ type: 'plain_text', name: 'SITES', text: JSON.stringify(sites) },
	{ type: 'plain_text', name: 'TEST_SITE', text: String(testSite) },
	{ type: 'plain_text', name: 'WORKER_NAME', text: name },
]
const two = { main: ['example.bio'], link: ['example.link', 'new.example.link'] }

test('a deploy that changes nothing it shouldn’t goes ahead', () => {
	assert.deepEqual(deployProblems({ name: 'flux-bio', live: null }), [])
	assert.deepEqual(deployProblems({ name: 'flux-bio', live: null, secretsFile: true }), [])
	assert.deepEqual(deployProblems({ name: 'flux-bio', live: { bindings: fluxbio('flux-bio') } }), [])
	assert.deepEqual(deployProblems({ name: 'my-links', live: { bindings: fluxbio('my-links', { sites: two }) }, sites: two }), [])
	// Adding a site is what sites.json is for.
	assert.deepEqual(deployProblems({ name: 'flux-bio', live: { bindings: fluxbio('flux-bio') }, sites: two }), [])
})

test('a second, empty site is not made by a folder that lost its Worker’s name', () => {
	const [problem, ...more] = deployProblems({ name: 'flux-bio', live: null, others: ['my-links'] })
	assert.equal(more.length, 0)
	assert.match(problem, /would make a new, empty FluxBio, and the account already has one: "my-links"/)
	assert.match(problem, /\{ "name": "my-links" \}/)
	assert.match(problem, /--new/)
	assert.deepEqual(deployProblems({ name: 'flux-bio', live: null, others: ['my-links'], makeNew: true }), [])
	// A test site is new the first time, beside the live one it is for.
	assert.deepEqual(deployProblems({ name: 'my-links-staging', staging: true, live: null, base: { bindings: fluxbio('my-links') } }), [])
	assert.match(deployProblems({ name: 'flux-bio', live: null, others: ['a', 'b'] })[0], /already has these: "a", "b"/)
})

test('someone else’s Worker of the same name is not replaced', () => {
	const [problem] = deployProblems({ name: 'flux-bio', live: { bindings: [{ type: 'plain_text', name: 'GREETING', text: 'hi' }] } })
	assert.match(problem, /isn't FluxBio\. Deploying would replace it/)
	assert.equal(isFluxBio(fluxbio('my-links')), true)
	assert.equal(isFluxBio([{ type: 'plain_text', name: 'WORKER_NAME', text: 'x' }]), false)
})

test('a FluxBio renamed in Cloudflare’s dashboard is still FluxBio: it is updated, and said to have been renamed', () => {
	// Its WORKER_NAME binding still says the name it was deployed under.
	const live = { bindings: fluxbio('old-name') }
	assert.deepEqual(deployProblems({ name: 'new-name', live }), [])
	assert.match(deployNotes({ name: 'new-name', live })[0], /was deployed as "old-name" and has been renamed to "new-name"/)
	assert.deepEqual(deployNotes({ name: 'old-name', live }), [])
})

test('a test site is not made for a live site that isn’t there', () => {
	// A folder that lost worker.json would make "flux-bio-staging" beside "my-links" and its test site.
	const [none, ...more] = deployProblems({ name: 'flux-bio-staging', staging: true, live: null, base: null })
	assert.equal(more.length, 0)
	assert.match(none, /would be the test site of "flux-bio", and there is no Worker "flux-bio" on this Cloudflare account/)
	assert.match(deployProblems({ name: 'flux-bio-staging', staging: true, live: null, base: { bindings: [] } })[0], /the Worker "flux-bio" on this Cloudflare account isn't FluxBio/)
	assert.deepEqual(deployProblems({ name: 'flux-bio-staging', staging: true, live: null, base: null, makeNew: true }), [])
})

test('Workers that couldn’t be read stop a new site: one of them may be the FluxBio', () => {
	const [problem, ...more] = deployProblems({ name: 'flux-bio', live: null, others: [], unread: ['my-links', 'api'] })
	assert.equal(more.length, 0)
	assert.match(problem, /Whether the account already has one couldn't be told: 2 Workers couldn't be read \(my-links, api\)/)
	assert.deepEqual(deployProblems({ name: 'flux-bio', live: null, others: [], unread: ['my-links'], makeNew: true }), [])
	// One that was found is enough to say so, whatever else couldn't be read.
	assert.equal(deployProblems({ name: 'flux-bio', live: null, others: ['my-links'], unread: ['api'] }).length, 1)
})

test('a hostname that would stop reaching its site is mentioned', () => {
	const live = { bindings: fluxbio('my-links', { sites: two }) }
	assert.deepEqual(deployNotes({ name: 'my-links', live, sites: two }), [])
	const [note] = deployNotes({ name: 'my-links', live, sites: { main: ['example.bio'], link: ['example.link'] } })
	assert.match(note, /new\.example\.link reaches the site "link" now, and sites\.json here doesn't list it: after this deploy it shows the first site instead/)
	// Moved to another site on purpose is not lost.
	assert.deepEqual(deployNotes({ name: 'my-links', live, sites: { main: ['example.bio', 'new.example.link'], link: ['example.link'] } }), [])
	assert.deepEqual(heldSites(live.bindings), two)
	assert.deepEqual(heldSites(fluxbio('flux-bio')), { main: [] })
})

test('a site the running Worker holds is not dropped by a missing sites.json', () => {
	const live = { bindings: fluxbio('my-links', { sites: two }) }
	const [problem, ...more] = deployProblems({ name: 'my-links', live, sites: {} })
	assert.equal(more.length, 0)
	assert.match(problem, /would take the site "link" \(example\.link, new\.example\.link\) offline/)
	// What to save is the running Worker's own list, word for word.
	assert.ok(problem.includes(JSON.stringify(two)))
	assert.match(problem, /--drop-site link/)
	assert.deepEqual(deployProblems({ name: 'my-links', live, sites: {}, dropSites: ['link'] }), [])
	assert.deepEqual(deployProblems({ name: 'my-links', live, sites: { main: [], link: ['other.example'] } }), [])
	assert.deepEqual(boundSites(live.bindings), { link: two.link })
	assert.deepEqual(boundSites([{ type: 'plain_text', name: 'SITES', text: 'not json' }]), {})
})

test('the password is not replaced by a deploy', () => {
	const live = { bindings: fluxbio('flux-bio') }
	const [problem, ...more] = deployProblems({ name: 'flux-bio', live, secretsFile: true })
	assert.equal(more.length, 0)
	assert.match(problem, /already has its password, and --secrets-file would replace it/)
	assert.match(problem, /pnpm reset-password/)
	// Two things wrong are both said.
	assert.equal(deployProblems({ name: 'my-links', live: { bindings: fluxbio('my-links', { sites: two }) }, sites: {}, secretsFile: true }).length, 2)
})

test('detailed stats that a deploy would add are mentioned, not refused', () => {
	assert.equal(deployNotes({ name: 'flux-bio', live: { bindings: fluxbio('flux-bio', { analytics: false }) }, analytics: true }).length, 1)
	assert.deepEqual(deployNotes({ name: 'flux-bio', live: { bindings: fluxbio('flux-bio', { analytics: false }) }, analytics: false }), [])
	assert.deepEqual(deployNotes({ name: 'flux-bio', live: { bindings: fluxbio('flux-bio') }, analytics: true }), [])
	assert.deepEqual(deployNotes({ name: 'flux-bio', live: null, analytics: true }), [])
})

// The real commands against a stand-in for Cloudflare's CLI: nothing here reaches an account.
function fixture(t, { workers = {}, worker = null, sites = null } = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'fluxbio-deploy-test-'))
	mkdirSync(join(dir, 'scripts'))
	for (const file of ['scripts/deploy.mjs', 'scripts/deploy-check.mjs', 'scripts/reset-password.mjs', 'sites.config.ts', 'worker.config.ts']) cpSync(join(root, file), join(dir, file))
	if (worker) writeFileSync(join(dir, 'worker.json'), JSON.stringify(worker))
	if (sites) writeFileSync(join(dir, 'sites.json'), JSON.stringify(sites))
	writeFileSync(join(dir, 'workers.json'), JSON.stringify(workers))
	const cf = join(dir, 'cf')
	writeFileSync(cf, `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const args = process.argv.slice(2)
appendFileSync(join(__dirname, 'calls.jsonl'), JSON.stringify(args) + '\\n')
const workers = JSON.parse(readFileSync(join(__dirname, 'workers.json'), 'utf8'))
const after = (flag) => args[args.indexOf(flag) + 1]
// A Worker here is its bindings, or { running, newest } where a rollback left an older version running.
const versionsOf = (name) => {
	const worker = workers[name]
	return worker && !Array.isArray(worker) && typeof worker === 'object' ? worker : { running: worker, newest: worker }
}
if (args.slice(0, 3).join(' ') === 'workers deployments list') {
	const { running } = versionsOf(after('--worker'))
	if (!running) {
		console.error('[10007] This Worker does not exist on your account.')
		process.exit(1)
	}
	if (running === 'down') {
		console.error('[10000] Authentication error')
		process.exit(1)
	}
	console.log(JSON.stringify({ deployments: running === 'never deployed' ? [] : [{ id: 'd1', versions: [{ version_id: 'old-canary', percentage: 10 }, { version_id: 'running', percentage: 90 }] }] }))
} else if (args.slice(0, 3).join(' ') === 'workers versions get') {
	const { running } = versionsOf(after('--worker-id'))
	if (args[3] !== 'running') process.exit(1)
	console.log(JSON.stringify({ id: 'running', bindings: running }))
} else if (args.slice(0, 3).join(' ') === 'workers versions list') {
	const { newest, running } = versionsOf(after('--worker-id'))
	const bindings = running === 'never deployed' ? newest : newest ?? running
	if (!bindings) {
		console.error('[10007] This Worker does not exist on your account.')
		process.exit(1)
	}
	if (bindings === 'down') {
		console.error('[10000] Authentication error')
		process.exit(1)
	}
	console.error('result_info: {"page":1}')
	console.log(JSON.stringify([{ id: 'v1', bindings }]))
} else if (args.slice(0, 2).join(' ') === 'workers list') {
	// A page at a time, ten unless asked for more, as Cloudflare lists them.
	const perPage = args.includes('--per-page') ? Number(after('--per-page')) : 10
	const page = args.includes('--page') ? Number(after('--page')) : 1
	console.log(JSON.stringify(Object.keys(workers).slice((page - 1) * perPage, page * perPage).map((name) => ({ name }))))
}
`)
	chmodSync(cf, 0o755)
	t.after(() => rmSync(dir, { recursive: true, force: true }))
	const calls = () => (existsSync(join(dir, 'calls.jsonl')) ? readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [])
	return {
		dir,
		calls,
		deploys: () => calls().filter((args) => args[0] === 'deploy'),
		async run(script, ...args) {
			const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('FLUXBIO_')))
			Object.assign(env, { FLUXBIO_CF: cf, FLUXBIO_WAIT_MS: '10' })
			const child = spawn(process.execPath, [`scripts/${script}.mjs`, ...args], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 })
			let log = ''
			child.stdout.on('data', (chunk) => { log += chunk })
			child.stderr.on('data', (chunk) => { log += chunk })
			const code = await new Promise((resolve, reject) => {
				child.on('error', reject)
				child.on('close', resolve)
			})
			return { code, log }
		},
	}
}

test('pnpm run deploy: a first deploy on an empty account goes to cf deploy with its flags', async (t) => {
	const f = fixture(t, { workers: { 'some-api': [] } })
	const result = await f.run('deploy', '--', '--secrets-file', '.secrets.env')
	assert.equal(result.code, 0, result.log)
	assert.match(result.log, /Checked: this makes the Worker "flux-bio"\./)
	assert.deepEqual(f.deploys(), [['deploy', '--secrets-file', '.secrets.env']])
})

test('pnpm run deploy: an update with the right name and sites goes ahead', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links', { sites: two }) }, worker: { name: 'my-links' }, sites: two })
	const result = await f.run('deploy')
	assert.equal(result.code, 0, result.log)
	assert.match(result.log, /Checked: this updates the Worker "my-links", with the sites main, link\./)
	assert.deepEqual(f.deploys(), [['deploy']])
	// Only the Worker it is about was asked for.
	assert.ok(f.calls().every((args) => args[0] === 'deploy' || args.includes('my-links')))
})

for (const [what, setup, args, said] of [
	['a folder without worker.json, on an account that has a FluxBio', { workers: { 'my-links': fluxbio('my-links'), 'my-links-staging': fluxbio('my-links-staging', { testSite: true }), 'some-api': [] } }, [], /already has one: "my-links"/],
	['a folder without sites.json', { workers: { 'my-links': fluxbio('my-links', { sites: two }) }, worker: { name: 'my-links' } }, [], /would take the site "link"/],
	['a secrets file for a site that has its password', { workers: { 'flux-bio': fluxbio('flux-bio') } }, ['--secrets-file', '.secrets.env'], /already has its password/],
	['a name another Worker has', { workers: { 'flux-bio': [{ type: 'plain_text', name: 'X', text: 'y' }] } }, ['--secrets-file', '.secrets.env'], /isn't FluxBio/],
	['Cloudflare not answering', { workers: { 'flux-bio': 'down' } }, [], /Cloudflare couldn't be asked what is running now[\s\S]*Authentication error[\s\S]*--skip-checks/],
	['an account whose FluxBio is past the first page of Workers', { workers: { ...Object.fromEntries(Array.from({ length: 130 }, (_, n) => [`api-${String(n).padStart(3, '0')}`, []])), 'my-links': fluxbio('my-links') } }, [], /already has one: "my-links"/],
	['a Worker that can’t be read, which may be the FluxBio', { workers: { 'my-links': 'down', 'some-api': [] } }, [], /couldn't be told: one Worker couldn't be read \(my-links\)/],
	['--drop-site with no id before the next option', { workers: { 'flux-bio': fluxbio('flux-bio') } }, ['--drop-site', '--dry-run'], /--drop-site needs the id of a site/],
	['a mode that isn’t one', { workers: { 'flux-bio': fluxbio('flux-bio') } }, ['--mode', 'stage'], /There is no mode "stage"/],
	['a secrets file under cf’s other spelling', { workers: { 'flux-bio': fluxbio('flux-bio') } }, ['--secretsFile', '.secrets.env'], /already has its password/],
	['a test site for a live site that isn’t on the account', { workers: { 'my-links': fluxbio('my-links'), 'my-links-staging': fluxbio('my-links-staging', { testSite: true }) } }, ['--mode', 'staging', '--secrets-file', '.secrets.staging.env'], /would be the test site of "flux-bio"/],
	['a worker.json with a typo', { worker: { nmae: 'my-links' } }, [], /"nmae" isn't a setting/],
]) {
	test(`pnpm run deploy: ${what} deploys nothing`, async (t) => {
		const f = fixture(t, setup)
		const result = await f.run('deploy', ...args)
		assert.equal(result.code, 1, result.log)
		assert.match(result.log, said)
		assert.deepEqual(f.deploys(), [])
	})
}

test('pnpm run deploy: after a rollback, the checks go by the version that is running, not the newest', async (t) => {
	// The newest version held one site; someone rolled back in Cloudflare's dashboard to the one that holds two.
	const f = fixture(t, { workers: { 'my-links': { running: fluxbio('my-links', { sites: two }), newest: fluxbio('my-links') } }, worker: { name: 'my-links' } })
	const result = await f.run('deploy')
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /would take the site "link"/)
	assert.deepEqual(f.deploys(), [])
	// It asked for the deployment, then for the version most visits reach.
	assert.deepEqual(f.calls().map((args) => args.slice(0, 4).join(' ')), ['workers deployments list --worker', 'workers versions get running'])
})

test('pnpm run deploy: a Worker uploaded and never deployed is read from its newest version', async (t) => {
	const f = fixture(t, { workers: { 'my-links': { running: 'never deployed', newest: fluxbio('my-links', { sites: two }) } }, worker: { name: 'my-links' } })
	const result = await f.run('deploy')
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /would take the site "link"/)
})

test('pnpm run deploy: each refusal has a way through for someone who means it', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links', { sites: two }) } })
	assert.equal((await f.run('deploy', '--new')).code, 0)
	writeFileSync(join(f.dir, 'worker.json'), JSON.stringify({ name: 'my-links' }))
	assert.equal((await f.run('deploy', '--drop-site', 'link')).code, 0)
	assert.equal((await f.run('deploy', '--mode', 'staging', '--secrets-file', '.secrets.staging.env')).code, 0)
	// cf's short spelling of the mode is read as the mode too.
	assert.equal((await f.run('deploy', '-m=staging', '--secrets-file', '.secrets.staging.env')).code, 0)
	const skipped = await f.run('deploy', '--skip-checks')
	assert.equal(skipped.code, 0)
	assert.match(skipped.log, /Deploying without the checks/)
	assert.deepEqual(f.deploys(), [['deploy'], ['deploy'], ['deploy', '--mode', 'staging', '--secrets-file', '.secrets.staging.env'], ['deploy', '-m=staging', '--secrets-file', '.secrets.staging.env'], ['deploy']])
})

/**
 * A FluxBio site that takes the password its Worker was last given. `worker` is the name its guide gives, which is
 * how the command knows whose site it is; `local` makes it say it runs on the owner's computer.
 */
async function site(t, f, { worker = 'my-links', local = false, guide = true, tokens = true } = {}) {
	const state = { tokens: [], asked: [] }
	const password = () => f.calls().findLast((args) => args.join(' ').startsWith('workers secrets update'))?.at(-1)
	const server = createServer((req, res) => {
		state.asked.push(req.url)
		const admin = password() && req.headers.authorization === `Bearer ${password()}`
		if (req.url === '/llms.txt') res.writeHead(200).end(`# FluxBio\n${local ? "> This FluxBio is running on the owner's own computer, not on Cloudflare\n" : ''}`)
		else if (req.url === '/api/guide/password') res.writeHead(guide ? 200 : 404).end(`run \`pnpm exec cf workers secrets update ADMIN_PASSWORD --worker ${worker} --type secret_text\``)
		else if (!admin) res.writeHead(401).end('{}')
		else if (req.url === '/api/auth/me') res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true,"role":"admin"}')
		else if (req.url === '/api/tokens' && req.method === 'POST' && tokens) {
			let body = ''
			req.on('data', (chunk) => { body += chunk })
			req.on('end', () => {
				state.tokens.push(JSON.parse(body))
				res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ token: `fbk_test${state.tokens.length}`, info: {} }))
			})
		} else res.writeHead(404).end('{}')
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	t.after(() => new Promise((resolve) => server.close(resolve)))
	return { state, origin: `http://127.0.0.1:${server.address().port}`, password }
}
const secretSet = (f) => f.calls().some((args) => args.includes('secrets'))

test('pnpm reset-password: sets a password, makes a token, and prints neither', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links') }, worker: { name: 'my-links' } })
	const s = await site(t, f)
	// What a first deploy left: readable by others, and a token file from an earlier run.
	writeFileSync(join(f.dir, '.secrets.env'), 'ADMIN_PASSWORD=the-old-one\n', { mode: 0o644 })
	writeFileSync(join(f.dir, '.tokens.env'), 'export FLUXBIO_TOKEN=fbk_revoked\n', { mode: 0o644 })
	const result = await f.run('reset-password', '--site', s.origin, '--token-name', 'Claude Code')
	assert.equal(result.code, 0, result.log)
	const password = s.password()
	assert.match(password, /^[A-Za-z0-9]{24}$/)
	assert.deepEqual(f.calls().at(-1).slice(0, 8), ['workers', 'secrets', 'update', 'ADMIN_PASSWORD', '--worker', 'my-links', '--type', 'secret_text'])
	assert.equal(readFileSync(join(f.dir, '.secrets.env'), 'utf8'), `ADMIN_PASSWORD=${password}\n`)
	assert.equal(readFileSync(join(f.dir, '.tokens.env'), 'utf8'), 'export FLUXBIO_TOKEN=fbk_test1\n')
	for (const file of ['.secrets.env', '.tokens.env']) assert.equal(statSync(join(f.dir, file)).mode & 0o777, 0o600, file)
	assert.equal(existsSync(join(f.dir, '.secrets.new.env')), false)
	assert.deepEqual(s.state.tokens, [{ name: 'Claude Code', scope: 'full' }])
	assert.match(result.log, /put the tokens where the old ones were, then delete \.secrets\.env and \.tokens\.env/)
	assert.ok(!result.log.includes(password) && !result.log.includes('fbk_test1'), 'nothing secret is printed')
})

for (const [what, workers, said] of [
	['a Worker that isn’t there', {}, /the Worker "my-links" isn't on this Cloudflare account/],
	['a Worker that isn’t FluxBio', { 'my-links': [] }, /isn't FluxBio/],
]) {
	test(`pnpm reset-password: ${what} keeps its password`, async (t) => {
		const f = fixture(t, { workers, worker: { name: 'my-links' } })
		const s = await site(t, f)
		const result = await f.run('reset-password', '--site', s.origin)
		assert.equal(result.code, 1, result.log)
		assert.match(result.log, said)
		assert.equal(secretSet(f), false)
		assert.equal(existsSync(join(f.dir, '.secrets.env')), false)
	})
}

// The command is on every site's sign-in page and in its guide, so it is run with whatever address that site has.
for (const [what, served, args, said] of [
	['another FluxBio’s address', { worker: 'someone-elses' }, [], /is served by the Worker "someone-elses", and this folder's is "my-links"[\s\S]*write its Worker's name in worker\.json/],
	['the test site’s address without --mode staging', { worker: 'my-links-staging' }, [], /is served by the Worker "my-links-staging"[\s\S]*That is the test site: add --mode staging/],
	['the live site’s address with --mode staging', { worker: 'my-links' }, ['--mode', 'staging'], /That is the live site: leave --mode staging out/],
	['the site on this computer', { local: true }, [], /is the site on this computer[\s\S]*ADMIN_PASSWORD in \.dev\.vars/],
	['a site that doesn’t say which Worker serves it', { guide: false }, [], /doesn't say which Worker serves it/],
]) {
	test(`pnpm reset-password: ${what} changes nothing, on the live Worker or anywhere`, async (t) => {
		const f = fixture(t, { workers: { 'my-links': fluxbio('my-links'), 'my-links-staging': fluxbio('my-links-staging', { testSite: true }) }, worker: { name: 'my-links' } })
		const s = await site(t, f, served)
		writeFileSync(join(f.dir, '.tokens.env'), 'export FLUXBIO_TOKEN=fbk_still_good\n')
		const result = await f.run('reset-password', '--site', s.origin, ...args)
		assert.equal(result.code, 1, result.log)
		assert.match(result.log, /Nothing was changed/)
		assert.match(result.log, said)
		assert.equal(secretSet(f), false)
		// The tokens on file still work, so they stay.
		assert.equal(readFileSync(join(f.dir, '.tokens.env'), 'utf8'), 'export FLUXBIO_TOKEN=fbk_still_good\n')
	})
}

test('pnpm reset-password: an address that isn’t a FluxBio site changes nothing', async (t) => {
	const f = fixture(t, { workers: { 'flux-bio': fluxbio('flux-bio') } })
	const result = await f.run('reset-password', '--site', 'http://127.0.0.1:9')
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /doesn't answer as a FluxBio site/)
	assert.equal(secretSet(f), false)
})

test('pnpm reset-password: every site the running Worker holds gets a token, whatever sites.json here says', async (t) => {
	// A rebuilt folder has no sites.json yet, and the Worker holds two sites.
	const f = fixture(t, { workers: {}, worker: { name: 'my-links' } })
	const main = await site(t, f)
	const link = await site(t, f)
	const hosts = { main: [], link: [new URL(link.origin).host] }
	writeFileSync(join(f.dir, 'workers.json'), JSON.stringify({ 'my-links': fluxbio('my-links', { sites: hosts }) }))
	const result = await f.run('reset-password', '--site', main.origin, '--site', link.origin)
	assert.equal(result.code, 0, result.log)
	assert.equal(readFileSync(join(f.dir, '.tokens.env'), 'utf8'), 'export FLUXBIO_TOKEN=fbk_test1\nexport FLUXBIO_TOKEN_LINK=fbk_test1\n')
	assert.match(result.log, /for each of 2 sites is in \.tokens\.env/)
})

test('pnpm reset-password: --check says what it would do and changes nothing', async (t) => {
	const f = fixture(t, { workers: {}, worker: { name: 'my-links' } })
	const link = await site(t, f)
	writeFileSync(join(f.dir, 'workers.json'), JSON.stringify({ 'my-links': fluxbio('my-links', { sites: { main: [], link: [new URL(link.origin).host] } }) }))
	const result = await f.run('reset-password', '--site', link.origin, '--check')
	assert.equal(result.code, 0, result.log)
	assert.match(result.log, /Nothing was changed\. This would set a new password on the Worker "my-links", for its 2 sites:\n {2}main: no address known[\s\S]*\n {2}link: http/)
	assert.equal(secretSet(f), false)
	assert.equal(existsSync(join(f.dir, '.secrets.env')), false)
})

test('pnpm reset-password: a site it has no address for is named, with how to give it a token', async (t) => {
	// Only the second site is given, and the first has no hostname in the Worker's list: its workers.dev address.
	const f = fixture(t, { workers: {}, worker: { name: 'my-links' } })
	const link = await site(t, f)
	writeFileSync(join(f.dir, 'workers.json'), JSON.stringify({ 'my-links': fluxbio('my-links', { sites: { main: [], link: [new URL(link.origin).host] } }) }))
	const result = await f.run('reset-password', '--site', link.origin)
	assert.equal(result.code, 1, result.log)
	assert.equal(readFileSync(join(f.dir, '.tokens.env'), 'utf8'), 'export FLUXBIO_TOKEN_LINK=fbk_test1\n')
	assert.match(result.log, /No token was made for the site "main", whose address isn't in the Worker's list of sites, and its old one has stopped working[\s\S]*Don't run this again for it/)
})

test('pnpm reset-password: when no token could be made it says so, fails, and leaves no token file to hand over', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links') }, worker: { name: 'my-links' } })
	const s = await site(t, f, { tokens: false })
	writeFileSync(join(f.dir, '.tokens.env'), 'export FLUXBIO_TOKEN=fbk_revoked\n')
	const result = await f.run('reset-password', '--site', s.origin)
	assert.equal(result.code, 1, result.log)
	assert.equal(existsSync(join(f.dir, '.tokens.env')), false)
	assert.match(result.log, /No token was made for the site "main"/)
	assert.match(result.log, /Give the owner the password once, then delete \.secrets\.env\.\n$/)
})

test('pnpm reset-password: a failed change leaves the old password file as it was', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links') }, worker: { name: 'my-links' } })
	const s = await site(t, f)
	writeFileSync(join(f.dir, '.secrets.env'), 'ADMIN_PASSWORD=the-old-one\n')
	// cf refuses the secret.
	writeFileSync(join(f.dir, 'cf'), readFileSync(join(f.dir, 'cf'), 'utf8').replace("if (args.slice(0, 3).join(' ') === 'workers versions list')", "if (args.includes('secrets')) { console.error('[10000] Authentication error'); process.exit(1) }\nif (args.slice(0, 3).join(' ') === 'workers versions list')"))
	const result = await f.run('reset-password', '--site', s.origin)
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /The password was not changed: Cloudflare refused/)
	assert.equal(readFileSync(join(f.dir, '.secrets.env'), 'utf8'), 'ADMIN_PASSWORD=the-old-one\n')
	assert.equal(existsSync(join(f.dir, '.secrets.new.env')), false)
})

test('pnpm reset-password: the test site gets its own password file and no token', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links'), 'my-links-staging': fluxbio('my-links-staging', { testSite: true }) }, worker: { name: 'my-links' } })
	const s = await site(t, f, { worker: 'my-links-staging' })
	// The live site's tokens on file are not this Worker's to revoke.
	writeFileSync(join(f.dir, '.tokens.env'), 'export FLUXBIO_TOKEN=fbk_the_live_sites\n')
	const result = await f.run('reset-password', '--site', s.origin, '--mode', 'staging')
	assert.equal(result.code, 0, result.log)
	assert.equal(readFileSync(join(f.dir, '.tokens.env'), 'utf8'), 'export FLUXBIO_TOKEN=fbk_the_live_sites\n')
	assert.match(result.log, /keep \.secrets\.staging\.env: it is how you sign in to the test site/)
	rmSync(join(f.dir, '.tokens.env'))
	assert.deepEqual(f.calls().at(-1).slice(4, 6), ['--worker', 'my-links-staging'])
	assert.equal(readFileSync(join(f.dir, '.secrets.staging.env'), 'utf8'), `ADMIN_PASSWORD=${s.password()}\n`)
	assert.equal(existsSync(join(f.dir, '.tokens.env')), false)
	assert.match(result.log, /A test site gets no token: sign in to it with the password/)
})

// worker.json is the owner's own file, so what is wrong with it has to be said in words they can act on.
async function settingsFrom(t, text) {
	const dir = mkdtempSync(join(tmpdir(), 'fluxbio-worker-json-'))
	t.after(() => rmSync(dir, { recursive: true, force: true }))
	cpSync(join(root, 'worker.config.ts'), join(dir, 'worker.config.ts'))
	if (text !== null) writeFileSync(join(dir, 'worker.json'), text)
	const { workerSettings } = await import(`${join(dir, 'worker.config.ts')}?${Math.random()}`)
	return workerSettings
}

test('worker.json: without the file, the Worker is flux-bio with detailed stats and no domain in the configuration', async (t) => {
	const env = process.env.FLUXBIO_WORKER
	delete process.env.FLUXBIO_WORKER
	t.after(() => {
		if (env !== undefined) process.env.FLUXBIO_WORKER = env
	})
	assert.deepEqual((await settingsFrom(t, null))(), { name: 'flux-bio', domains: [], analytics: true })
	assert.deepEqual((await settingsFrom(t, '   '))(), { name: 'flux-bio', domains: [], analytics: true })
	// CI has no file, and says the same in a variable.
	process.env.FLUXBIO_WORKER = '{ "name": "from-ci" }'
	assert.equal((await settingsFrom(t, null))().name, 'from-ci')
	// The file wins: a folder's own settings are not replaced by a leftover variable.
	assert.equal((await settingsFrom(t, '{ "name": "from-file" }'))().name, 'from-file')
})

test('worker.json: each setting is read, and each one left out keeps its default', async (t) => {
	assert.deepEqual((await settingsFrom(t, '{ "name": "my-links", "domains": ["links.example.com", "a.b.example"], "analytics": false }'))(), { name: 'my-links', domains: ['links.example.com', 'a.b.example'], analytics: false })
	assert.deepEqual((await settingsFrom(t, '{ "analytics": false }'))(), { name: 'flux-bio', domains: [], analytics: false })
	assert.deepEqual((await settingsFrom(t, '{}'))(), { name: 'flux-bio', domains: [], analytics: true })
	// A site made before this file could have any name Cloudflare takes, and still has to be nameable here.
	assert.equal((await settingsFrom(t, `{ "name": "my_links_${'x'.repeat(40)}" }`))().name, `my_links_${'x'.repeat(40)}`)
})

for (const [what, text, said] of [
	['not JSON', '{ name: my-links }', /worker\.json is not JSON\. It reads like \{ "name"/],
	['a list', '["my-links"]', /has to be an object/],
	['a name with capitals', '{ "name": "My-Links" }', /"name" is the Worker's name: up to 63 lowercase letters, digits, hyphens and underscores/],
	['a name longer than Cloudflare takes', `{ "name": "${'a'.repeat(64)}" }`, /up to 63/],
	['a name that starts with a hyphen', '{ "name": "-my-links" }', /"name" is the Worker's name/],
	['a domain written as an address', '{ "domains": ["https://links.example.com"] }', /"domains" is a list of hostnames in lowercase/],
	['a domain without a dot', '{ "domains": ["localhost"] }', /"domains" is a list of hostnames/],
	['domains as one string', '{ "domains": "links.example.com" }', /"domains" is a list of hostnames/],
	['analytics as a word', '{ "analytics": "no" }', /"analytics" is true or false/],
	['a setting that doesn’t exist', '{ "worker": "my-links" }', /"worker" isn't a setting\. There are three: "name", "domains" and "analytics"/],
]) {
	test(`worker.json: ${what} stops with what to write instead`, async (t) => {
		const read = await settingsFrom(t, text)
		assert.throws(() => read(), said)
	})
}
