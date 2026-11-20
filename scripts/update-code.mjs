// Brings the code in this folder to FluxBio's newest release. It deploys nothing: that stays a step of its own.
//   pnpm update:code                 show what the update brings, then replace FluxBio's files and install
//   pnpm update:code --check         only show it: nothing is changed
//   pnpm update:code --to 0.4.2      that release, not the newest
//   pnpm update:code --overwrite     also where FluxBio's files were changed in this folder; copies of those are kept
//   pnpm update:code --no-install    leave `pnpm install` to you
//
// Only files that are FluxBio's are touched: the ones in the release this folder holds now, and in the one it moves
// to. What is the owner's (worker.json, sites.json, .secrets*.env, .dev.vars, pictures) is in neither, so it stays.
// A release is a tag in the project's repository, which is how the script knows what this folder's files were when
// they were downloaded, and so whether someone has changed one since.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Where releases come from. A copy of the project kept elsewhere says so in FLUXBIO_SOURCE. */
const SOURCE = (process.env.FLUXBIO_SOURCE || 'https://github.com/0t2/flux-bio').replace(/\/$/, '')

function fail(message) {
	console.error(message)
	process.exit(1)
}

const args = process.argv.slice(2)
const opts = { check: false, to: null, overwrite: false, install: true }
for (let i = 0; i < args.length; i++) {
	const arg = args[i]
	if (arg === '--') continue
	else if (arg === '--check') opts.check = true
	else if (arg === '--overwrite') opts.overwrite = true
	else if (arg === '--no-install') opts.install = false
	else if (arg === '--to') opts.to = (args[++i] ?? fail('--to needs a version, like 0.4.2.')).replace(/^v/, '')
	else fail(`Unknown option ${arg}. Try --check, --to <version>, --overwrite or --no-install.`)
}

const root = process.cwd()
if (!existsSync(join(root, 'cloudflare.config.ts')) || !existsSync(join(root, 'package.json'))) fail('Run this in a FluxBio folder: the one with cloudflare.config.ts in it.')
if (existsSync(join(root, '.git'))) fail('This folder is a git checkout, so git knows what changed here better than this script: update it with `git pull`.')
const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const VERSION = /^\d+\.\d+\.\d+$/
if (!VERSION.test(current ?? '')) fail(`package.json has no version this script can read (${current}).`)
if (opts.to && !VERSION.test(opts.to)) fail(`${opts.to} is not a version. Write it like 0.4.2.`)

const numbers = (version) => version.split('.').map(Number)
/** Whether release `a` is newer than `b`. */
const newer = (a, b) => {
	const [x, y] = [numbers(a), numbers(b)]
	return x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2]
}

async function download(path) {
	const response = await fetch(`${SOURCE}${path}`, { signal: AbortSignal.timeout(120_000) }).catch(() => null)
	if (!response) fail(`${SOURCE} could not be reached. Nothing was changed.`)
	return response
}

// The changelog on main names the newest release and says what each one brings.
const listed = await download('/raw/main/CHANGELOG.md')
if (!listed.ok) fail(`${SOURCE}/raw/main/CHANGELOG.md answered ${listed.status}. Nothing was changed.`)
const changelog = await listed.text()
const releases = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map(([, version, date, body]) => ({ version, date, body: body.trim() }))
if (!releases.length) fail('The changelog names no release. Nothing was changed.')
const target = opts.to ?? releases[0].version
if (opts.to && !releases.some((release) => release.version === target)) fail(`There is no release ${target}. The newest is ${releases[0].version}.`)

if (target === current) {
	console.log(`This folder already has FluxBio ${current}${opts.to ? '' : ', the newest release'}.`)
	process.exit(0)
}
if (!newer(target, current)) fail(`This folder has FluxBio ${current}, which is newer than ${target}. Going back is not something this script does.`)

const coming = releases.filter((release) => newer(release.version, current) && !newer(release.version, target))
const actions = coming.filter((release) => /^### Action needed$/m.test(release.body))
console.log(`FluxBio ${current} → ${target}: ${coming.length === 1 ? 'one release' : `${coming.length} releases`}.\n`)
for (const release of coming) console.log(`## ${release.version} - ${release.date}\n${release.body}\n`)
if (actions.length) console.log(`${actions.length === 1 ? 'One of these has' : `${actions.length} of these have`} an "Action needed" (${actions.map((release) => release.version).join(', ')}): do what it says before you deploy.\n`)

const work = mkdtempSync(join(tmpdir(), 'fluxbio-update-'))
process.on('exit', () => rmSync(work, { recursive: true, force: true }))

/** The files of a download, unpacked: the folder they are in. */
async function unpack(response, name) {
	const file = join(work, `${name}.tar.gz`)
	const dir = join(work, name)
	writeFileSync(file, Buffer.from(await response.arrayBuffer()))
	mkdirSync(dir)
	const unpacked = spawnSync('tar', ['-xzf', file, '--strip-components=1', '-C', dir], { encoding: 'utf8' })
	if (unpacked.status !== 0) fail(`The download of ${name} could not be unpacked${unpacked.error ? `: ${unpacked.error.message}` : unpacked.stderr ? `: ${unpacked.stderr.trim()}` : ''}. Nothing was changed.`)
	return dir
}

/** A release's files. */
async function release(version) {
	const response = await download(`/archive/refs/tags/v${version}.tar.gz`)
	if (response.status === 404) {
		fail(newer('0.3.0', version)
			? `FluxBio ${version} is from before releases had tags, so this script can't tell what was changed in this folder. Update it the way AGENTS.md 1.9 says: a new download beside this one.`
			: `The release ${version} has no download yet (${SOURCE}/archive/refs/tags/v${version}.tar.gz). It is made a minute or two after a version is merged: try again shortly. Nothing was changed.`)
	}
	if (!response.ok) fail(`${SOURCE} answered ${response.status} for release ${version}. Nothing was changed.`)
	const dir = await unpack(response, version)
	if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version !== version) fail(`The download of release ${version} is another version. Nothing was changed.`)
	return dir
}

/** Every file under a folder, as paths from it. */
function files(dir, under = '') {
	return readdirSync(join(dir, under), { withFileTypes: true }).flatMap((entry) => {
		const path = under ? `${under}/${entry.name}` : entry.name
		return entry.isDirectory() ? files(dir, path) : entry.isFile() ? [path] : []
	})
}

/** The files of FluxBio's that aren't in this folder as `base` has them: someone changed or removed them. */
const changedSince = (base) => files(base).filter((path) => !existsSync(join(root, path)) || !readFileSync(join(root, path)).equals(readFileSync(join(base, path))))

/**
 * The commits on main from one release to the next, oldest first, the next release's own left out. A folder is
 * downloaded from main, and main moves between releases without the version changing (tests, docs, refactors), so a
 * folder that says 0.4.1 may hold any of these and not the release itself.
 */
async function commitsAfter(version) {
	const following = releases.findLast((release) => newer(release.version, version))?.version
	if (!following) return []
	const github = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(SOURCE)
	const address = github ? `https://api.github.com/repos/${github[1]}/compare/v${version}...v${following}` : `${SOURCE}/compare/v${version}...v${following}.json`
	const response = await fetch(address, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(60_000) }).catch(() => null)
	const listed = response?.ok ? await response.json().catch(() => null) : null
	if (!Array.isArray(listed?.commits)) return null
	return listed.commits.map((commit) => commit?.sha).filter((sha) => typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha)).slice(0, -1)
}

let was = await release(current)
let changed = changedSince(was)
if (changed.length) {
	// Not the release as tagged. Before calling that someone's changes, see whether it is main a little later.
	const commits = await commitsAfter(current)
	if (commits === null) console.log(`The commits made after ${current} could not be listed, so some of what is called changed below may only be newer.\n`)
	for (const sha of (commits ?? []).reverse()) {
		const response = await download(`/archive/${sha}.tar.gz`)
		if (!response.ok) continue
		const dir = await unpack(response, sha)
		if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version !== current) continue
		const differ = changedSince(dir)
		if (differ.length < changed.length) [was, changed] = [dir, differ]
		if (!changed.length) {
			console.log(`This folder holds FluxBio ${current} as main had it a little after the release (${sha.slice(0, 7)}).\n`)
			break
		}
	}
}
const next = await release(target)
const before = files(was)
const after = new Set(files(next))
const same = (a, b) => readFileSync(a).equals(readFileSync(b))
/** Whether the update does anything to a file: brings it, or brings it changed. One both releases have alike is left as it is here. */
const brought = (path) => !existsSync(join(was, path)) || !same(join(next, path), join(was, path))
// What of those changes the update would undo. Not a file both releases have alike, nor one the owner removed that
// the release drops too, nor one that is already what the update brings.
const lost = changed.filter((path) => {
	const here = existsSync(join(root, path))
	if (!after.has(path)) return here
	return brought(path) && !(here && same(join(root, path), join(next, path)))
})

if (lost.length && !opts.overwrite) {
	fail(
		`Nothing was changed. ${lost.length === 1 ? 'One file of FluxBio\'s was' : `${lost.length} files of FluxBio's were`} changed in this folder since ${current}, and the update would replace ${lost.length === 1 ? 'it' : 'them'}:\n` +
		lost.slice(0, 30).map((path) => `  ${path}${existsSync(join(root, path)) ? '' : ' (removed here)'}`).join('\n') + (lost.length > 30 ? `\n  …and ${lost.length - 30} more` : '') +
		`\n\nIf those changes are meant, make them again after updating: pass --overwrite, and a copy of each goes to changed-before-${target}/ in this folder.\nWhat is this site's own belongs in worker.json and sites.json, which an update leaves alone.`,
	)
}

if (opts.check) {
	console.log(lost.length ? `${lost.length} of FluxBio's files were changed in this folder and would be replaced.` : 'FluxBio\'s files in this folder are as that release had them, so the update can go ahead.')
	console.log('Nothing was changed: run it without --check to update.')
	process.exit(0)
}

for (const path of lost) {
	if (!existsSync(join(root, path))) continue
	mkdirSync(dirname(join(root, `changed-before-${target}`, path)), { recursive: true })
	cpSync(join(root, path), join(root, `changed-before-${target}`, path))
}
for (const path of after) {
	if (!brought(path)) continue
	mkdirSync(dirname(join(root, path)), { recursive: true })
	cpSync(join(next, path), join(root, path))
}
let removed = 0
for (const path of before) {
	if (after.has(path) || !existsSync(join(root, path))) continue
	rmSync(join(root, path))
	removed++
}
const kept = lost.filter((path) => existsSync(join(root, `changed-before-${target}`, path))).length
console.log(`This folder now has the code of FluxBio ${target}${removed ? ` (${removed === 1 ? 'one file it no longer has was' : `${removed} files it no longer has were`} removed)` : ''}.${kept ? ` ${kept === 1 ? 'A copy of the file changed here is' : `Copies of the ${kept} files changed here are`} in changed-before-${target}/.` : ''}`)

if (opts.install) {
	const installed = spawnSync('pnpm', ['install'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
	if (installed.status !== 0) fail('`pnpm install` did not finish. The code is updated: run `pnpm install` again before deploying.')
}
console.log(`\nNothing is deployed yet. ${actions.length ? 'Do what each "Action needed" above says, then deploy' : 'Deploy'} with \`pnpm deploy:images --site https://<your site>\`, or \`pnpm run deploy\`.`)
