import { z } from 'zod'
import { ThemePresetSchema } from './content'
import { STARTER_IDS } from './starters'

/**
 * A color set from themes/community.json: one of a base theme's looks. `uses`
 * (the kinds of page it suits, as in the starters) sorts the theme library. A
 * value this version doesn't know, from a newer list on GitHub, is dropped
 * instead of failing the whole list; tests/themes.test.ts makes sure the list
 * itself has it. Pictures belong to one deployment, so a shared look has none.
 */
export const CommunityThemeSchema = ThemePresetSchema.omit({ coverImage: true, bgImage: true, bgDim: true }).extend({
	id: z.string().regex(/^[a-z0-9-]{2,40}$/),
	uses: z.array(z.enum(STARTER_IDS)).max(STARTER_IDS.length).optional().catch(undefined),
})
export type CommunityTheme = z.infer<typeof CommunityThemeSchema>

export const CommunityListSchema = z.object({ themes: z.array(CommunityThemeSchema).max(1000) })
