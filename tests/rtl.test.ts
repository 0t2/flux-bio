import { describe, expect, it } from 'vitest'
import { LOCALES } from '../src/shared/content'
import { dirAttribute, intlTag, matchLanguageTag, textDirection } from '../src/shared/locale'
import { FONT_SCRIPTS, findFont, LOCALE_SCRIPTS } from '../src/shared/fonts'
import { renderLanding } from '../landing/render'
import landing from '../landing/template.html?raw'
import renderSource from '../src/templates/render.ts?raw'
import compositions from '../src/templates/compositions.ts?raw'
import systemSource from '../src/templates/system.ts?raw'
import styles from '../src/admin/styles.css?raw'
import qr from '../src/admin/qr.css?raw'
import library from '../src/admin/styles/library.css?raw'
import settings from '../src/admin/styles/settings.css?raw'
import stats from '../src/admin/styles/stats.css?raw'

const words = import.meta.glob<Record<string, string>>('../landing/locales/*.json', { import: 'default', eager: true })

describe('right to left', () => {
	it('knows which languages run right to left', () => {
		expect(LOCALES.filter((locale) => textDirection(locale) === 'rtl')).toEqual(['ar'])
		expect(textDirection('ar-EG')).toBe('rtl')
		expect(matchLanguageTag('ar-EG')).toBe('ar')
	})

	it('only marks the pages that need it, so the others stay as they were', () => {
		expect(dirAttribute('ar')).toBe(' dir="rtl"')
		expect(dirAttribute('en')).toBe('')
		expect(renderLanding(landing, words['../landing/locales/ar.json']!, 'ar')).toContain('<html lang="ar" dir="rtl">')
		expect(renderLanding(landing, words['../landing/locales/en.json']!, 'en')).toContain('<html lang="en">')
	})

	it('keeps the digits 0-9 in Arabic dates, as everywhere else', () => {
		const date = new Intl.DateTimeFormat(intlTag('ar'), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 4))
		expect(date).toMatch(/2026/)
		expect(date).not.toMatch(/[٠-٩]/)
		expect(intlTag('en')).toBe('en')
	})

	it('can find fonts that draw the language', () => {
		expect(FONT_SCRIPTS).toContain(LOCALE_SCRIPTS.ar)
		expect(findFont('Noto Sans Arabic')?.scripts).toContain('arabic')
		expect(findFont('Inter')?.scripts).not.toContain('arabic')
	})

	// A physical side stays where it is in a language written the other way. Logical properties
	// (margin-inline-start, inset-inline-end, text-align:start) follow the page's direction by themselves.
	const SIDES = /(?:margin|padding|border)-(?:left|right)\s*:|text-align:\s*(?:left|right)|(?<![-\w])(?:left|right):(?!\s*50%)\s*[^;}]/g
	const PAGES = { 'render.ts': renderSource, 'compositions.ts': compositions, 'system.ts': systemSource, 'template.html': landing }
	const DASHBOARD = { 'styles.css': styles, 'qr.css': qr, 'library.css': library, 'settings.css': settings, 'stats.css': stats }

	for (const [name, source] of Object.entries(PAGES)) {
		it(`lays out ${name} in logical properties`, () => {
			expect(source.match(SIDES) ?? []).toEqual([])
		})
	}
	for (const [name, source] of Object.entries(DASHBOARD)) {
		it(`lays out ${name} in logical properties`, () => {
			// .lib-bio is scaled from its top left corner, so it sits there in either direction.
			const found = source.replace(/\.lib-bio \{[^}]*\}/, '').match(SIDES) ?? []
			expect(found).toEqual([])
		})
	}
})
