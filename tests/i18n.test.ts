/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../src/admin/i18n/languages'
import { checkLocale, findKeys, findUntranslated } from '../src/admin/i18n/scan'

// Every dashboard string goes through t() or msg(), and every language has
// every key with the same {placeholders}. `pnpm i18n check` prints the details.
const sources = import.meta.glob<string>(['../src/admin/**/*.{ts,tsx}', '../src/shared/**/*.ts', '../src/templates/**/*.ts', '../src/worker/**/*.ts', '!**/*.d.ts'], {
	query: '?raw',
	import: 'default',
	eager: true,
})
const locales = import.meta.glob<Record<string, string>>('../src/admin/i18n/locales/*.json', { import: 'default', eager: true })
const keys = findKeys(sources)

describe('dashboard translations', () => {
	it('leave no Chinese text outside t() and msg()', () => {
		const admin = Object.fromEntries(Object.entries(sources).filter(([path]) => path.includes('/src/admin/') && !path.includes('/i18n/')))
		expect(findUntranslated(admin)).toEqual([])
	})

	it('have a file for every language but the source', () => {
		const files = Object.keys(locales).map((path) => path.split('/').pop()!.replace('.json', '')).sort()
		expect(files).toEqual(LANGUAGES.map((entry) => entry.code as string).filter((code) => code !== 'zh-TW').sort())
	})

	for (const [path, words] of Object.entries(locales)) {
		it(`are complete in ${path.split('/').pop()}`, () => {
			expect(checkLocale(keys, words)).toEqual({ missing: [], extra: [], broken: [] })
		})
	}
})
