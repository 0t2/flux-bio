import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const token = 'test-image-deployer-0123'

// Run the real CLI against a local API and real files, with no Cloudflare deployment or owner's credentials.
async function fixture(t, { site = 'main', staging = false } = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'fluxbio-image-test-'))
	mkdirSync(join(dir, 'scripts'))
	cpSync(join(root, 'scripts/deploy-images.mjs'), join(dir, 'scripts/deploy-images.mjs'))
	cpSync(join(root, 'sites.config.ts'), join(dir, 'sites.config.ts'))
	for (const name of ['src', 'node_modules']) symlinkSync(join(root, name), join(dir, name), 'dir')
	if (staging) writeFileSync(join(dir, '.secrets.staging.env'), `ADMIN_PASSWORD=${token}\n`)
	const current = (id) => id === 'main' ? [] : [
		{ id: 'main', host: 'bio.example', current: false },
		{ id, host: '127.0.0.1', current: true },
	]
	const remote = {
		state: { sites: current(site), testSite: staging },
		stateStatus: 200,
		exportStatus: 200,
		media: ['shared.png'],
		bytes: 'version 1',
		mediaStatus: 200,
		brokenBody: false,
	}
	const requests = []
	const server = createServer((req, res) => {
		requests.push({ path: req.url, auth: req.headers.authorization })
		if (req.url.startsWith('/media/')) {
			res.writeHead(200, { 'content-type': 'image/png' }).end('old public asset')
		} else if (req.headers.authorization !== `Bearer ${token}`) {
			res.writeHead(401).end()
		} else if (req.url === '/api/state') {
			res.writeHead(remote.stateStatus, { 'content-type': 'application/json' })
			res.end(typeof remote.state === 'string' ? remote.state : JSON.stringify(remote.state))
		} else if (req.url === '/api/export') {
			res.writeHead(remote.exportStatus, { 'content-type': 'application/json' })
			res.end(JSON.stringify({ media: remote.media }))
		} else if (req.url.startsWith('/api/media/')) {
			res.writeHead(remote.mediaStatus, {
				'content-type': 'image/png',
				...(remote.brokenBody ? { 'content-length': '10000' } : {}),
			})
			if (remote.brokenBody) {
				res.write('partial image')
				setImmediate(() => res.destroy())
			} else res.end(remote.bytes)
		} else {
			// The public URL could still serve the old asset; it must never be used for refreshing.
			res.writeHead(200, { 'content-type': 'image/png' }).end('old public asset')
		}
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	t.after(async () => {
		await new Promise((resolve) => server.close(resolve))
		rmSync(dir, { recursive: true, force: true })
	})
	const origin = `http://127.0.0.1:${server.address().port}`
	const output = staging ? 'public/_site-media/staging/shared.png'
		: site === 'main' ? 'public/media/shared.png' : `public/_site-media/sites/${site}/shared.png`
	const file = (name = output) => join(dir, name)
	return {
		remote, requests, file, current,
		seed(name, bytes = 'stale bundled image') {
			mkdirSync(dirname(file(name)), { recursive: true })
			writeFileSync(file(name), bytes)
		},
		async run() {
			const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('FLUXBIO_')))
			Object.assign(env, {
				FLUXBIO_TOKEN: token,
				FLUXBIO_SITES: JSON.stringify(site === 'main' ? {} : { main: [], [site]: ['127.0.0.1'] }),
				CF_SEND_TELEMETRY: 'false',
			})
			const child = spawn(process.execPath, ['scripts/deploy-images.mjs', '--site', origin, '--no-deploy', ...(staging ? ['--mode', 'staging'] : [])], {
				cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
			})
			let log = ''
			child.stdout.on('data', (chunk) => { log += chunk })
			child.stderr.on('data', (chunk) => { log += chunk })
			const code = await new Promise((resolve, reject) => {
				child.on('error', reject)
				child.on('close', resolve)
			})
			assert.ok(!log.includes(token), 'credentials must not appear in output')
			return { code, log }
		},
	}
}

for (const [name, options] of [['single live site', {}], ['secondary site', { site: 'link' }], ['staging site', { staging: true }]]) {
	test(`refreshes overwritten media on a ${name} through the authenticated API`, async (t) => {
		const f = await fixture(t, options)
		let result = await f.run()
		assert.equal(result.code, 0, result.log)
		assert.equal(readFileSync(f.file(), 'utf8'), 'version 1')
		f.remote.bytes = 'version 2'
		result = await f.run()
		assert.equal(result.code, 0, result.log)
		assert.equal(readFileSync(f.file(), 'utf8'), 'version 2')
		assert.equal(f.requests.filter(({ path }) => path === '/api/media/shared.png').length, 2)
		assert.ok(f.requests.every(({ path, auth }) => path.startsWith('/api/') && auth === `Bearer ${token}`))
	})
}

test('does not relabel old main-site images as a newly assigned site, then fills the bundle after deployment', async (t) => {
	const f = await fixture(t, { site: 'link' })
	f.remote.state.sites = [] // The new hostname still serves main in the old deployment.
	f.seed('public/_site-media/sites/link/shared.png', 'main bytes from an earlier run')
	f.seed('public/_site-media/sites/main/shared.png') // main has no listed hostname to refresh.
	f.seed('public/_site-media/sites/removed/shared.png')
	f.seed('public/media/shared.png')
	let result = await f.run()
	assert.equal(result.code, 0, result.log) // Configuration can still deploy; this site falls back to KV.
	assert.ok(!existsSync(f.file()))
	assert.ok(!existsSync(f.file('public/_site-media/sites/main/shared.png')))
	assert.ok(!existsSync(f.file('public/_site-media/sites/removed/shared.png')))
	assert.ok(!existsSync(f.file('public/media/shared.png')))
	assert.deepEqual(f.requests.map(({ path }) => path), ['/api/state'])
	assert.match(result.log, /site.*main.*link|link.*main/i)

	f.remote.state.sites = f.current('link')
	f.remote.bytes = 'link KV bytes'
	result = await f.run()
	assert.equal(result.code, 0, result.log)
	assert.equal(readFileSync(f.file(), 'utf8'), 'link KV bytes')
})

for (const staging of [false, true]) {
	test(`rejects the other deployment mode when staging=${staging}`, async (t) => {
		const f = await fixture(t, { staging })
		f.seed(undefined)
		f.remote.state.testSite = !staging
		const result = await f.run()
		assert.equal(result.code, 0, result.log)
		assert.ok(!existsSync(f.file()))
		assert.deepEqual(f.requests.map(({ path }) => path), ['/api/state'])
	})
}

test('removes old bundles if authentication, source identity or the export cannot be verified', async (t) => {
	const f = await fixture(t)
	for (const changes of [
		{ stateStatus: 403 },
		{ state: 'invalid json' },
		{ state: { sites: [], testSite: undefined } },
		{ state: { sites: '', testSite: false } },
		{ state: { sites: [{ id: 'main', current: true }, { id: 'link', current: true }], testSite: false } },
		{ state: { sites: [{ id: 'main', current: false }], testSite: false } },
		{ exportStatus: 503 },
	]) {
		Object.assign(f.remote, { stateStatus: 200, exportStatus: 200, state: { sites: [], testSite: false } }, changes)
		f.seed(undefined)
		f.requests.length = 0
		const result = await f.run()
		assert.notEqual(result.code, 0, result.log)
		assert.ok(!existsSync(f.file()))
		assert.ok(!f.requests.some(({ path }) => path.startsWith('/api/media/')))
	}
})

test('falls back to KV without a stale or partial file after a failed refresh', async (t) => {
	const f = await fixture(t)
	for (const changes of [{ mediaStatus: 404 }, { mediaStatus: 503 }, { brokenBody: true }]) {
		Object.assign(f.remote, { mediaStatus: 200, brokenBody: false }, changes)
		f.seed(undefined)
		const result = await f.run()
		assert.equal(result.code, 0, result.log)
		assert.ok(!existsSync(f.file()))
		assert.match(result.log, /1 left to KV/)
	}
})
