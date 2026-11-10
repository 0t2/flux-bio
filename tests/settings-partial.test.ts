import { describe, expect, it } from 'vitest'
import type { StateResponse } from '../src/shared/api'
import type { Settings } from '../src/shared/content'
import { apiJson } from './helpers'

// The owner's AI changes settings through the API while a dashboard tab stays open. That tab's copy of the settings is
// from when it loaded, so a switch in it that sent the whole copy back would undo what the AI set.

const settingsNow = async () => (await apiJson<StateResponse>('/state')).settings
const put = (json: Partial<Settings>) => apiJson<{ settings: Settings }>('/settings', { method: 'PUT', json })

describe('saving one setting', () => {
	it('keeps every other one as it is', async () => {
		await put({ timezone: 'Asia/Taipei', locale: 'ja', plan: 'paid', homeUrl: 'https://example.com/home' })
		const before = await settingsNow()
		expect(before).toMatchObject({ timezone: 'Asia/Taipei', locale: 'ja', plan: 'paid', homeUrl: 'https://example.com/home' })
		// What each switch in the dashboard sends.
		const switches: Partial<Settings>[] = [{ hostFonts: false }, { qrLogo: '' }, { home: '' }, { bio: true }, { plan: 'paid' }, { locale: 'ja', languages: [] }]
		for (const one of switches) {
			expect((await put(one)).settings, JSON.stringify(one)).toEqual(before)
		}
		expect(await settingsNow()).toEqual(before)
	})

	it('is all the dashboard sends: never its whole copy of the settings', () => {
		const sources = import.meta.glob<string>('../src/admin/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
		expect(Object.keys(sources).length).toBeGreaterThan(20)
		for (const [file, source] of Object.entries(sources)) {
			expect(source, file).not.toMatch(/json:\s*\{\s*\.\.\.[\w.]*settings\b/)
		}
	})
})
