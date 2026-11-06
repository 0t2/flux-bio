import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { PageJson, StateResponse } from '../src/shared/api'
import { emptyContent, emptyLink, type LinkItem, type PageContent, type Settings } from '../src/shared/content'
import { api, apiJson, visit } from './helpers'

// "/" reads one KV record, "site", which carries the home page's copy. So whatever changes what visitors get on
// the home page has to reach it there too, and a change that must never be left to an old copy has to take it out first.

type Site = { home: string; page?: { handle: string; content: PageContent; viaShortLink: string[] } }

const site = async () => (await env.KV.get<Site>('site', 'json'))!
const html = async (path = '/') => (await visit(path)).text()
const link = (patch: Partial<LinkItem> = {}): LinkItem => ({ ...emptyLink(), id: 'home-link', title: 'Shop', url: 'https://shop.example/buy', slug: 'home-shop', ...patch })

async function publish(id: string, name: string, items: LinkItem[]): Promise<void> {
	await apiJson(`/pages/${id}/draft`, { method: 'PUT', json: { ...emptyContent(name), items } })
	await apiJson(`/pages/${id}/publish`, { method: 'POST' })
}

async function save(patch: Partial<Settings>): Promise<void> {
	const { settings } = await apiJson<StateResponse>('/state')
	await apiJson('/settings', { method: 'PUT', json: { ...settings, ...patch } })
}

describe('the home page at "/"', () => {
	let home: PageJson
	let other: PageJson

	it('has no copy before it is published, and one after', async () => {
		home = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'home-page', name: 'Mei' } })).page
		expect(await site()).toMatchObject({ home: '' })
		expect((await site()).page).toBeUndefined()
		expect((await visit('/')).status).toBe(200)

		await publish(home.id, 'Mei', [link()])
		expect(await site()).toMatchObject({ home: 'home-page', page: { handle: 'home-page' } })
		expect(await html()).toContain('Shop')
	})

	it('follows a publish', async () => {
		await publish(home.id, 'Mei', [link({ title: 'Store', hideUrl: true })])
		const page = await html()
		expect(page).toContain('Store')
		expect(page).not.toContain('Shop')
		expect(page).toContain('href="/home-shop"')
	})

	it("follows a short link's new name", async () => {
		await apiJson(`/pages/${home.id}/links/home-link/short`, { method: 'PUT', json: { slug: 'home-store' } })
		const page = await html()
		expect(page).toContain('href="/home-store"')
		expect(page).not.toContain('href="/home-shop"')
	})

	it('stops showing an address the moment its link gets a password', async () => {
		await publish(home.id, 'Mei', [link({ slug: 'home-store' })])
		expect(await html()).toContain('shop.example')
		await apiJson('/links/home-link', { method: 'PATCH', json: { password: 'open-sesame' } })
		expect((await site()).page?.viaShortLink).toEqual(['home-link'])
		expect(await html()).not.toContain('shop.example')
	})

	it("follows the page's new address", async () => {
		await apiJson(`/pages/${home.id}`, { method: 'PATCH', json: { handle: 'home-moved' } })
		expect(await site()).toMatchObject({ home: 'home-moved', page: { handle: 'home-moved' } })
		expect((await visit('/')).status).toBe(200)
		expect((await visit('/home-moved')).status).toBe(200)
		expect((await visit('/home-page')).status).toBe(404)
	})

	it('is served from D1, and put back, when the record has lost its copy', async () => {
		const { page: _page, ...without } = await site()
		await env.KV.put('site', JSON.stringify(without))
		await env.KV.delete('name:home-moved')
		expect(await html()).toContain('Shop')
		expect(await site()).toMatchObject({ page: { handle: 'home-moved' } })
	})

	it('moves to the page that becomes home', async () => {
		other = (await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'home-other', name: 'Kai' } })).page
		await publish(other.id, 'Kai', [link({ id: 'other-link', title: 'Listen', slug: 'home-listen' })])
		expect(await html()).toContain('Shop')
		await save({ home: other.id })
		expect(await site()).toMatchObject({ home: 'home-other', page: { handle: 'home-other' } })
		const page = await html()
		expect(page).toContain('Listen')
		expect(page).not.toContain('Shop')
	})

	it('goes when pages are switched off, and comes back with them', async () => {
		await save({ bio: false })
		expect((await site()).page).toBeUndefined()
		expect(await html()).not.toContain('Listen')
		await save({ bio: true })
		expect(await html()).toContain('Listen')
	})

	it('leaves with the page', async () => {
		expect((await api(`/pages/${other.id}`, { method: 'DELETE' })).status).toBe(200)
		expect(await site()).toMatchObject({ home: '' })
		expect((await site()).page).toBeUndefined()
		const response = await visit('/')
		expect(response.status).toBe(404)
		expect(await response.text()).not.toContain('Listen')
	})
})
