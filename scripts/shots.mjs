// Retakes the landing page's dashboard screenshots from the sample pages in
// landing/fixtures.ts, so they can be rebuilt at any time and for any kind
// of page. It runs a local site from a throwaway copy of the repository, since
// `cf dev` keeps its state in the project: nothing touches your local data or a
// deployed site. Stop any `pnpm dev` first, as it needs port 5173.
//
//   pnpm shots --locale ja                     the made-up shop in a language, into landing/public/ja/
//   pnpm shots --category creator --out shots  another kind of page, somewhere else
//   pnpm shots --all --out shots               every kind, in shots/<kind>/
//   pnpm shots --locale en --out shots         in another language
//
// Needs .dev.vars (see AGENTS.md) and Chrome (set CHROME_PATH for another Chromium).
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { chromium } from 'playwright-core'
import { runnerImport } from 'vite'

const root = new URL('..', import.meta.url).pathname
const { values: args } = parseArgs({
	options: { category: { type: 'string', default: 'shop' }, all: { type: 'boolean', default: false }, out: { type: 'string' }, locale: { type: 'string', default: 'zh-TW' } },
})
const ORIGIN = 'http://localhost:5173'

const vars = join(root, '.dev.vars')
if (!existsSync(vars)) {
	console.error('Copy .dev.vars.example to .dev.vars first (see AGENTS.md).')
	process.exit(1)
}
const password = /^ADMIN_PASSWORD=(.*)$/m.exec(readFileSync(vars, 'utf8'))?.[1]?.trim()
const { module: fixtures } = await runnerImport('./landing/fixtures.ts')
const { STARTER_IDS } = (await runnerImport('./src/shared/starters.ts')).module
const words = JSON.parse(readFileSync(join(root, `landing/sample/${args.locale}.json`), 'utf8'))
const categories = args.all ? STARTER_IDS : [args.category]
for (const category of categories) {
	if (!STARTER_IDS.includes(category)) {
		console.error(`Unknown category "${category}". Use one of: ${STARTER_IDS.join(', ')}`)
		process.exit(1)
	}
}

const headers = { authorization: `Bearer ${password}` }
async function api(method, path, body, extra = {}) {
	const response = await fetch(`${ORIGIN}/api${path}`, { method, headers: { ...headers, ...extra, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
	if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
	return response.json()
}

/** Publishes a made-up page, with its pictures uploaded under the ids the server gives them. */
async function seedPage(category) {
	await api('DELETE', '/data', { confirm: 'DELETE' })
	const content = fixtures.personaContent(category, words)
	content.appearance.coverImage = fixtures.PERSONA_COVERS[category] ?? null
	const { page } = await api('POST', '/pages', { handle: fixtures.PERSONA_HANDLES[category], name: content.profile.name })
	const uploaded = new Map()
	let text = JSON.stringify({ ...content, appearance: { ...page.draft.appearance, coverImage: content.appearance.coverImage, theme: THEMES[category] } })
	for (const file of new Set(text.match(/[\w-]+\.webp/g) ?? [])) {
		const response = await fetch(`${ORIGIN}/api/media`, { method: 'POST', headers: { ...headers, 'content-type': 'image/webp' }, body: readFileSync(join(root, 'landing/public/images', file)) })
		uploaded.set(file, (await response.json()).id)
	}
	text = text.replace(/[\w-]+\.webp/g, (file) => uploaded.get(file))
	await api('PUT', `/pages/${page.id}/draft`, JSON.parse(text), { 'if-match': String(page.draftUpdatedAt) })
	await api('POST', `/pages/${page.id}/publish`)
	await api('PUT', '/settings', { ...(await api('GET', '/state')).settings, timezone: 'Asia/Taipei', locale: args.locale })
	await api('POST', '/links', { url: 'https://example.com/spring', slug: 'spring', title: 'Spring', utm: { source: 'line', medium: 'broadcast', campaign: 'spring' } })
	const { links } = await api('GET', '/links')
	return { pageId: page.id, links }
}

const THEMES = { creator: 'brutal', shop: 'jelly', event: 'aurora', pro: 'notebook', org: 'minimal' }

/** The sample site runs on Taipei time, so a day's numbers fall on the day it shows. */
const taipeiNow = () => Date.now() + 8 * 3_600_000

/** Three months of numbers, the same on every run. D1 has no API for this, so they go straight into the local file. */
function seedStats(state, pageId, links) {
	const dir = join(state, '.cloudflare/state/v3/d1/miniflare-D1DatabaseObject')
	const file = readdirSync(dir).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
	const db = new DatabaseSync(join(dir, file))
	let seed = 7
	const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
	const sources = [['ig', 0.46], ['threads', 0.22], ['line', 0.14], ['direct', 0.12], ['qr', 0.06]]
	const insert = db.prepare('INSERT INTO stats(day,target,kind,dim,value,count) VALUES(?,?,?,?,?,?) ON CONFLICT DO UPDATE SET count=excluded.count')
	const add = (day, target, kind, total) => {
		for (const [source, share] of sources) {
			const count = Math.round(total * share)
			if (count > 0) insert.run(day, target, kind, 'source', source, count)
		}
	}
	for (let back = 0; back < 90; back++) {
		const date = new Date(taipeiNow() - back * 86_400_000)
		const day = date.toISOString().slice(0, 10)
		const weekend = [0, 6].includes(date.getUTCDay())
		const views = Math.max(9, 48 + (weekend ? 22 : 0) + Math.round(random() * 24 - 12) - back * 0.2)
		add(day, pageId, 'view', Math.round(views))
		links.forEach((link, index) => add(day, link.id, 'click', Math.round((views * 0.34) / (index + 1))))
	}
	db.close()
}

/** What Analytics Engine would say; it has no local implementation. Shaped like `insights` in GET /api/stats. */
function insights() {
	const template = JSON.parse(readFileSync(join(root, 'scripts/shots-insights.json'), 'utf8'))
	const visitorsByDay = {}
	Object.values(template.visitorsByDay).forEach((count, back) => {
		visitorsByDay[new Date(taipeiNow() - back * 86_400_000).toISOString().slice(0, 10)] = count
	})
	return { ...template, visitorsByDay }
}

async function takeShots(browser, category, out, links) {
	mkdirSync(out, { recursive: true })
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 / 3, locale: args.locale })
	const page = await context.newPage()
	// Signed in through the API, showing the address the landing page talks about.
	await page.route('**/api/**', async (route) => {
		const url = route.request().url()
		const request = { headers: { ...route.request().headers(), ...headers } }
		if (!/\/api\/(state|stats)\b/.test(url)) return route.continue(request)
		const response = await route.fetch(request)
		const json = await response.json()
		if (url.includes('/api/state')) json.origin = 'https://fluxbio.link'
		else json.insights = insights()
		return route.fulfill({ response, json })
	})
	const webp = async (png, name) => {
		const converter = await browser.newPage()
		const data = await converter.evaluate(async (base64) => {
			const image = new Image()
			image.src = `data:image/png;base64,${base64}`
			await image.decode()
			const canvas = document.createElement('canvas')
			canvas.width = image.width
			canvas.height = image.height
			canvas.getContext('2d').drawImage(image, 0, 0)
			return canvas.toDataURL('image/webp', 0.8)
		}, png.toString('base64'))
		await converter.close()
		writeFileSync(join(out, `${name}.webp`), Buffer.from(data.split(',')[1], 'base64'))
		console.log(`${category}: ${join(out, `${name}.webp`)}`)
	}
	const open = async (path, selector) => {
		await page.goto(`${ORIGIN}/admin/${path}`, { waitUntil: 'domcontentloaded' })
		await page.waitForSelector(selector, { timeout: 60_000 })
		await page.waitForTimeout(2200)
		await refuseChinese(path)
	}
	// Languages that use Chinese characters themselves can't be told apart this way, and lists of languages name each in itself.
	const refuseChinese = async (path) => {
		if (['zh-TW', 'zh-CN', 'ja', 'ko'].includes(args.locale)) return
		const found = await page.evaluate(() => {
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), texts = []
			for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/[㐀-鿿]/.test(node.data) && !['繁體中文', '简体中文', '日本語'].includes(node.data.trim()) && !node.parentElement.closest('select,script,style')) texts.push(node.data.trim())
			return texts
		})
		if (found.length) throw new Error(`Chinese on /admin/${path} in ${args.locale}: ${found.slice(0, 5).join(' / ')}`)
	}
	await open('', '.item-pick')
	await page.locator('.item-pick').first().click()
	await page.waitForTimeout(900)
	await page.mouse.move(5, 5)
	await webp(await page.screenshot(), 'dash-links')
	await open('stats', '.st-kpis')
	await webp(await page.screenshot(), 'dash-stats')
	const pageLink = links.find((link) => link.slug !== 'spring') ?? links[0]
	await open(`short-links/${pageLink.id}/qr`, '.main')
	await webp(await page.screenshot(), 'dash-qr')
	await open('appearance', '.option-grid.themes')
	// The sidebar is 229px wide, on the right in a language written right to left.
	const rtl = await page.evaluate(() => document.documentElement.dir === 'rtl')
	await webp(await page.screenshot({ clip: { x: rtl ? 1440 - 229 - 920 : 229, y: 49, width: 920, height: 590 } }), 'dash-appearance')
	await context.close()
}

const state = mkdtempSync(join(tmpdir(), 'fluxbio-shots-'))
const skipped = new Set(['node_modules', '.cloudflare', '.wrangler', '.git', '.claude', '.taste-skill'])
cpSync(root, state, { recursive: true, filter: (path) => !skipped.has(path.slice(root.length).split('/')[0]) })
execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile'], { cwd: state, stdio: 'ignore', env: { ...process.env, CI: 'true' } })
const server = spawn('pnpm', ['exec', 'cf', 'dev'], { cwd: state, stdio: 'ignore', detached: true })
try {
	let ready = false
	for (let tries = 0; tries < 120 && !ready; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 1000))
		ready = await fetch(`${ORIGIN}/llms.txt`).then((response) => response.ok, () => false)
	}
	if (!ready) throw new Error(`The local site did not start on ${ORIGIN}. Is the port free (pnpm exec cf auth whoami)?`)
	const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
	for (const category of categories) {
		const seeded = await seedPage(category)
		seedStats(state, seeded.pageId, seeded.links)
		const out = args.out ? (args.all ? join(args.out, category) : args.out) : join(root, `landing/public/${args.locale}`)
		await takeShots(browser, category, out, seeded.links)
	}
	await browser.close()
} finally {
	try {
		process.kill(-server.pid)
	} catch {
		// It had already stopped.
	}
	rmSync(state, { recursive: true, force: true })
}
