/// <reference types="vite/client" />
import { THEME_IDS, type Locale, type PageContent, type ThemeId } from '../src/shared/content'
import { STARTER_IDS, type StarterId } from '../src/shared/starters'
import { renderBioPage } from '../src/templates/render'
import { PERSONA_COVERS, personaContent, type SampleWords } from './fixtures'

/**
 * What the fluxbio.link landing page shows in each theme: the made-up pages in
 * fixtures.ts, made into static files when the site is built (build.mjs), with
 * their pictures from public/images/.
 */
const SAMPLES = import.meta.glob<SampleWords>('./sample/*.json', { import: 'default', eager: true })

const sampleWords = (locale: Locale): SampleWords => SAMPLES[`./sample/${locale}.json`] ?? SAMPLES['./sample/zh-TW.json']!

/** Who suits each theme, and the picture it leads with: `null` for none, left out for their own. */
export const THEME_SAMPLES: Record<ThemeId, [StarterId, string | null] | [StarterId]> = {
	liquid: ['pro', null],
	editorial: ['creator', 'cover-photo.webp'],
	brutal: ['creator'],
	jelly: ['shop', null],
	minimal: ['org', null],
	aurora: ['event'],
	notebook: ['pro', null],
	boutique: ['shop', 'cover-atelier.webp'],
	sunset: ['pro', null],
	sky: ['pro', null],
	pop: ['creator', null],
	portrait: ['pro', null],
	sheet: ['shop'],
	rail: ['creator', null],
	duo: ['org', null],
	relief: ['pro', null],
	bento: ['event'],
	dots: ['creator', null],
	pastel: ['creator', null],
	letter: ['org', null],
	obsidian: ['event'],
	moon: ['creator', null],
	chips: ['creator', null],
	tracks: ['event'],
}

/** A sample page in a theme and a language. `starter` picks who it belongs to, instead of who suits the theme. */
export function showcaseContent(locale: Locale, theme: ThemeId, starter?: StarterId): PageContent {
	const [suited, picture] = THEME_SAMPLES[theme]
	const id = starter ?? suited
	const content = personaContent(id, sampleWords(locale))
	const coverImage = starter || picture === undefined ? (PERSONA_COVERS[id] ?? null) : picture
	return { ...content, appearance: { ...content.appearance, theme, coverImage } }
}

/** Pages show whether they are open, so they are all drawn at one moment: a Wednesday at noon in Taipei. */
const DRAWN_AT = Date.UTC(2026, 9, 7, 4)

/** The file name of a preview, without its language: a theme, or a theme with someone else's page in it. */
export function previewName(theme: ThemeId, starter?: StarterId): string {
	return starter ? `${theme}-${starter}` : theme
}

/** Every preview a page of the site frames, read from the names in its template and the theme gallery. */
export function previewsIn(template: string): { name: string; theme: ThemeId; starter?: StarterId }[] {
	const named = [...template.matchAll(/\/preview\/\{\{@lang\}\}\/([\w-]+)"/g)].map((match) => match[1]!)
	const parts = new Map<string, { name: string; theme: ThemeId; starter?: StarterId }>(THEME_IDS.map((theme) => [theme, { name: theme, theme }]))
	for (const name of named) {
		if (parts.has(name)) continue
		const [theme, starter] = name.split('-') as [ThemeId, StarterId]
		if (!THEME_IDS.includes(theme) || !STARTER_IDS.includes(starter)) throw new Error(`No preview called ${name}`)
		parts.set(name, { name, theme, starter })
	}
	return [...parts.values()]
}

/** A sample page as a whole HTML file. */
export function previewPage(locale: Locale, theme: ThemeId, starter?: StarterId): string {
	return renderBioPage(showcaseContent(locale, theme, starter), {
		mode: 'preview',
		settled: true,
		locale,
		mediaUrl: (id) => `/images/${id}`,
		timeZone: 'Asia/Taipei',
		now: DRAWN_AT,
	})
}
