// How much of the free plan's daily KV quota is used and left, on the Cloudflare account you are signed in to.
//   pnpm kv-usage                     today, with what is left and when it resets
//   pnpm kv-usage --date 2026-10-28   one UTC day
//   pnpm kv-usage --days 7            the last 7 days, one line each
//   pnpm kv-usage --json              the same as JSON, for scripts and agents
//   pnpm kv-usage --account <id>      if you can reach several accounts (or set CLOUDFLARE_ACCOUNT_ID)
// It reads Cloudflare's analytics and changes nothing. Numbers cover every Worker on the account, not only FluxBio.
import { execFile } from 'node:child_process'
import { runnerImport } from 'vite'

const { module: kv } = await runnerImport('./src/shared/kvUsage.ts')
const LABELS = { read: 'reads', write: 'writes', delete: 'deletes', list: 'lists' }
const NOTE = 'Estimates from sampled analytics; the last few minutes may not be counted yet. Cloudflare keeps about 31 days.'

function fail(message) {
	console.error(message)
	process.exit(1)
}

function options(argv) {
	const opts = { json: false }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		const value = () => argv[++i] ?? fail(`${arg} needs a value.`)
		if (arg === '--json') opts.json = true
		else if (arg === '--date') opts.date = value()
		else if (arg === '--days') opts.days = value()
		else if (arg === '--account') opts.account = value()
		else fail(`Unknown option ${arg}. Try --date YYYY-MM-DD, --days N, --json or --account <id>.`)
	}
	if (opts.date && opts.days) fail('Use --date or --days, not both.')
	if (opts.date && !kv.isDay(opts.date)) fail(`${opts.date} is not a date. Write it as YYYY-MM-DD.`)
	if (opts.days !== undefined && !(Number.isInteger(Number(opts.days)) && Number(opts.days) >= 1 && Number(opts.days) <= 31)) fail('--days takes a whole number from 1 to 31.')
	return opts
}

const cf = (args) =>
	new Promise((resolve) =>
		execFile('pnpm', ['exec', 'cf', ...args], { maxBuffer: 5e7, timeout: 90_000 }, (error, stdout, stderr) =>
			// eslint-disable-next-line no-control-regex
			resolve({ ok: !error, stdout, stderr: String(stderr).replace(/\x1b\[[0-9;]*m/g, '') }),
		),
	)

async function accountId(given) {
	if (given) return given
	// The sign-in sometimes answers without its accounts on the first try.
	for (let attempt = 0; attempt < 3; attempt++) {
		const who = await cf(['auth', 'whoami'])
		let info = null
		try {
			info = JSON.parse(who.stdout)
		} catch {}
		if (!info?.authenticated) fail('Cloudflare is not signed in. Run: pnpm exec cf auth login')
		const accounts = info.accounts ?? []
		if (accounts.length === 1) return accounts[0].id
		if (accounts.length > 1) fail(`You can reach several accounts. Pick one with --account:\n${accounts.map((a) => `  ${a.id}  ${a.name}`).join('\n')}`)
	}
	return fail('Could not tell which Cloudflare account to read. Pass --account <id> or set CLOUDFLARE_ACCOUNT_ID.')
}

async function sql(account, query, since, until) {
	const args = ['sql', 'query', `${query} FORMAT JSONEachRow`, '--scope-account', account, '--time-since', since]
	if (until) args.push('--time-until', until)
	for (let attempt = 0; ; attempt++) {
		const result = await cf(args)
		if (result.ok) {
			// The CLI hands the rows back as one JSON string, with a line per row, and nothing at all for no rows.
			if (!result.stdout.trim()) return []
			const text = JSON.parse(result.stdout)
			return text.trim() ? text.trim().split('\n').map((line) => JSON.parse(line)) : []
		}
		const body = result.stderr.match(/Body: (.*)/)?.[1] ?? result.stderr.trim()
		if (/\b(401|403)\b/.test(result.stderr)) fail(`Cloudflare refused this. Your sign-in needs the Account Analytics Read permission.\n${body.slice(0, 200)}`)
		if (attempt === 3 || !/\b(429|5\d\d)\b/.test(result.stderr)) fail(`Cloudflare could not answer. Try again in a minute.\n${body.slice(0, 200)}`)
		await new Promise((resolve) => setTimeout(resolve, 3000))
	}
}

async function namespaceNames() {
	const result = await cf(['kv', 'namespaces', 'list', '--per-page', '100'])
	try {
		const parsed = JSON.parse(result.stdout)
		return new Map((parsed.result ?? parsed).map((namespace) => [namespace.id, namespace.title]))
	} catch {
		return new Map()
	}
}

const number = (value) => value.toLocaleString('en-US')
const pad = (value, width) => String(value).padStart(width)

function duration(ms) {
	const minutes = Math.max(0, Math.ceil(ms / 60_000))
	return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

/** Operations per namespace, busiest first. */
function byNamespace(rows, names) {
	const totals = new Map()
	for (const row of rows) {
		const entry = totals.get(row.namespaceId) ?? { id: row.namespaceId, name: names.get(row.namespaceId) ?? null, read: 0, write: 0, delete: 0, list: 0 }
		if (row.actionType in entry) entry[row.actionType] += Number(row.ops) || 0
		totals.set(row.namespaceId, entry)
	}
	return [...totals.values()].sort((a, b) => b.read + b.write * 100 - (a.read + a.write * 100))
}

const opts = options(process.argv.slice(2))
const account = await accountId(opts.account ?? process.env.CLOUDFLARE_ACCOUNT_ID)
const now = new Date()

if (opts.days) {
	const days = kv.lastDays(now, Number(opts.days))
	const rows = await sql(
		account,
		'SELECT toDate(timestamp) AS day, actionType, SUM(sampleInterval) AS ops FROM events.kvRequests GROUP BY day, actionType ORDER BY day DESC LIMIT 500',
		`${days.at(-1)}T00:00:00Z`,
	)
	const report = days.map((day) => ({ day, usage: kv.kvQuota(rows.filter((row) => row.day === day)) }))
	if (opts.json) {
		console.log(JSON.stringify({ limits: kv.KV_DAILY_LIMITS, days: report, note: NOTE }, null, 2))
	} else {
		console.log(`KV on this Cloudflare account, last ${days.length} days (UTC)\n`)
		console.log(`day         ${kv.KV_ACTIONS.map((action) => pad(LABELS[action], 8)).join('')}`)
		for (const { day, usage } of report) console.log(`${day}  ${kv.KV_ACTIONS.map((action) => pad(number(usage[action].used), 8)).join('')}`)
		console.log(`limit       ${kv.KV_ACTIONS.map((action) => pad(number(kv.KV_DAILY_LIMITS[action]), 8)).join('')}\n\n${NOTE}`)
	}
	process.exit(0)
}

const day = opts.date ?? kv.utcDay(now)
const today = day === kv.utcDay(now)
if (day > kv.utcDay(now)) fail(`${day} hasn't happened yet.`)
const { since, until } = kv.dayRange(day)
const [rows, names] = await Promise.all([
	sql(account, 'SELECT namespaceId, actionType, SUM(sampleInterval) AS ops FROM events.kvRequests GROUP BY namespaceId, actionType LIMIT 1000', since, today ? undefined : until),
	namespaceNames(),
])
const usage = kv.kvQuota(rows)
const namespaces = byNamespace(rows, names)
const reset = kv.nextReset(now)

if (opts.json) {
	console.log(JSON.stringify({ day, today, limits: 'free plan, per Cloudflare account, per UTC day', ...(today ? { resetsAt: reset.toISOString(), resetsInMinutes: Math.ceil((reset - now) / 60_000), plain: kv.kvLeftInPlainWords(usage) } : {}), usage, namespaces, note: NOTE }, null, 2))
	process.exit(0)
}

console.log(`KV on this Cloudflare account, ${today ? `today (${day} UTC)` : `${day} UTC`}`)
if (today) console.log(`Resets in ${duration(reset - now)}, at ${reset.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })} your time.`)
if (today) {
	const left = kv.kvLeftInPlainWords(usage)
	console.log(`In plain words: about ${number(left.pageViews)} more page views today, and about ${number(left.changes)} more changes (publishing, new short links).`)
}
console.log(`\n          ${pad('used', 8)}${pad('limit', 9)}${today ? pad('left', 9) : ''}${pad('used %', 8)}`)
for (const action of kv.KV_ACTIONS) {
	const quota = usage[action]
	console.log(`${LABELS[action].padEnd(10)}${pad(number(quota.used), 8)}${pad(number(quota.limit), 9)}${today ? pad(number(quota.left), 9) : ''}${pad(`${quota.percent}%`, 8)}`)
}
if (namespaces.length) {
	console.log('\nBy namespace:')
	const width = Math.max(...namespaces.map((entry) => kv.kvNamespaceLabel(entry.id, entry.name).length))
	for (const entry of namespaces) console.log(`  ${kv.kvNamespaceLabel(entry.id, entry.name).padEnd(width)}  ${kv.KV_ACTIONS.map((action) => `${LABELS[action]} ${number(entry[action])}`).join('  ')}`)
} else {
	console.log('\nNothing recorded for this day.')
}
console.log(`\nFree plan limits, shared by every Worker on the account. At a limit, that kind of operation fails until the reset.\n${NOTE}`)
