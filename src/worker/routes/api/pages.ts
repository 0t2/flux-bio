import type { Context, Hono } from 'hono'
import type {
	CreatePageResponse,
	DeletePageResponse,
	DraftResponse,
	PageResponse,
	PagesResponse,
	PageVersionResponse,
	PageVersionsResponse,
	PreviewLinkResponse,
	PublishResponse,
	RestoreVersionResponse,
	ShortLinkResponse,
} from '../../../shared/api'
import { PageContentInputSchema } from '../../../shared/content'
import { requestedLocale } from '../../../shared/locale'
import { untranslated } from '../../../shared/translations'
import { msg } from '../../../templates/msg'
import { renderBioPage } from '../../../templates/render'
import { ApiError, type AppEnv } from '../../types'
import { createPreviewToken, sessionKeyOf } from '../../lib/auth'
import { getPageVersion, listPageVersions, loadSettings } from '../../lib/db'
import { createPage, deletePage, publishPage, renamePage, setPageLinkSlug, setPageQrLogo } from '../../lib/ops'
import { LinkShortInput, NewPageInput, PagePatchInput, PreviewLinkInput } from '../../lib/schemas'
import { customPageResponse, previewCsp } from '../site'
import { linkJson, loadPage, needsDraftVersion, pageJson, pageSummaries, publicOrigin, readBody, replaceDraft, seenDraft, versionJson } from './helpers'

async function loadVersion(c: Context<AppEnv>) {
	const page = await loadPage(c)
	const version = await getPageVersion(c.env.DB, page.id, c.req.param('versionId') ?? '')
	if (!version) throw new ApiError(404, 'not-found', msg('找不到'))
	return { page, version }
}

export function registerPageRoutes(api: Hono<AppEnv>): void {
	api.get('/pages', async (c) => {
		const db = c.env.DB
		return c.json<PagesResponse>({ pages: await pageSummaries(db, await loadSettings(db)) })
	})

	api.post('/pages', async (c) => {
		const input = await readBody(c, NewPageInput)
		const page = await createPage(c.env, input)
		return c.json<CreatePageResponse>({ page: pageJson(page), settings: await loadSettings(c.env.DB) }, 201)
	})

	api.get('/pages/:id', async (c) => {
		// A caller that says which draft it holds (If-None-Match with its draftUpdatedAt) gets 304 while that is still
		// the one. The dashboard asks every time its window comes back, and reading and sending a whole page to
		// compare one number would be most of what that costs. No ETag goes out: a draft's version says nothing of
		// the page's address or the languages turned on, so no cache may answer in the Worker's place.
		const held = c.req.header('if-none-match')?.trim().replace(/^"|"$/g, '')
		if (held) {
			const row = await c.env.DB.prepare('SELECT draft_updated_at AS version FROM pages WHERE id = ?1').bind(c.req.param('id')).first<{ version: number }>()
			if (row && String(row.version) === held) return c.body(null, 304, { 'cache-control': 'no-store' })
		}
		const [page, settings] = await Promise.all([loadPage(c), loadSettings(c.env.DB)])
		return c.json<PageResponse>({ page: { ...pageJson(page), untranslated: untranslated(page.draft, settings.languages) } })
	})

	api.patch('/pages/:id', async (c) => {
		const id = c.req.param('id')
		const { handle, qrLogo } = await readBody(c, PagePatchInput)
		if (handle !== undefined) await renamePage(c.env, id, handle)
		return c.json<PageResponse>({ page: pageJson(await setPageQrLogo(c.env, id, qrLogo)) })
	})

	api.delete('/pages/:id', async (c) => {
		await deletePage(c.env, c.req.param('id'))
		return c.json<DeletePageResponse>({ ok: true, settings: await loadSettings(c.env.DB) })
	})

	api.put('/pages/:id/draft', async (c) => {
		const seen = seenDraft(c)
		if (seen === undefined) throw needsDraftVersion()
		const draft = await readBody(c, PageContentInputSchema)
		return c.json<DraftResponse>({ draftUpdatedAt: await replaceDraft(c, seen, draft) })
	})

	api.post('/pages/:id/publish', async (c) => {
		const auth = c.get('auth')
		const by = auth.role === 'token' ? `token:${auth.name}` : 'owner'
		return c.json<PublishResponse>(await publishPage(c.env, c.req.param('id'), { by, seen: seenDraft(c) }))
	})

	api.put('/pages/:id/links/:itemId/short', async (c) => {
		const { slug } = await readBody(c, LinkShortInput)
		const { row, draftUpdatedAt } = await setPageLinkSlug(c.env, c.req.param('id'), c.req.param('itemId'), { slug, seen: seenDraft(c) })
		const body: ShortLinkResponse = { link: linkJson(row, publicOrigin(c, await loadSettings(c.env.DB))), draftUpdatedAt }
		return c.json(body)
	})

	api.get('/pages/:id/versions', async (c) => {
		const page = await loadPage(c)
		const versions = await listPageVersions(c.env.DB, page.id)
		return c.json<PageVersionsResponse>({ versions: versions.map((row) => versionJson(row, page)) })
	})

	api.get('/pages/:id/versions/:versionId', async (c) => {
		const { page, version } = await loadVersion(c)
		return c.json<PageVersionResponse>({ version: versionJson(version, page), content: version.content })
	})

	// Into the draft, never straight to visitors: going live is a publish like any other.
	api.post('/pages/:id/versions/:versionId/restore', async (c) => {
		const seen = seenDraft(c)
		if (seen === undefined) throw needsDraftVersion()
		const { version } = await loadVersion(c)
		return c.json<RestoreVersionResponse>({ draft: version.content, draftUpdatedAt: await replaceDraft(c, seen, version.content) })
	})

	api.get('/pages/:id/preview', async (c) => {
		const [page, settings] = await Promise.all([loadPage(c), loadSettings(c.env.DB)])
		if (page.draft.custom) return customPageResponse(page.draft.custom, { 'cache-control': 'no-store' })
		const html = renderBioPage(page.draft, {
			mode: 'preview',
			// With more languages turned on, the owner sees the page as their own browser's language would, or as ?lang= says.
			locale: requestedLocale(c.req.query('lang'), settings.locale, settings.languages, c.req.header('accept-language')),
			mediaUrl: (id) => `/media/${id}`,
			timeZone: settings.timezone,
		})
		return c.html(html, 200, { 'cache-control': 'no-store', 'content-security-policy': previewCsp(page.draft) })
	})

	api.post('/pages/:id/preview-link', async (c) => {
		const [page, settings] = await Promise.all([loadPage(c), loadSettings(c.env.DB)])
		if (!settings.bio) throw new ApiError(409, 'bio-off', msg('只做短網址時，預覽連結打不開，請先把它關掉'))
		// A bare POST is fine: the length has a default.
		const raw = await c.req.raw.clone().text()
		const { minutes } = raw.trim() ? await readBody(c, PreviewLinkInput) : {}
		const expiresAt = Math.floor(Date.now() / 1000 + (minutes ?? 10) * 60) * 1000
		const token = await createPreviewToken(await sessionKeyOf(c.env), page.id, expiresAt)
		const body: PreviewLinkResponse = { url: `${publicOrigin(c, settings)}/_draft/${token}`, expiresAt }
		return c.json(body)
	})
}
