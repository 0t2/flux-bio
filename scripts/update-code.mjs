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
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
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
			? `FluxBio ${version} is from before releases had tags, so this script can't tell what was changed in this folder. Update it the older way, with a new download beside this one: the steps are in the guide, at https://<your site>/api/guide/update, step 2.`
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

/**
 * Whether this folder has a file of exactly this name. A Mac or Windows finds a file whatever its capitals, so a
 * release that renames one only in its capitals would look as if it brought nothing new: the folders are listed.
 */
function here(path) {
	let at = root
	for (const part of path.split('/')) {
		let names
		try {
			names = readdirSync(at)
		} catch {
			return false
		}
		if (!names.includes(part)) return false
		at = join(at, part)
	}
	return lstatSync(at).isFile()
}

/** The files of FluxBio's that aren't in this folder as `base` has them: someone changed or removed them. */
const changedSince = (base) => files(base).filter((path) => !here(path) || !readFileSync(join(root, path)).equals(readFileSync(join(base, path))))

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
	const shas = listed.commits.map((commit) => commit?.sha).filter((sha) => typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha)).slice(0, -1)
	// Each is a download of the whole code. Between two releases there are a handful; where there are far more, the
	// version went unchanged over a long stretch of main, and walking it is not worth the wait.
	return shas.length > 40 ? null : shas
}

let was = await release(current)
let changed = changedSince(was)
let unlisted = false
if (changed.length) {
	// Not the release as tagged. Before calling that someone's changes, see whether it is main a little later.
	const commits = await commitsAfter(current)
	unlisted = commits === null
	// Oldest first, and only a closer match replaces an earlier one: where two fit equally, the older is the one
	// that calls more of the folder changed, and a wrong "changed" asks a question where a wrong "same" loses work.
	for (const sha of commits ?? []) {
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
const before = new Set(files(was))
const after = new Set(files(next))

const same = (a, b) => readFileSync(a).equals(readFileSync(b))
/** Whether the update does anything to a file: brings it, or brings it changed. One both releases have alike is left as it is here. */
const brought = (path) => !before.has(path) || !same(join(next, path), join(was, path))
// What the update would undo. Of FluxBio's files changed here: not one both releases have alike, nor one the owner
// removed that the release drops too, nor one that is already what the update brings.
const lost = changed.filter((path) => (after.has(path) ? brought(path) && !(here(path) && same(join(root, path), join(next, path))) : here(path)))
// And a file of the owner's own at a path the new release starts to use: it was never FluxBio's, so nothing above saw it.
for (const path of after) if (!before.has(path) && here(path) && !same(join(root, path), join(next, path))) lost.push(path)
/** Changed here and left alone by this update, because the releases don't differ there. */
const stays = changed.filter((path) => !lost.includes(path) && after.has(path) && !brought(path))

if (lost.length && !opts.overwrite) {
	if (unlisted) console.error(`The commits made after ${current} could not be listed, so some of what is called changed below may only be newer.\n`)
	fail(
		`Nothing was changed. ${lost.length === 1 ? 'One file in this folder is' : `${lost.length} files in this folder are`} not as FluxBio ${current} had ${lost.length === 1 ? 'it' : 'them'}, and the update would replace ${lost.length === 1 ? 'it' : 'them'}:\n` +
		lost.slice(0, 30).map((path) => `  ${path}${here(path) ? (before.has(path) ? '' : ' (yours: the new release has a file of this name)') : ' (removed here)'}`).join('\n') + (lost.length > 30 ? `\n  …and ${lost.length - 30} more` : '') +
		`\n\nIf those changes are meant, make them again after updating: pass --overwrite, and a copy of each goes to changed-before-${target}/ in this folder.\nWhat is this site's own belongs in worker.json and sites.json, which an update leaves alone.`,
	)
}
const staying = stays.length ? `${stays.length === 1 ? 'One file changed in this folder is' : `${stays.length} files changed in this folder are`} left as ${stays.length === 1 ? 'it is' : 'they are'}, because the update doesn't touch ${stays.length === 1 ? 'it' : 'them'}: ${stays.slice(0, 10).join(', ')}${stays.length > 10 ? '…' : ''}.` : ''

if (opts.check) {
	console.log(lost.length ? `${lost.length === 1 ? 'One file' : `${lost.length} files`} changed in this folder would be replaced, with a copy kept.` : 'The update would replace nothing that was changed in this folder, so it can go ahead.')
	if (staying) console.log(staying)
	console.log('Nothing was changed: run it without --check to update.')
	process.exit(0)
}

// What the release drops goes first, and the folders that leaves empty: a file renamed only in its capitals is the
// same file on a Mac or on Windows, and one that became a folder has to make way for it.
const dropped = [...before].filter((path) => !after.has(path) && here(path))
const bringing = [...after].filter((path) => brought(path))
// Before anything is touched: where the release needs a folder there may be a file of the owner's, or the reverse.
const kind = (path) => {
	try {
		return lstatSync(join(root, path))
	} catch {
		// Nothing there, or a file where a folder on the way would be.
		return undefined
	}
}
for (const path of bringing) {
	const parts = path.split('/')
	for (let depth = 1; depth < parts.length; depth++) {
		const parent = parts.slice(0, depth).join('/')
		if (kind(parent)?.isFile() && !dropped.includes(parent)) fail(`Nothing was changed. ${parent} is a file in this folder, and FluxBio ${target} has a folder of that name. Move it away and run this again.`)
	}
	if (kind(path)?.isDirectory() && files(root, path).some((inside) => !dropped.includes(inside))) fail(`Nothing was changed. ${path} is a folder in this folder, and FluxBio ${target} has a file of that name. Move it away and run this again.`)
}

for (const path of lost) {
	if (!here(path)) continue
	mkdirSync(dirname(join(root, `changed-before-${target}`, path)), { recursive: true })
	cpSync(join(root, path), join(root, `changed-before-${target}`, path))
}
for (const path of dropped) {
	rmSync(join(root, path))
	// The folders it leaves empty, up to this one.
	for (let dir = dirname(path); dir !== '.' && readdirSync(join(root, dir)).length === 0; dir = dirname(dir)) rmdirSync(join(root, dir))
}
// package.json last: it is what says which version a folder has, so a run that stops halfway can be run again.
for (const path of [...bringing.filter((path) => path !== 'package.json'), ...bringing.filter((path) => path === 'package.json')]) {
	if (kind(path)?.isDirectory()) rmSync(join(root, path), { recursive: true })
	mkdirSync(dirname(join(root, path)), { recursive: true })
	cpSync(join(next, path), join(root, path))
}
const kept = lost.filter((path) => existsSync(join(root, `changed-before-${target}`, path))).length
console.log(`This folder now has the code of FluxBio ${target}${dropped.length ? ` (${dropped.length === 1 ? 'one file it no longer has was' : `${dropped.length} files it no longer has were`} removed)` : ''}.${kept ? ` ${kept === 1 ? 'A copy of the file changed here is' : `Copies of the ${kept} files changed here are`} in changed-before-${target}/.` : ''}`)
if (staying) console.log(staying)

if (opts.install) {
	const installed = spawnSync('pnpm', ['install'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
	if (installed.status !== 0) fail('`pnpm install` did not finish. The code is updated: run `pnpm install` again before deploying.')
}
console.log(`\nNothing is deployed yet. ${actions.length ? 'Do what each "Action needed" above says, then deploy' : 'Deploy'} with \`pnpm deploy:images --site https://<your site>\`, or \`pnpm run deploy\`.`)
