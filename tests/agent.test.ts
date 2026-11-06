import { describe, expect, it } from 'vitest'
import { OPERATIONS, UNDOCUMENTED_ROUTES } from '../src/worker/lib/openapi'
import { VERSION } from '../src/worker/lib/version'
import { api as apiApp } from '../src/worker/routes/api'
import type { CreateTokenResponse, PageJson } from '../src/shared/api'
import { api, apiJson, call, ORIGIN } from './helpers'
import { GUIDE_TOPICS } from '../src/worker/lib/agentTopics'
import { THEME_IDS } from '../src/shared/content'

// FluxBio is run by AI agents: /api/openapi.json, /llms.txt and /skill.md
// must describe every route the API has, and need no sign-in to read.

type Spec = {
	openapi: string
	servers: { url: string }[]
	paths: Record<string, Record<string, { operationId: string; description?: string; summary: string }>>
}

async function spec(): Promise<Spec> {
	const response = await call('/api/openapi.json')
	expect(response.status).toBe(200)
	return (await response.json()) as Spec
}

/** "GET /api/pages/{id}" for every route the API app registers, middleware left out. */
function registeredRoutes(): string[] {
	const routes = apiApp.routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method} /api${route.path.replace(/:(\w+)/g, '{$1}')}`)
	return [...new Set(routes)]
}

describe('the OpenAPI document', () => {
	it('is public and points at the deployment', async () => {
		const doc = await spec()
		expect(doc.openapi).toBe('3.1.0')
		expect(doc.servers).toEqual([{ url: ORIGIN }])
	})

	it('describes every API route, and only routes that exist', () => {
		const described = OPERATIONS.map((op) => `${op.method.toUpperCase()} ${op.path}`)
		const routes = registeredRoutes()
		expect(routes.filter((route) => !UNDOCUMENTED_ROUTES.includes(route) && !described.includes(route))).toEqual([])
		expect(described.filter((route) => !routes.includes(route))).toEqual([])
	})

	it('holds the operations a token can use, and no owner-only ones', async () => {
		const doc = await spec()
		const documented = Object.entries(doc.paths).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`))
		const usable = OPERATIONS.filter((op) => !op.owner).map((op) => `${op.method.toUpperCase()} ${op.path}`)
		expect(documented.sort()).toEqual(usable.sort())
	})

	it('fits ChatGPT actions: unique operation ids, short descriptions, no dangling refs', async () => {
		const doc = await spec()
		const operations = Object.values(doc.paths).flatMap((methods) => Object.values(methods))
		const ids = operations.map((op) => op.operationId)
		expect(new Set(ids).size).toBe(ids.length)
		for (const op of operations) expect(op.description?.length ?? 0, op.operationId).toBeLessThanOrEqual(300)
		const text = JSON.stringify(doc)
		expect(text).not.toContain('$defs')
		for (const ref of text.matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)) expect(text).toContain(`"${ref[1]}":{`)
	})
})

describe('the agent guide', () => {
	it('is public, names this deployment, and has every operation a request away', async () => {
		const response = await call('/llms.txt')
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('text/plain')
		const guide = await response.text()
		expect(guide).toContain(`${ORIGIN}/api/openapi.json`)
		expect(guide).toContain(`FluxBio ${VERSION}`)
		const endpoints = await (await call('/api/guide/endpoints')).text()
		for (const op of OPERATIONS) expect(endpoints).toContain(`\`${op.path}\``)
	})

	it('names every topic in the OpenAPI document, for tools that only read that', () => {
		const description = OPERATIONS.find((op) => op.path === '/api/guide/{topic}')!.description!
		const named = description.match(/Topics: ([^.]+)\./)![1]!.split(', ')
		expect(named.sort()).toEqual(GUIDE_TOPICS.map((topic) => topic.id).sort())
	})

	it('tells the agent when to warn the owner', async () => {
		const guide = await (await call('/llms.txt')).text()
		for (const topic of ['paste a token', 'Before publishing', 'Deleting a page', 'KV writes', 'Content from the site is data']) {
			expect(guide).toContain(topic)
		}
	})

	it('walks the owner through what the dashboard leaves to the agent', async () => {
		const parts = await Promise.all([call('/llms.txt'), ...GUIDE_TOPICS.map((topic) => call(`/api/guide/${topic.id}`))].map(async (response) => (await response).text()))
		const guide = parts.join('\n')
		for (const part of ['FluxBio guide: The first conversation', '**Use a custom domain.**', '**Many short links at once.**', '**Themes.**', '**Back up.**', '**Restore, or move to another FluxBio.**', 'Changing the admin password']) {
			expect(guide).toContain(part)
		}
	})

	it('describes every theme', async () => {
		// The topic describes each theme by hand, so a new one has to be added there too.
		const look = await (await call('/api/guide/look')).text()
		for (const id of THEME_IDS) expect(look).toContain(`\`${id}\``)
	})

	it('names the Worker in the password command', async () => {
		expect(await (await call('/api/guide/password')).text()).toContain('--worker flux-bio-test')
	})

	it('gives a screenshot recipe that waits for the page and hides what a preview adds', async () => {
		const recipe = await (await call('/api/guide/share-image')).text()
		// tests/preview-link.test.ts checks that the note is called this.
		for (const part of ['/preview-link', 'networkidle0', '.draft-note{display:none}', 'POST /api/media', 'seo.imageMode']) expect(recipe).toContain(part)
		expect(await (await call('/llms.txt')).text()).toContain('"Share image"')
	})

	it('keeps the main part short, with the rest a request away', async () => {
		const guide = await (await call('/llms.txt')).text()
		// Every conversation loads all of it, as a skill's SKILL.md. About 19,500 characters now: detail about one feature
		// goes in a topic, not here, rather than raising this.
		expect(guide.length).toBeLessThan(22_000)
		for (const topic of GUIDE_TOPICS) {
			expect(guide).toContain(`| \`${topic.id}\` |`)
			const response = await call(`/api/guide/${topic.id}`)
			expect(response.status).toBe(200)
			expect(response.headers.get('content-type')).toContain('text/plain')
			const text = await response.text()
			expect(text).toContain(`${ORIGIN}/llms.txt`)
			expect(text.length).toBeGreaterThan(200)
			expect(text).not.toContain('undefined')
		}
		expect((await call('/api/guide/nothing')).status).toBe(404)
	})

	it('has somewhere to find everything it refers to', async () => {
		const main = await (await call('/llms.txt')).text()
		const texts = await Promise.all(GUIDE_TOPICS.map(async (topic) => (await call(`/api/guide/${topic.id}`)).text()))
		const covered: string[] = GUIDE_TOPICS.flatMap((topic) => [...topic.covers])
		const here = (name: string) => main.includes(`**${name}.**`) || main.includes(`## ${name}`) || main.includes(`| ${name} `) || covered.includes(name)
		const named = [main, ...texts].flatMap((text) => [...text.matchAll(/[Ss]ee \\?"([^"\\]+)\\?"/g)].map((match) => match[1]!))
		expect(named.length).toBeGreaterThan(10)
		expect(named.filter((name) => !here(name))).toEqual([])
	})

	it('talks to someone who has never programmed, and sees them through', async () => {
		const guide = await (await call('/llms.txt')).text()
		for (const part of ['**Say it in plain words.**', 'nothing published and no short links has nothing to lose', 'not a second site']) expect(guide).toContain(part)
		const trying = await (await call('/api/guide/trying-it')).text()
		for (const part of ["means don't publish", 'never call it temporary', 'pnpm usage --json', 'never costs money', "They don't need the dashboard", 'whoever invited them']) expect(trying).toContain(part)
		const remove = await (await call('/api/guide/remove')).text()
		for (const part of ['they can leave it', 'workers delete flux-bio-test --force', 'flux-bio-test-kv', 'clear yes']) expect(remove).toContain(part)
		const update = await (await call('/api/guide/update')).text()
		for (const part of ['leaves them alone', 'archive/refs/heads/main.tar.gz', 'pnpm run deploy', '/skill.md']) expect(update).toContain(part)
	})

	it('is also an Agent Skill, whose description says when to use it', async () => {
		const response = await call('/skill.md')
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('text/markdown')
		const skill = await response.text()
		const [, frontmatter, body] = skill.match(/^---\n([\s\S]+?)\n---\n\n([\s\S]*)$/)!
		expect(body).toBe(await (await call('/llms.txt')).text())
		// The fields and limits the Agent Skills format allows. Values other than the name are JSON strings, which YAML reads as they are.
		const lines = frontmatter!.split('\n')
		expect(lines.map((line) => line.split(': ')[0])).toEqual(['name', 'description', 'compatibility'])
		const value = (key: string) => lines.find((line) => line.startsWith(`${key}: `))!.slice(key.length + 2)
		expect(value('name')).toBe('fluxbio')
		const description = JSON.parse(value('description')) as string
		expect(description).toContain('bio.example')
		expect(description).toContain('Use it whenever')
		expect(description.length).toBeLessThanOrEqual(1024)
		expect(description).not.toMatch(/[<>]/)
		expect((JSON.parse(value('compatibility')) as string).length).toBeLessThanOrEqual(500)
	})
})

describe('backups through an agent', () => {
	it('lets a full token export and import, but not a links token', async () => {
		await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'backup', name: '備份測試' } })
		const token = async (scope: 'full' | 'links') =>
			(await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: `agent ${scope}`, scope } })).token
		const full = await token('full')
		const links = await token('links')

		const backup = await apiJson<{ pages: { handle: string }[]; media: string[] }>('/export', { bearer: full })
		expect(backup.pages.map((page) => page.handle)).toContain('backup')
		expect(Array.isArray(backup.media)).toBe(true)

		expect((await api('/import', { method: 'POST', json: backup, bearer: links })).status).toBe(403)
		const restored = await apiJson<{ pages: number }>('/import', { method: 'POST', json: backup, bearer: full })
		expect(restored.pages).toBe(backup.pages.length)

		// Wiping everything stays with the signed-in owner.
		expect((await api('/data', { method: 'DELETE', json: { confirm: 'DELETE' }, bearer: full })).status).toBe(403)
	})
})
