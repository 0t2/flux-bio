import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PageJson, StateResponse } from '../src/shared/api'
import app from '../src/worker/index'
import { agentGuide, guideNames } from '../src/worker/lib/agent'
import { apiJson, IPHONE, ORIGIN, PASSWORD, visit } from './helpers'
import { guideTopic } from '../src/worker/lib/agentTopics'

// `cf deploy --mode staging` sets TEST_SITE: the same app, in a Worker of its own.
async function onTestSite(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers)
	headers.set('user-agent', IPHONE)
	const ctx = createExecutionContext()
	const response = await app.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init, headers }), { ...env, TEST_SITE: 'true' }, ctx)
	await waitOnExecutionContext(ctx)
	return response
}

beforeAll(async () => {
	const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'test-page', name: 'Test page' } })
	await apiJson(`/pages/${page.id}/publish`, { method: 'POST' })
	// The first page is the home page, listed as "/": this one is listed under its own address.
	const other = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'test-other', name: 'Other' } })
	await apiJson(`/pages/${other.page.id}/publish`, { method: 'POST' })
})

describe('a test site', () => {
	it('keeps every crawler out, with no sitemap to follow', async () => {
		expect(await (await onTestSite('/robots.txt')).text()).toBe('User-agent: *\nDisallow: /\n')
		const sitemap = await (await onTestSite('/sitemap.xml')).text()
		expect(sitemap).not.toContain('test-other')
		expect(sitemap).not.toContain('<loc>')
	})

	it('tells search engines not to list a page, in case one finds it anyway', async () => {
		const page = await onTestSite('/test-page')
		expect(page.status).toBe(200)
		expect(page.headers.get('x-robots-tag')).toBe('noindex, nofollow')
		expect(await page.text()).toContain('Test page')
	})

	it('tells an agent where it is', async () => {
		const state = await onTestSite('/api/state', { headers: { authorization: `Bearer ${PASSWORD}` } })
		expect(((await state.json()) as StateResponse).testSite).toBe(true)
		expect(await (await onTestSite('/llms.txt')).text()).toContain("is the owner's test site, not their live site")
		expect(await (await onTestSite('/skill.md')).text()).toContain("is the owner's test site, not their live site")
	})
})

describe('a live site', () => {
	it('is what it always was', async () => {
		expect(await (await visit('/robots.txt')).text()).toContain('Sitemap:')
		expect(await (await visit('/sitemap.xml')).text()).toContain('test-other')
		expect((await visit('/test-page')).headers.get('x-robots-tag')).toBeNull()
		expect((await apiJson<StateResponse>('/state')).testSite).toBe(false)
		expect(agentGuide(ORIGIN, 'flux-bio')).not.toContain('is the owner\'s test site, not their live site')
	})
})

describe('the guide', () => {
	const guide = agentGuide(ORIGIN, 'my-links')
	const topic = guideTopic('test-site', guideNames(ORIGIN, 'my-links'))
	const topicOnTestSite = guideTopic('test-site', guideNames(ORIGIN, 'my-links-staging'))

	it('has the agent ask, and skip the question when the request already answers it', () => {
		expect(guide).toContain('**Ask how they want to go about it.**')
		expect(guide).toContain('publish straight away, or look at a preview first?')
		expect(guide).toContain('deploy straight to the live site, or try it on their computer first?')
		expect(guide).toContain('Skip it when their request already says')
	})

	it("tries changes on the owner's computer, and makes a second site only when the owner asks, saying what it takes", () => {
		expect(guide).toContain("Recommend their computer if the site has visitors and you can run commands there")
		expect(topic).toContain('it uses none of their quota')
		expect(topic).toContain('only if the owner asks for one')
		expect(topic).toContain('it takes a second D1 database (10 per account on the free plan)')
	})

	it('never moves things to the live site with an import, and checks where it is before replacing anything', () => {
		expect(topic).toContain('**Never use `POST /api/import` to move things to the live site.**')
		expect(topic).toContain('only after `testSite` says `true`')
	})

	it('stops at the database limit: the owner decides what to remove, never the agent', () => {
		expect(topic).toContain('limit of D1 databases (10 on the free plan), stop and tell the owner')
		expect(topic).toContain('Never delete a database to make room on your own')
		expect(topic).toContain('pnpm exec cf dev --mode staging')
		expect(topic).toContain('`my-links-staging-kv`')
	})

	it('names the test site after the Worker, whichever site it is read from', () => {
		expect(topic).toContain('`my-links-staging`')
		expect(topicOnTestSite).toContain('`my-links-staging`')
		expect(topicOnTestSite).not.toContain('my-links-staging-staging')
	})
})
