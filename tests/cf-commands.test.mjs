import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// The guide and AGENTS.md hand agents `cf` commands to run on someone's Cloudflare account, and `cf` is in beta: a
// command or a flag renamed in the version this project installs would leave them telling agents to run something
// that is no longer there, and nothing else would notice. So every `cf` command written in them is looked up in the
// installed CLI's own help. Nothing here signs in or reaches Cloudflare.

const root = fileURLToPath(new URL('../', import.meta.url))
const SOURCES = ['AGENTS.md', 'README.md', 'landing/AGENTS.md', 'src/worker/lib/agent.ts', 'src/worker/lib/agentTopics.ts', 'src/admin/pages/LoginPage.tsx']
const read = (path) => readFileSync(join(root, path), 'utf8')

/**
 * The `cf` commands in a text: `{ words, flags }` for each, where words is the command ("workers secrets update") and
 * flags the options given to it. A command ends where the shell would end it, and its words stop at the first thing
 * that isn't one: a value, a placeholder or an option.
 */
export function cfCommands(text) {
	const found = []
	// In prose `cf` is a name. A command starts a line of code or follows `pnpm exec`, or stands in backticks.
	for (const match of text.matchAll(/(?:pnpm (?:-s )?exec |\\?`|^\s*)cf ((?:[a-z][a-z0-9-]*)(?: [a-z][a-z0-9-]*)*)([^\n`|;&>]*)/gm)) {
		const flags = [...match[2].matchAll(/(?:^|\s)(--[a-z][a-z0-9-]*)/g)].map((flag) => flag[1])
		found.push({ words: match[1], flags })
	}
	return found
}

/** The same from a script, where a command is a list of words: `cf(['d1', 'list', '--per-page', '100'])`. */
export function cfCalls(code) {
	const found = []
	for (const match of code.matchAll(/(?:'cf',\s*|\bcf\(\[)((?:'[^']*'(?:,\s*)?)+)/g)) {
		const items = [...match[1].matchAll(/'([^']*)'/g)].map((item) => item[1])
		const stop = items.findIndex((item) => !/^[a-z][a-z0-9-]*$/.test(item))
		const words = items.slice(0, stop < 0 ? items.length : stop)
		if (words.length) found.push({ words: words.join(' '), flags: items.filter((item) => item.startsWith('--')) })
	}
	return found
}

test('reads the commands out of prose, code and template strings', () => {
	const text = [
		'`cf` is in beta. Find commands with `pnpm exec cf cli search "<what you want to do>"`, then',
		'pnpm exec cf workers secrets update ADMIN_PASSWORD --worker flux-bio --type secret_text --text \'<new>\'',
		'run \\`pnpm exec cf workers versions list --worker-id ${liveWorker}\\`, and',
		'pnpm exec cf workers list | grep \'"flux-bio"\'',
		'  cf deploy --dry-run   # nothing uploaded',
		'because `cf deploy` only uses `src/`',
	].join('\n')
	assert.deepEqual(cfCommands(text), [
		{ words: 'cli search', flags: [] },
		{ words: 'workers secrets update', flags: ['--worker', '--type', '--text'] },
		{ words: 'workers versions list', flags: ['--worker-id'] },
		{ words: 'workers list', flags: [] },
		{ words: 'deploy', flags: ['--dry-run'] },
		{ words: 'deploy', flags: [] },
	])
	assert.deepEqual(cfCalls("spawn('pnpm', ['exec', 'cf', 'workers', 'get', WORKER]); await cf(['d1', 'list', '--per-page', '100']); run('pnpm', ['exec', 'cf', ...args])"), [
		{ words: 'workers get', flags: [] },
		{ words: 'd1 list', flags: ['--per-page'] },
	])
})

const cf = join(root, 'node_modules/.bin/cf')
const help = (words) => new Promise((resolve) => {
	execFile(cf, [...words.split(' '), '--help'], { encoding: 'utf8', env: { ...process.env, CF_SEND_TELEMETRY: 'false' }, timeout: 60_000 }, (error, stdout, stderr) => {
		resolve({ ok: !error, text: `${stdout}\n${stderr}` })
	})
})

/** What is wrong with a command as the installed cf knows it: nothing, when it has the command and each option. */
async function problemsWith(words, flags) {
	const { ok, text } = await help(words)
	// Asked about a command it doesn't have, cf shows the help of the nearest one it does: so the help has to be this command's own.
	if (!ok || !new RegExp(`^cf ${words}( |$)`, 'm').test(text)) return [`\`cf ${words}\`: the installed cf has no such command.`]
	return flags.filter((flag) => !new RegExp(`(^|[\\s,])${flag}([\\s,=]|$)`, 'm').test(text)).map((flag) => `\`cf ${words} ${flag}\`: the command has no such option.`)
}

test('a command or an option cf doesn’t have is noticed', async () => {
	assert.deepEqual(await problemsWith('workers list', []), [])
	assert.equal((await problemsWith('workers no-such-command', [])).length, 1)
	assert.equal((await problemsWith('no-such-group list', [])).length, 1)
	assert.deepEqual(await problemsWith('deploy', ['--dry-run', '--no-such-option']), ['`cf deploy --no-such-option`: the command has no such option.'])
})

test('every cf command written for agents, and every one a script runs, is one the installed cf has, with those options', async () => {
	const wanted = new Map()
	const add = (source, commands) => {
		for (const { words, flags } of commands) {
			const entry = wanted.get(words) ?? { flags: new Set(), sources: new Set() }
			for (const flag of flags) entry.flags.add(flag)
			entry.sources.add(source)
			wanted.set(words, entry)
		}
	}
	for (const source of SOURCES) add(source, cfCommands(read(source)))
	for (const script of readdirSync(join(root, 'scripts')).filter((name) => name.endsWith('.mjs'))) add(`scripts/${script}`, cfCalls(read(`scripts/${script}`)))
	// If this reads nothing, the pattern broke, not the docs.
	for (const known of ['deploy', 'auth whoami', 'workers list', 'd1 list', 'kv namespaces list', 'workers secrets update', 'accounts subscriptions get']) assert.ok(wanted.has(known), `no \`cf ${known}\` found`)

	const problems = []
	const commands = [...wanted.entries()]
	const atOnce = 6
	for (let at = 0; at < commands.length; at += atOnce) {
		await Promise.all(commands.slice(at, at + atOnce).map(async ([words, { flags, sources }]) => {
			for (const problem of await problemsWith(words, [...flags])) problems.push(`${problem} (${[...sources].join(', ')})`)
		}))
	}
	assert.deepEqual(problems.sort(), [], `${problems.length} of the cf commands don't match cf ${JSON.parse(read('node_modules/cf/package.json')).version}. Find the new spelling with \`pnpm exec cf cli search "<what it does>"\`.`)
})
