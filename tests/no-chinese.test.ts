import { beforeAll, describe, expect, it } from 'vitest'
import { findKeys } from '../src/admin/i18n/scan'
import { LOCALES } from '../src/shared/content'
import { ENGLISH, STARTER_WORDS } from '../src/shared/serverWords'
import { STARTER_IDS } from '../src/shared/starters'
import dashboardPage from '../admin/index.html?raw'
import { previewPage } from '../landing/previews'
import { renderLanding } from '../landing/render'
import template from '../landing/template.html?raw'
import { api, apiJson, call, visit } from './helpers'
import { GUIDE_TOPICS } from '../src/worker/lib/agentTopics'

// Traditional Chinese is the source language here, so it is what's left behind when something misses being translated.
// These check the places where nothing else would notice: text from the Worker, the guide an AI reads out from, and the landing page.
const HAN = /[㐀-鿿豈-﫿]/
const OTHER_SCRIPTS = ['en', 'es', 'pt-BR', 'fr', 'de', 'id', 'th', 'vi', 'ar'] as const
const dictionaries = import.meta.glob<Record<string, string>>('../src/admin/i18n/locales/*.json', { import: 'default', eager: true })
const workerCode = import.meta.glob<string>(['../src/worker/**/*.ts', '../src/shared/*.ts', '!../src/shared/googleFonts.ts', '!../src/shared/serverWords.ts'], { query: '?raw', import: 'default', eager: true })
const words = import.meta.glob<Record<string, string>>('../landing/locales/*.json', { import: 'default', eager: true })
const samples = import.meta.glob<unknown>('../landing/sample/*.json', { import: 'default', eager: true })
const shots = import.meta.glob('../landing/public/*/dash-*.webp', { query: '?url' })

/** A response without its translation keys, which are in Chinese on purpose: they're for the dashboard. */
function withoutKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withoutKeys)
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).filter(([name]) => !/^(key|params|\w+Key|\w+Params)$/.test(name)).map(([name, inner]) => [name, withoutKeys(inner)]))
	}
	return value
}
const sent = async (response: Response) => JSON.stringify(withoutKeys(await response.json()))

describe('pages made through the API', () => {
	for (const locale of OTHER_SCRIPTS) {
		for (const starter of STARTER_IDS) {
			it(`has no Chinese in the ${starter} starter in ${locale}`, async () => {
				const { page } = await apiJson<{ page: { draft: unknown } }>('/pages', { method: 'POST', json: { handle: `zh-${starter}-${locale}`.toLowerCase(), name: 'Name', starter, locale } })
				expect(JSON.stringify(page.draft)).not.toMatch(HAN)
			})
		}
	}

	it('uses the language of the site when none is named', async () => {
		const { settings } = await apiJson<{ settings: Record<string, unknown> }>('/state')
		await apiJson('/settings', { method: 'PUT', json: { ...settings, locale: 'de' } })
		const { page } = await apiJson<{ page: { draft: { profile: { bio: string } } } }>('/pages', { method: 'POST', json: { handle: 'zh-site-language', name: 'Name', starter: 'shop' } })
		expect(page.draft.profile.bio).toBe(STARTER_WORDS.de!['一句話介紹你的店・地區'])
		await apiJson('/settings', { method: 'PUT', json: settings })
	})

	it('keeps the text as written in Traditional Chinese, where it belongs', async () => {
		const { page } = await apiJson<{ page: { id: string; draft: { profile: { bio: string } } } }>('/pages', { method: 'POST', json: { handle: 'zh-traditional', name: 'Name', starter: 'shop', locale: 'zh-TW' } })
		expect(page.draft.profile.bio).toBe('一句話介紹你的店・地區')
		await api(`/pages/${page.id}`, { method: 'DELETE' })
	})
})

describe('what the API says', () => {
	let pageId = ''
	let linkId = ''
	beforeAll(async () => {
		const made = await apiJson<{ page: { id: string; draft: Record<string, unknown> } }>('/pages', { method: 'POST', json: { handle: 'zh-api', name: 'Name', starter: 'event', locale: 'en' } })
		pageId = made.page.id
		const link = await apiJson<{ link: { id: string } }>('/links', { method: 'POST', json: { url: 'https://example.com/a', slug: 'zh-api-link', title: 'A link' } })
		linkId = link.link.id
		await visit('/zh-api-link')
	})

	it('reads in English on every route that returns text', async () => {
		for (const path of ['/state', '/pages', `/pages/${pageId}`, '/links', `/links/${linkId}`, `/links/${linkId}/stats?days=7`, `/stats?page=${pageId}&days=7`, '/themes', '/themes/community', '/fonts?limit=5', '/tokens', '/export']) {
			const response = await api(path)
			expect(response.status, path).toBeLessThan(400)
			expect(await sent(response), path).not.toMatch(HAN)
		}
	})

	it('reads in English when something goes wrong', async () => {
		const failures: [string, Promise<Response>][] = [
			['no such route', api('/no-such-route')],
			['no such link', api('/links/no-such-link')],
			['bad body', api('/links', { method: 'POST', json: { url: 'not a url' } })],
			['name taken', api('/links', { method: 'POST', json: { url: 'https://example.com/b', slug: 'zh-api-link' } })],
			['nothing to publish yet', api(`/pages/${pageId}/publish`, { method: 'POST' })],
			['bad domain', api('/settings/verify-domain', { method: 'POST', json: { domain: 'not a domain' } })],
			['signed out', call('/api/pages')],
		]
		for (const [name, response] of failures) expect(await sent(await response), name).not.toMatch(HAN)
	})

	it('has a word for everything the Worker can say, the same as the dashboard', () => {
		const en = dictionaries['../src/admin/i18n/locales/en.json']!
		const keys = [...findKeys(workerCode)].filter((key) => en[key])
		expect(keys.length).toBeGreaterThan(50)
		// If this fails: pnpm i18n server
		for (const key of keys) expect(ENGLISH[key], key).toBe(en[key])
		for (const [code, words] of Object.entries(STARTER_WORDS)) {
			for (const [key, text] of Object.entries(words)) expect(text, `${code}: ${key}`).toBe(dictionaries[`../src/admin/i18n/locales/${code}.json`]![key])
		}
	})
})

describe('the guide for AI agents', () => {
	for (const path of ['/llms.txt', '/skill.md']) {
		it(`${path} has Chinese only where it says what it is for`, async () => {
			const guide = await (await visit(path)).text()
			const lines = guide.split('\n').filter((line) => HAN.test(line))
			expect(lines).toHaveLength(2)
			expect(lines.find((line) => line.includes('For an owner who writes Traditional Chinese'))).toBeTruthy()
			expect(lines.find((line) => line.includes('?s=電子報'))).toBeTruthy()
		})
	}

	for (const topic of GUIDE_TOPICS) {
		it(`/api/guide/${topic.id} has no Chinese`, async () => {
			expect((await (await visit(`/api/guide/${topic.id}`)).text()).split('\n').filter((line) => HAN.test(line))).toEqual([])
		})
	}
})

describe('the dashboard before it has loaded', () => {
	it('has no Chinese in its first page', () => {
		expect(dashboardPage).not.toMatch(HAN)
		expect(dashboardPage).toContain('<html lang="en">')
	})
})

describe('the landing page', () => {
	for (const locale of OTHER_SCRIPTS) {
		it(`has no Chinese in ${locale}, apart from the languages named in themselves`, () => {
			const page = renderLanding(template, words[`../landing/locales/${locale}.json`]!, locale)
				.replace(/<style[\s\S]*?<\/style>/g, '')
				.replace(/<script[\s\S]*?<\/script>/g, '')
				.replace(/<a [^>]*hreflang[^>]*>[^<]*<\/a>/g, '')
			expect(page).not.toMatch(HAN)
			expect(JSON.stringify(samples[`../landing/sample/${locale}.json`])).not.toMatch(HAN)
			for (const theme of ['moon', 'sheet', 'obsidian', 'sky', 'duo'] as const) expect(previewPage(locale, theme), theme).not.toMatch(HAN)
		})
	}

	for (const locale of LOCALES) {
		it(`shows the dashboard in ${locale} in its screenshots`, () => {
			const names = Object.keys(shots).filter((path) => path.includes(`/public/${locale}/`)).map((path) => path.split('/').pop()).sort()
			expect(names).toEqual(['dash-appearance.webp', 'dash-links.webp', 'dash-qr.webp', 'dash-stats.webp'])
			expect(renderLanding(template, words[`../landing/locales/${locale}.json`]!, locale)).toContain(`/${locale}/dash-links.webp`)
		})
	}
})
