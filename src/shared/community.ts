import { z } from './zod'
import { THEME_LIST } from '../templates/themes'
import { ThemePresetSchema, type Locale, type ThemeId } from './content'
import { THEME_WORDS } from './serverWords'
import { STARTER_IDS } from './starters'

/**
 * A color set from themes/community.json: one of a base theme's looks. `uses`
 * (the kinds of page it suits, as in the starters) sorts the theme library. A
 * value this version doesn't know, from a newer list on GitHub, is dropped
 * instead of failing the whole list; tests/themes.test.ts makes sure the list
 * itself has it. Pictures belong to one deployment, so a shared look has none, and a color set is colors: CSS is a
 * look an AI made for one page.
 */
export const CommunityThemeSchema = ThemePresetSchema.omit({ coverImage: true, bgImage: true, bgDim: true, bgTile: true, css: true }).extend({
	id: z.string().regex(/^[a-z0-9-]{2,40}$/),
	uses: z.array(z.enum(STARTER_IDS)).max(STARTER_IDS.length).optional().catch(undefined),
})
export type CommunityTheme = z.infer<typeof CommunityThemeSchema>

export const CommunityListSchema = z.object({ themes: z.array(CommunityThemeSchema).max(1000) })

/** A base theme as the dashboard names it in one language, and its English name, which the guide uses. */
export interface BaseThemeName {
	id: ThemeId
	name: string
	en: string
}

/** Every base theme, named as the owner sees it on Appearance in `locale`. */
export function baseThemeNames(locale: Locale): BaseThemeName[] {
	return THEME_LIST.map((theme) => ({ id: theme.id, name: locale === 'zh-TW' ? theme.label : (THEME_WORDS[locale]?.[theme.label] ?? theme.en), en: theme.en }))
}
