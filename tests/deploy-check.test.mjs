import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { boundSites, deployNotes, deployProblems, isFluxBio } from '../scripts/deploy-check.mjs'

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
	assert.deepEqual(deployProblems({ name: 'my-links-staging', staging: true, live: null, others: ['my-links'] }), [])
	assert.match(deployProblems({ name: 'flux-bio', live: null, others: ['a', 'b'] })[0], /already has these: "a", "b"/)
})

test('someone else’s Worker of the same name is not replaced', () => {
	const [problem] = deployProblems({ name: 'flux-bio', live: { bindings: [{ type: 'plain_text', name: 'GREETING', text: 'hi' }] } })
	assert.match(problem, /isn't FluxBio\. Deploying would replace it/)
	// Nor a FluxBio that was deployed under another name and renamed in Cloudflare.
	assert.equal(isFluxBio('flux-bio', fluxbio('my-links')), false)
	assert.equal(isFluxBio('my-links', fluxbio('my-links')), true)
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
	assert.equal(deployNotes({ live: { bindings: fluxbio('flux-bio', { analytics: false }) }, analytics: true }).length, 1)
	assert.deepEqual(deployNotes({ live: { bindings: fluxbio('flux-bio', { analytics: false }) }, analytics: false }), [])
	assert.deepEqual(deployNotes({ live: { bindings: fluxbio('flux-bio') }, analytics: true }), [])
	assert.deepEqual(deployNotes({ live: null, analytics: true }), [])
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
if (args.slice(0, 3).join(' ') === 'workers versions list') {
	const bindings = workers[after('--worker-id')]
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
	console.log(JSON.stringify(Object.keys(workers).map((name) => ({ name }))))
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

test('pnpm run deploy: each refusal has a way through for someone who means it', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links', { sites: two }) } })
	assert.equal((await f.run('deploy', '--new')).code, 0)
	writeFileSync(join(f.dir, 'worker.json'), JSON.stringify({ name: 'my-links' }))
	assert.equal((await f.run('deploy', '--drop-site', 'link')).code, 0)
	assert.equal((await f.run('deploy', '--mode', 'staging', '--secrets-file', '.secrets.staging.env')).code, 0)
	const skipped = await f.run('deploy', '--skip-checks')
	assert.equal(skipped.code, 0)
	assert.match(skipped.log, /Deploying without the checks/)
	assert.deepEqual(f.deploys(), [['deploy'], ['deploy'], ['deploy', '--mode', 'staging', '--secrets-file', '.secrets.staging.env'], ['deploy']])
})

/** A FluxBio site that takes the password its Worker was last given. */
async function site(t, f) {
	const state = { tokens: [], asked: [] }
	const password = () => f.calls().findLast((args) => args.join(' ').startsWith('workers secrets update'))?.at(-1)
	const server = createServer((req, res) => {
		state.asked.push(req.url)
		const admin = password() && req.headers.authorization === `Bearer ${password()}`
		if (req.url === '/llms.txt') res.writeHead(200).end('# FluxBio')
		else if (!admin) res.writeHead(401).end('{}')
		else if (req.url === '/api/auth/me') res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true,"role":"admin"}')
		else if (req.url === '/api/tokens' && req.method === 'POST') {
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
	return { ...state, state, origin: `http://127.0.0.1:${server.address().port}`, password }
}

test('pnpm reset-password: sets a password, makes a token, and prints neither', async (t) => {
	const f = fixture(t, { workers: { 'my-links': fluxbio('my-links') }, worker: { name: 'my-links' } })
	const s = await site(t, f)
	const result = await f.run('reset-password', '--site', s.origin, '--token-name', 'Claude Code')
	assert.equal(result.code, 0, result.log)
	const password = s.password()
	assert.match(password, /^[A-Za-z0-9]{24}$/)
	assert.deepEqual(f.calls().at(-1).slice(0, 8), ['workers', 'secrets', 'update', 'ADMIN_PASSWORD', '--worker', 'my-links', '--type', 'secret_text'])
	assert.equal(readFileSync(join(f.dir, '.secrets.env'), 'utf8'), `ADMIN_PASSWORD=${password}\n`)
	assert.equal(readFileSync(join(f.dir, '.tokens.env'), 'utf8'), 'export FLUXBIO_TOKEN=fbk_test1\n')
	for (const file of ['.secrets.env', '.tokens.env']) assert.equal(statSync(join(f.dir, file)).mode & 0o777, 0o600)
	assert.deepEqual(s.state.tokens, [{ name: 'Claude Code', scope: 'full' }])
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
		assert.equal(s.password(), undefined)
		assert.equal(existsSync(join(f.dir, '.secrets.env')), false)
	})
}

test('pnpm reset-password: an address that isn’t a FluxBio site changes nothing', async (t) => {
	const f = fixture(t, { workers: { 'flux-bio': fluxbio('flux-bio') } })
	const result = await f.run('reset-password', '--site', 'http://127.0.0.1:9')
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /doesn't answer as a FluxBio site/)
	assert.equal(f.calls().some((args) => args.includes('secrets')), false)
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
})

for (const [what, text, said] of [
	['not JSON', '{ name: my-links }', /worker\.json is not JSON\. It reads like \{ "name"/],
	['a list', '["my-links"]', /has to be an object/],
	['a name with capitals', '{ "name": "My-Links" }', /"name" is the Worker's name: up to 40 lowercase letters/],
	['a name that leaves no room for -staging and a second site', `{ "name": "${'a'.repeat(41)}" }`, /up to 40/],
	['a name that ends in a hyphen', '{ "name": "my-links-" }', /"name" is the Worker's name/],
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
