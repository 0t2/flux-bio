import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { PageJson } from '../src/shared/api'
import { defaultContent, ITEM_KINDS, newItem } from '../src/shared/content'
import { COPY_VERSION } from '../src/worker/lib/cache'
import { apiJson, visit } from './helpers'

// KV copies of published pages aren't parsed when a visitor asks for them, so a field page content gains is missing from
// every copy written before it, and drawing such a copy can fail. COPY_VERSION is what makes those copies count as
// missing, to be rebuilt from D1 with the field's default. This list is the shape the current version was written with.

/** Every key path of a value, objects only: arrays are a shape of their own and their items are checked by kind. */
function paths(value: unknown, prefix = ''): string[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return []
	return Object.entries(value).flatMap(([key, inner]) => [`${prefix}${key}`, ...paths(inner, `${prefix}${key}.`)])
}

const shape = () =>
	[...paths(defaultContent()), ...ITEM_KINDS.flatMap((kind) => paths(newItem(kind), `items[${kind}].`))].sort()

const WRITTEN_WITH: Record<number, string[]> = {
	5: [
		'appearance',
		'appearance.accent',
		'appearance.accent2',
		'appearance.bg',
		'appearance.bgDim',
		'appearance.bgImage',
		'appearance.bgTile',
		'appearance.bodyFont',
		'appearance.button',
		'appearance.coverImage',
		'appearance.css',
		'appearance.fg',
		'appearance.font',
		'appearance.headFont',
		'appearance.showName',
		'appearance.showSocial',
		'appearance.socialPlace',
		'appearance.theme',
		'items',
		'items[embed].account',
		'items[embed].hidden',
		'items[embed].id',
		'items[embed].kind',
		'items[embed].note',
		'items[embed].provider',
		'items[embed].title',
		'items[gallery].hidden',
		'items[gallery].id',
		'items[gallery].images',
		'items[gallery].kind',
		'items[gallery].title',
		'items[heading].hidden',
		'items[heading].id',
		'items[heading].kind',
		'items[heading].title',
		'items[hours].address',
		'items[hours].hidden',
		'items[hours].id',
		'items[hours].kind',
		'items[hours].note',
		'items[hours].phone',
		'items[hours].showMap',
		'items[hours].title',
		'items[hours].week',
		'items[link].endsAt',
		'items[link].featured',
		'items[link].hidden',
		'items[link].icon',
		'items[link].id',
		'items[link].kind',
		'items[link].slug',
		'items[link].startsAt',
		'items[link].subtitle',
		'items[link].title',
		'items[link].url',
		'items[product].hidden',
		'items[product].id',
		'items[product].kind',
		'items[product].moreUrl',
		'items[product].products',
		'items[product].title',
		'items[video].hidden',
		'items[video].id',
		'items[video].kind',
		'items[video].title',
		'items[video].url',
		'profile',
		'profile.avatar',
		'profile.bio',
		'profile.name',
		'seo',
		'seo.autoImage',
		'seo.autoImageKey',
		'seo.description',
		'seo.image',
		'seo.imageMode',
		'seo.tagline',
		'seo.title',
		'showBadge',
		'socials',
	],
}

describe('copies of pages in KV', () => {
	it('change version when page content changes shape', () => {
		const known = WRITTEN_WITH[COPY_VERSION]
		expect(known, 'COPY_VERSION has no list here: add one').toBeDefined()
		expect(
			shape(),
			'Page content changed shape. Raise COPY_VERSION in src/worker/lib/cache.ts, so pages published before are rebuilt ' +
				'from D1 instead of being drawn without the new field, then record the new shape here under the new version.',
		).toEqual(known)
	})

	it('draw a page published before a field existed, by rebuilding its copy', async () => {
		// What a deploy of a newer version finds: the copy written by the one before, without a field added since.
		const { page } = await apiJson<{ page: PageJson }>('/pages', { method: 'POST', json: { handle: 'older-copy', name: 'Mei' } })
		await apiJson(`/pages/${page.id}/publish`, { method: 'POST', headers: { 'if-match': String(page.draftUpdatedAt) } })
		const { page: copy } = (await env.KV.get('name:older-copy', 'json')) as { page: { content: { appearance: Record<string, unknown> } } }
		delete copy.content.appearance.showName
		delete copy.content.appearance.socialPlace
		await env.KV.put('name:older-copy', JSON.stringify({ page: { ...copy, v: COPY_VERSION - 1 } }))
		const response = await visit('/older-copy')
		expect(response.status).toBe(200)
		expect(await response.text()).toContain('<h1>Mei</h1>')
		const { page: rebuilt } = (await env.KV.get('name:older-copy', 'json')) as { page: { v: number; content: { appearance: Record<string, unknown> } } }
		expect(rebuilt).toMatchObject({ v: COPY_VERSION, content: { appearance: { showName: true, socialPlace: 'top' } } })
	})
})
