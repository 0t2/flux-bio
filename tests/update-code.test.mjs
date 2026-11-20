import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// `pnpm update:code` against a stand-in for the project's repository: releases as tags, main's commits between them,
// and the changelog. Nothing here reaches GitHub, and every folder it updates is a temporary one.

const script = fileURLToPath(new URL('../scripts/update-code.mjs', import.meta.url))

const pkg = (version) => JSON.stringify({ name: 'flux-bio', version })
/** What each release holds. 0.4.2 changes a file, adds one and drops one; the docs moved on main in between. */
const RELEASES = {
	'0.4.0': { 'package.json': pkg('0.4.0'), 'cloudflare.config.ts': 'config 1', 'src/page.ts': 'page 1', 'src/old.ts': 'old', 'README.md': 'readme 1' },
	'0.4.1': { 'package.json': pkg('0.4.1'), 'cloudflare.config.ts': 'config 1', 'src/page.ts': 'page 2', 'src/old.ts': 'old', 'README.md': 'readme 1' },
	'0.4.2': { 'package.json': pkg('0.4.2'), 'cloudflare.config.ts': 'config 1', 'src/page.ts': 'page 3', 'src/new.ts': 'new', 'README.md': 'readme 3' },
}
/** main between 0.4.1 and 0.4.2: two commits that needed no release. */
const COMMITS = {
	aaaaaaa1: { ...RELEASES['0.4.1'], 'README.md': 'readme 2' },
	bbbbbbb2: { ...RELEASES['0.4.1'], 'README.md': 'readme 3' },
}
const CHANGELOG = `# Changelog

Words about the format, with a \`## <version> - YYYY-MM-DD\` in them.

## 0.4.2 - 2027-01-10

### New
- A new block.

## 0.4.1 - 2027-01-05

### Action needed
- Write your Worker's name in \`worker.json\`.

### Fixed
- One thing.

## 0.4.0 - 2027-01-01

### New
- The first thing.

## 2026-11-17

### New
- From before versions.
`

async function fixture(t, { holds = RELEASES['0.4.1'], own = { 'worker.json': '{ "name": "my-links" }', 'sites.json': '{}', 'public/media/pic.png': 'a picture', '.secrets.env': 'ADMIN_PASSWORD=x' }, releases = RELEASES, commits = COMMITS } = {}) {
	const work = mkdtempSync(join(tmpdir(), 'fluxbio-update-test-'))
	t.after(() => rmSync(work, { recursive: true, force: true }))
	const write = (dir, tree) => {
		for (const [path, text] of Object.entries(tree)) {
			mkdirSync(dirname(join(dir, path)), { recursive: true })
			writeFileSync(join(dir, path), text)
		}
	}
	// A download is a .tar.gz with everything inside one folder, as GitHub makes them.
	const archive = (name, tree) => {
		write(join(work, 'src', name, `flux-bio-${name}`), tree)
		const made = spawnSync('tar', ['-czf', join(work, `${name}.tar.gz`), '-C', join(work, 'src', name), `flux-bio-${name}`])
		assert.equal(made.status, 0)
		return readFileSync(join(work, `${name}.tar.gz`))
	}
	const downloads = new Map()
	for (const [version, tree] of Object.entries(releases)) downloads.set(`/archive/refs/tags/v${version}.tar.gz`, archive(version, tree))
	for (const [sha, tree] of Object.entries(commits)) downloads.set(`/archive/${sha}.tar.gz`, archive(sha, tree))
	const remote = { changelog: CHANGELOG, compare: true, asked: [] }
	const server = createServer((req, res) => {
		remote.asked.push(req.url)
		if (req.url === '/raw/main/CHANGELOG.md') res.writeHead(200).end(remote.changelog)
		else if (downloads.has(req.url)) res.writeHead(200).end(downloads.get(req.url))
		else if (req.url === '/compare/v0.4.1...v0.4.2.json' && remote.compare) res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ commits: [...Object.keys(commits), 'ccccccc3'].map((sha) => ({ sha })) }))
		else res.writeHead(404).end()
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	t.after(() => new Promise((resolve) => server.close(resolve)))
	const folder = join(work, 'folder')
	write(folder, { ...holds, ...own })
	return {
		folder,
		remote,
		read: (path) => (existsSync(join(folder, path)) ? readFileSync(join(folder, path), 'utf8') : null),
		write: (path, text) => write(folder, { [path]: text }),
		async run(...args) {
			const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('FLUXBIO_')))
			env.FLUXBIO_SOURCE = `http://127.0.0.1:${server.address().port}`
			const child = spawn(process.execPath, [script, '--no-install', ...args], { cwd: folder, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 })
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

/** The folder holds exactly a release's files, and still every file of its owner's. */
function holdsRelease(f, version) {
	for (const [path, text] of Object.entries(RELEASES[version])) assert.equal(f.read(path), text, path)
	assert.equal(f.read('worker.json'), '{ "name": "my-links" }')
	assert.equal(f.read('sites.json'), '{}')
	assert.equal(f.read('public/media/pic.png'), 'a picture')
	assert.equal(f.read('.secrets.env'), 'ADMIN_PASSWORD=x')
}

test('brings a folder to the newest release: changed files replaced, a new one added, a dropped one removed, the owner’s left alone', async (t) => {
	const f = await fixture(t)
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.2')
	assert.equal(f.read('src/old.ts'), null)
	assert.match(result.log, /FluxBio 0\.4\.1 → 0\.4\.2: one release\./)
	assert.match(result.log, /## 0\.4\.2 - 2027-01-10\n### New\n- A new block\./)
	assert.match(result.log, /now has the code of FluxBio 0\.4\.2 \(one file it no longer has was removed\)/)
	assert.match(result.log, /Nothing is deployed yet\. Deploy with `pnpm deploy:images/)
	// Only what it brings is shown: not the release the folder has, nor the ones before it.
	assert.ok(!result.log.includes('worker.json') && !result.log.includes('The first thing') && !result.log.includes('From before versions'))
})

test('--check shows what would come and changes nothing', async (t) => {
	const f = await fixture(t)
	const result = await f.run('--check')
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.1')
	assert.match(result.log, /A new block/)
	assert.match(result.log, /would replace nothing that was changed in this folder, so it can go ahead\.\nNothing was changed/)
})

test('says so when the folder is already at the newest release, or at the one asked for', async (t) => {
	const f = await fixture(t, { holds: RELEASES['0.4.2'] })
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	assert.match(result.log, /already has FluxBio 0\.4\.2, the newest release/)
	// Nothing was downloaded to find that out.
	assert.deepEqual(f.remote.asked, ['/raw/main/CHANGELOG.md'])
})

test('several releases at once are all shown, and an "Action needed" among them is called out', async (t) => {
	const f = await fixture(t, { holds: RELEASES['0.4.0'] })
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.2')
	assert.match(result.log, /0\.4\.0 → 0\.4\.2: 2 releases/)
	assert.match(result.log, /## 0\.4\.2[\s\S]*## 0\.4\.1 - 2027-01-05\n### Action needed\n- Write your Worker's name/)
	assert.match(result.log, /One of these has an "Action needed" \(0\.4\.1\): do what it says before you deploy/)
	assert.match(result.log, /Do what each "Action needed" above says, then deploy with/)
})

test('--to stops at a named release', async (t) => {
	const f = await fixture(t, { holds: RELEASES['0.4.0'] })
	const result = await f.run('--to', 'v0.4.1')
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.1')
	assert.ok(!result.log.includes('A new block'))
})

test('a file of FluxBio’s that was changed in the folder stops the update, and nothing is touched', async (t) => {
	const f = await fixture(t)
	f.write('src/page.ts', 'page 2, with my own change')
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /Nothing was changed\. One file in this folder is not as FluxBio 0\.4\.1 had it, and the update would replace it:\n {2}src\/page\.ts\n/)
	assert.match(result.log, /--overwrite, and a copy of each goes to changed-before-0\.4\.2\//)
	assert.equal(f.read('src/page.ts'), 'page 2, with my own change')
	assert.equal(f.read('package.json'), pkg('0.4.1'))
	assert.equal(f.read('src/new.ts'), null)
	// --check says the same without failing differently.
	assert.equal((await f.run('--check')).code, 1)
})

test('--overwrite goes ahead and keeps a copy of what was changed', async (t) => {
	const f = await fixture(t)
	f.write('src/page.ts', 'page 2, with my own change')
	rmSync(join(f.folder, 'src/old.ts'))
	const result = await f.run('--overwrite')
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.2')
	assert.equal(f.read('changed-before-0.4.2/src/page.ts'), 'page 2, with my own change')
	// A file the owner removed, which the release drops too, is nothing to keep.
	assert.equal(f.read('changed-before-0.4.2/src/old.ts'), null)
	assert.match(result.log, /A copy of the file changed here is in changed-before-0\.4\.2\//)
})

test('a change the update doesn’t touch is left as the owner made it', async (t) => {
	const f = await fixture(t)
	// The same in 0.4.1 and 0.4.2, so nothing would replace it.
	f.write('cloudflare.config.ts', 'config 1, edited')
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	assert.equal(f.read('cloudflare.config.ts'), 'config 1, edited')
	assert.equal(f.read('src/page.ts'), 'page 3')
	// And it is said, not passed over: the folder is not simply the release.
	assert.match(result.log, /One file changed in this folder is left as it is, because the update doesn't touch it: cloudflare\.config\.ts\./)
	const checked = await (await fixture(t, { holds: { ...RELEASES['0.4.1'], 'cloudflare.config.ts': 'config 1, edited' } })).run('--check')
	assert.match(checked.log, /One file changed in this folder is left as it is/)
})

test('a file of the owner’s own, at a path the new release starts to use, is not replaced unasked', async (t) => {
	// 0.4.2 adds src/new.ts, and this folder already has one that was never FluxBio's.
	const f = await fixture(t)
	f.write('src/new.ts', 'my own file')
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /src\/new\.ts \(yours: the new release has a file of this name\)/)
	assert.equal(f.read('src/new.ts'), 'my own file')
	assert.equal(f.read('package.json'), pkg('0.4.1'))
	const forced = await f.run('--overwrite')
	assert.equal(forced.code, 0, forced.log)
	assert.equal(f.read('src/new.ts'), 'new')
	assert.equal(f.read('changed-before-0.4.2/src/new.ts'), 'my own file')
})

test('a file renamed only in its capitals is there afterwards, under its new name', async (t) => {
	// The same file on a Mac or on Windows: copied first and removed second, it was gone.
	const releases = { ...RELEASES, '0.4.2': { 'package.json': pkg('0.4.2'), 'cloudflare.config.ts': 'config 1', 'src/page.ts': 'page 2', 'src/Old.ts': 'old, renamed', 'README.md': 'readme 1' } }
	const f = await fixture(t, { releases })
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	assert.deepEqual(readdirSync(join(f.folder, 'src')).sort(), ['Old.ts', 'page.ts'])
	assert.equal(f.read('src/Old.ts'), 'old, renamed')
})

test('a file that became a folder, and a folder that became a file, are both brought', async (t) => {
	const releases = {
		...RELEASES,
		'0.4.1': { ...RELEASES['0.4.1'], 'src/theme': 'one file', 'src/parts/a.ts': 'a' },
		'0.4.2': { 'package.json': pkg('0.4.2'), 'cloudflare.config.ts': 'config 1', 'src/page.ts': 'page 3', 'src/theme/index.ts': 'now a folder', 'src/parts': 'now one file', 'README.md': 'readme 3' },
	}
	const f = await fixture(t, { holds: releases['0.4.1'], releases })
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	assert.equal(f.read('src/theme/index.ts'), 'now a folder')
	assert.equal(f.read('src/parts'), 'now one file')
	assert.equal(f.read('package.json'), pkg('0.4.2'))
})

test('a file of the owner’s where the release needs a folder stops the update before anything is touched', async (t) => {
	const releases = { ...RELEASES, '0.4.2': { ...RELEASES['0.4.2'], 'notes/readme.md': 'in a new folder' } }
	const f = await fixture(t, { releases })
	f.write('notes', 'my own notes, in a file')
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /Nothing was changed\. notes is a file in this folder, and FluxBio 0\.4\.2 has a folder of that name/)
	assert.equal(f.read('notes'), 'my own notes, in a file')
	assert.equal(f.read('src/page.ts'), 'page 2')
	assert.equal(f.read('src/old.ts'), 'old')
})

test('a run that stopped halfway can be run again: the version is written last', async (t) => {
	// Every file of 0.4.2 but package.json, and the file it drops still here: where a copy that failed would leave it.
	const f = await fixture(t, { holds: { ...RELEASES['0.4.2'], 'package.json': pkg('0.4.1'), 'src/old.ts': 'old' } })
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.2')
	assert.equal(f.read('src/old.ts'), null)
	assert.equal(existsSync(join(f.folder, 'changed-before-0.4.2')), false)
})

test('where two commits of main fit a changed folder equally, the older is taken, so the change is asked about', async (t) => {
	// main after 0.4.1: c1 moved the README, c2 the configuration, and 0.4.2 has c2's. The folder is c1 with the
	// owner's own edit of the configuration, which is one file away from c1 and one file away from c2.
	const c1 = { ...RELEASES['0.4.1'], 'README.md': 'readme 2' }
	const c2 = { ...c1, 'cloudflare.config.ts': 'config 2' }
	const releases = { ...RELEASES, '0.4.2': { ...RELEASES['0.4.2'], 'cloudflare.config.ts': 'config 2' } }
	const f = await fixture(t, { holds: { ...c1, 'cloudflare.config.ts': 'config 1, with my own change' }, releases, commits: { aaaaaaa1: c1, bbbbbbb2: c2 } })
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /would replace it:\n {2}cloudflare\.config\.ts\n/)
	assert.equal(f.read('cloudflare.config.ts'), 'config 1, with my own change')
})

test('a folder downloaded from main after the release is not taken for one someone changed', async (t) => {
	// As main had it two commits after 0.4.1: the README moved on, the version didn't.
	const f = await fixture(t, { holds: COMMITS.bbbbbbb2 })
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.2')
	assert.match(result.log, /holds FluxBio 0\.4\.1 as main had it a little after the release \(bbbbbbb\)/)
	assert.equal(existsSync(join(f.folder, 'changed-before-0.4.2')), false)
	// The release's own commit is not asked for: its version is the next one.
	assert.ok(!f.remote.asked.some((path) => path.includes('ccccccc3')))
})

test('and a change on top of such a folder is still found, as the one file it is', async (t) => {
	const f = await fixture(t, { holds: COMMITS.aaaaaaa1 })
	f.write('src/page.ts', 'page 2, with my own change')
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /One file in this folder is not as FluxBio 0\.4\.1 had it, and the update would replace it:\n {2}src\/page\.ts\n/)
	assert.ok(!result.log.includes('README.md'))
})

test('when main’s commits can’t be listed, a folder that already has what the update brings still goes ahead', async (t) => {
	// Its README is the one 0.4.2 has, so nothing of anyone's would be replaced.
	const f = await fixture(t, { holds: COMMITS.bbbbbbb2 })
	f.remote.compare = false
	const result = await f.run()
	assert.equal(result.code, 0, result.log)
	holdsRelease(f, '0.4.2')
})

test('and one that has neither says its list may be too long, and changes nothing unasked', async (t) => {
	// Its README is main's between the two releases: without the commits, that can't be told from an edit.
	const f = await fixture(t, { holds: COMMITS.aaaaaaa1 })
	f.remote.compare = false
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /could not be listed, so some of what is called changed below may only be newer/)
	assert.match(result.log, /README\.md/)
	assert.equal(f.read('package.json'), pkg('0.4.1'))
})

for (const [what, setup, args, said] of [
	['a git checkout', (f) => mkdirSync(join(f.folder, '.git')), [], /git checkout[\s\S]*`git pull`/],
	['a folder that isn’t FluxBio', (f) => rmSync(join(f.folder, 'cloudflare.config.ts')), [], /Run this in a FluxBio folder/],
	['a release that doesn’t exist', () => {}, ['--to', '9.9.9'], /There is no release 9\.9\.9\. The newest is 0\.4\.2/],
	['an older release than the folder has', () => {}, ['--to', '0.4.0'], /newer than 0\.4\.0\. Going back is not something this script does/],
	['a changelog that names no release', (f) => { f.remote.changelog = '# Changelog\n' }, [], /names no release/],
	['an option it doesn’t have', () => {}, ['--force'], /Unknown option --force/],
]) {
	test(`${what} is refused, and nothing is changed`, async (t) => {
		const f = await fixture(t)
		setup(f)
		const result = await f.run(...args)
		assert.equal(result.code, 1, result.log)
		assert.match(result.log, said)
		assert.equal(f.read('src/page.ts'), 'page 2')
	})
}

test('a version from before releases had tags is sent to the steps for a new download', async (t) => {
	const f = await fixture(t, { holds: { ...RELEASES['0.4.1'], 'package.json': pkg('0.2.1') } })
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /FluxBio 0\.2\.1 is from before releases had tags/)
})

test('a release whose download isn’t there yet says to try again shortly', async (t) => {
	const f = await fixture(t)
	f.remote.changelog = CHANGELOG.replace('## 0.4.2 - 2027-01-10', '## 0.4.3 - 2027-01-12\n\n### Fixed\n- Just merged.\n\n## 0.4.2 - 2027-01-10')
	const result = await f.run()
	assert.equal(result.code, 1, result.log)
	assert.match(result.log, /The release 0\.4\.3 has no download yet[\s\S]*try again shortly\. Nothing was changed/)
	assert.equal(f.read('package.json'), pkg('0.4.1'))
})
