import type { Hono } from 'hono'
import communityThemes from '../../../../themes/community.json'
import type { CommunityThemesResponse, FetchedThemesResponse, FontsResponse, OkResponse, ThemeResponse, ThemesResponse } from '../../../shared/api'
import { baseThemeNames, CommunityListSchema } from '../../../shared/community'
import { newId, ThemePresetInputSchema } from '../../../shared/content'
import { FONT_CATEGORIES, FONT_SCRIPTS, searchFonts } from '../../../shared/fonts'
import { matchLanguageTag } from '../../../shared/locale'
import { z } from '../../../shared/zod'
import { msg } from '../../../templates/msg'
import { ApiError, type AppEnv } from '../../types'
import { loadSettings, loadThemes, saveThemesStatement } from '../../lib/db'
import { ThemeFetchInput } from '../../lib/schemas'
import { readBody, readCappedText } from './helpers'

const COMMUNITY_URL = 'https://raw.githubusercontent.com/0t2/flux-bio/main/themes/community.json'
const MAX_THEME_BYTES = 512 * 1024

/** "https://github.com/a/b/blob/main/x.json" → its raw URL; only GitHub hosts are fetched. */
function rawGithubUrl(input: string): string | null {
	let url: URL
	try {
		url = new URL(input.trim())
	} catch {
		return null
	}
	if (url.protocol !== 'https:') return null
	if (url.hostname === 'github.com') {
		const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/)
		return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}` : null
	}
	if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'gist.githubusercontent.com') return url.href
	return null
}

export function registerThemeRoutes(api: Hono<AppEnv>): void {
	api.get('/themes', async (c) => c.json<ThemesResponse>({ themes: await loadThemes(c.env.DB) }))

	api.post('/themes', async (c) => {
		const preset = await readBody(c, ThemePresetInputSchema)
		const themes = await loadThemes(c.env.DB)
		if (themes.length >= 100) throw new ApiError(409, 'limit', msg('最多存 100 個主題'))
		const theme = { ...preset, id: newId(), createdAt: Date.now() }
		await saveThemesStatement(c.env.DB, [theme, ...themes]).run()
		return c.json<ThemeResponse>({ theme }, 201)
	})

	api.delete('/themes/:id', async (c) => {
		const themes = await loadThemes(c.env.DB)
		const next = themes.filter((theme) => theme.id !== c.req.param('id'))
		if (next.length === themes.length) throw new ApiError(404, 'not-found', msg('找不到這個主題'))
		await saveThemesStatement(c.env.DB, next).run()
		return c.json<OkResponse>({ ok: true })
	})

	api.get('/fonts', (c) => {
		const category = FONT_CATEGORIES.find((value) => value === c.req.query('category'))
		const script = FONT_SCRIPTS.find((value) => value === c.req.query('script'))
		const limit = Math.min(Math.max(Math.trunc(Number(c.req.query('limit'))) || 20, 1), 100)
		const found = searchFonts({ q: c.req.query('q')?.slice(0, 60), category, script })
		return c.json<FontsResponse>({ fonts: found.slice(0, limit), total: found.length })
	})

	api.get('/themes/community', async (c) => {
		// The themes' names in the owner's language, for an AI to say them as the dashboard does: ?lang=, else the page language.
		const asked = c.req.query('lang')
		const lang = (asked && matchLanguageTag(asked)) || (await loadSettings(c.env.DB)).locale
		const named = { lang, bases: baseThemeNames(lang) }
		let body: CommunityThemesResponse = { themes: CommunityListSchema.parse(communityThemes).themes, source: 'bundled', ...named }
		try {
			const response = await fetch(COMMUNITY_URL, { cf: { cacheTtl: 3600, cacheEverything: true }, signal: AbortSignal.timeout(4000) })
			if (response.ok) {
				const parsed = CommunityListSchema.safeParse(await response.json())
				if (parsed.success) body = { themes: parsed.data.themes, source: 'github', ...named }
			}
		} catch {
			// Offline, or the repository isn't public yet: the bundled list is fine.
		}
		return c.json(body)
	})

	api.post('/themes/fetch', async (c) => {
		const { url } = await readBody(c, ThemeFetchInput)
		const raw = rawGithubUrl(url)
		if (!raw) throw new ApiError(400, 'invalid', msg('請貼 GitHub 上的主題檔網址（github.com 或 raw.githubusercontent.com）'))
		let json: unknown
		try {
			const response = await fetch(raw, { redirect: 'error', signal: AbortSignal.timeout(5000) })
			if (!response.ok) throw new Error(String(response.status))
			json = JSON.parse(await readCappedText(response, MAX_THEME_BYTES))
		} catch {
			throw new ApiError(400, 'fetch', msg('讀不到這個主題檔，請確認網址是公開的 JSON 檔'))
		}
		const single = ThemePresetInputSchema.safeParse(json)
		if (single.success) return c.json<FetchedThemesResponse>({ themes: [single.data] })
		const list = z.object({ themes: z.array(ThemePresetInputSchema).min(1).max(500) }).safeParse(json)
		if (list.success) return c.json<FetchedThemesResponse>({ themes: list.data.themes })
		throw new ApiError(400, 'invalid', msg('這不是 FluxBio 的主題檔（需要 name、base、accent、font、button）'))
	})
}
