import { isHttpUrl, linkItems, newId, type PageContent } from '../../../shared/content'
import { normalizeSlug, slugFromText, slugFromUrl, uniqueSlug } from '../../../shared/slug'
import { msg } from '../../../templates/msg'
import { ApiError } from '../../types'
import { putLinkRecord, putSnapshot, toLinkRecord } from '../cache'
import { clearPasswordTriesStatement, forgetPublicNames, getLink, getPage, loadSettings, upsertLinkStatement, type LinkRow } from '../db'
import { hashLinkPassword } from '../password'
import {
	assertNameFree,
	blankLink,
	draftChanged,
	dropAgain,
	dropCopies,
	linkNeedsWorker,
	optionalUrl,
	putCopies,
	refuseTooLarge,
	settleSlugs,
	snapshotOf,
	takenAmong,
	takenForBases,
	writeSite,
} from './kv'

export interface NewLink {
	url: string
	slug?: string
	title?: string
	utm?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null }
	expiresAt?: number | null
}

const cleanUtm = (value: string | null | undefined) => value?.trim().slice(0, 100) || null

function soloRow(input: NewLink, slug: string, now: number): LinkRow {
	return {
		...blankLink(now),
		id: newId(),
		slug,
		url: input.url.trim(),
		title: input.title?.trim().slice(0, 80) ?? '',
		kind: 'solo',
		pageId: null,
		expiresAt: input.expiresAt ?? null,
		utmSource: cleanUtm(input.utm?.source),
		utmMedium: cleanUtm(input.utm?.medium),
		utmCampaign: cleanUtm(input.utm?.campaign),
		utmContent: cleanUtm(input.utm?.content),
	}
}

export async function createSoloLink(env: Env, input: NewLink): Promise<LinkRow> {
	const { created, errors } = await createSoloLinks(env, [input])
	if (errors[0]) throw errors[0].error
	return created[0]!
}

/** Creates several standalone links at once; bad rows are reported and skipped. */
export async function createSoloLinks(
	env: Env,
	inputs: NewLink[],
): Promise<{ created: LinkRow[]; errors: { index: number; error: ApiError }[] }> {
	const db = env.DB
	const wanted = inputs.map((input) => normalizeSlug(input.slug ?? ''))
	const bases = inputs.map((input, i) => (wanted[i] || !isHttpUrl(input.url.trim()) ? '' : slugFromUrl(input.url.trim())))
	const named = await takenAmong(db, wanted)
	const taken = new Set([...named, ...(await takenForBases(db, bases))])
	const now = Date.now()
	const created: LinkRow[] = []
	const generated: LinkRow[] = []
	const errors: { index: number; error: ApiError }[] = []
	inputs.forEach((input, index) => {
		try {
			if (!isHttpUrl(input.url.trim())) throw new ApiError(400, 'invalid', msg('網址要以 http:// 或 https:// 開頭'))
			let slug = wanted[index]!
			if (slug) assertNameFree(slug, taken, msg('代稱'))
			else slug = uniqueSlug(bases[index]!, taken)
			taken.add(slug)
			const row = soloRow(input, slug, now)
			created.push(row)
			if (!wanted[index]) generated.push(row)
		} catch (error) {
			errors.push({ index, error: error instanceof ApiError ? error : new ApiError(400, 'invalid', msg('這一筆資料有問題，已略過')) })
		}
	})
	if (created.length) {
		await settleSlugs(db, generated, taken)
		await db.batch(created.map((row) => upsertLinkStatement(db, row)))
		await putCopies(created.map((row) => putLinkRecord(env, row.slug, toLinkRecord(row))))
	}
	return { created, errors }
}

export interface LinkPatch {
	url?: string
	slug?: string
	title?: string
	startsAt?: number | null
	expiresAt?: number | null
	/** A new password, or null to remove it. */
	password?: string | null
	utm?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null }
	status?: 'active' | 'archived'
	iosUrl?: string | null
	androidUrl?: string | null
	lineExternal?: boolean
	inAppPrompt?: boolean
	qr?: unknown
}

/**
 * Gives a link on a page its short link now, or a new slug, without waiting for a publish, the way a page's own address
 * changes at once. The slug also goes in the draft and in what's published, so a later publish keeps it.
 */
export async function setPageLinkSlug(
	env: Env,
	pageId: string,
	itemId: string,
	{ slug: wanted, seen }: { slug?: string; seen?: number },
): Promise<{ row: LinkRow; draftUpdatedAt: number }> {
	const db = env.DB
	const [page, settings, row] = await Promise.all([getPage(db, pageId), loadSettings(db), getLink(db, itemId)])
	if (!page) throw new ApiError(404, 'not-found', msg('找不到這個頁面'))
	if (seen !== undefined && seen !== page.draftUpdatedAt) throw draftChanged()
	const inDraft = linkItems(page.draft).find((link) => link.id === itemId)
	const inPublished = page.published ? linkItems(page.published).find((link) => link.id === itemId) : undefined
	if ((row && (row.kind !== 'bio' || row.pageId !== pageId)) || (!row && !inDraft)) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
	const active = row?.status === 'active' ? row : undefined
	if (active && wanted === undefined) return { row: active, draftUpdatedAt: page.draftUpdatedAt }

	const url = active ? active.url : (inDraft?.url.trim() ?? '')
	if (!isHttpUrl(url)) throw new ApiError(400, 'invalid', msg('網址要以 http:// 或 https:// 開頭'))
	const title = inDraft?.title.trim() ?? ''
	const except = { linkId: itemId }
	let slug = normalizeSlug(wanted ?? inDraft?.slug ?? '')
	if (slug) {
		if (active?.slug !== slug) assertNameFree(slug, await takenAmong(db, [slug], except), msg('代稱'))
	} else {
		const base = slugFromText(title) || slugFromUrl(url)
		const taken = await takenForBases(db, [base], except)
		const pick = { slug: uniqueSlug(base, taken) }
		await settleSlugs(db, [pick], taken, except)
		slug = pick.slug
	}
	const unchanged = active?.slug === slug
	const everywhere = [inDraft, inPublished].every((link) => !link || link.slug === slug)
	if (active && unchanged && everywhere) return { row: active, draftUpdatedAt: page.draftUpdatedAt }

	const now = Date.now()
	const next: LinkRow = row
		? { ...row, slug, url, status: 'active', updatedAt: now }
		: { ...blankLink(now), id: itemId, slug, url, title: title || slug, kind: 'bio', pageId, startsAt: inDraft?.startsAt ?? null, expiresAt: inDraft?.endsAt ?? null, updatedAt: now }
	const withSlug = (content: PageContent): PageContent => {
		const copy = structuredClone(content)
		for (const link of linkItems(copy)) if (link.id === itemId) link.slug = slug
		return copy
	}
	const draft = withSlug(page.draft)
	const published = page.published && withSlug(page.published)
	// A longer slug must not take a draft past what can be saved again.
	if (JSON.stringify(draft).length > JSON.stringify(page.draft).length) refuseTooLarge(draft)
	const draftUpdatedAt = Math.max(now, page.draftUpdatedAt + 1)

	// A button that hides its address points at the old slug until the page's copy is rewritten.
	const home = Boolean(inPublished) && settings.home === pageId
	await dropCopies(env, inPublished ? [page.handle] : [], active && !unchanged ? [active.slug] : [], { home })
	const saved = await db
		.prepare('UPDATE pages SET draft = ?1, published = ?2, draft_updated_at = ?3 WHERE id = ?4 AND draft_updated_at = ?5')
		.bind(JSON.stringify(draft), published && JSON.stringify(published), draftUpdatedAt, pageId, page.draftUpdatedAt)
		.run()
	if (!saved.meta.changes) throw draftChanged()
	await upsertLinkStatement(db, next).run()
	forgetPublicNames()
	// The slug it moved away from gets no copy below.
	if (active && !unchanged) await dropAgain(env, [active.slug])
	const snapshot = inPublished ? await snapshotOf(db, { ...page, draft, published, draftUpdatedAt }, settings) : null
	await putCopies([putLinkRecord(env, slug, toLinkRecord(next)), snapshot ? putSnapshot(env, snapshot) : null, home ? writeSite(env, settings) : null])
	return { row: next, draftUpdatedAt }
}

export async function updateLink(env: Env, id: string, patch: LinkPatch): Promise<LinkRow> {
	const db = env.DB
	let row = await getLink(db, id)
	if (!row) throw new ApiError(404, 'not-found', msg('找不到這個短網址'))
	const ownedByPage = (['url', 'title', 'status', 'startsAt', 'expiresAt'] as const).some((key) => patch[key] !== undefined)
	if (row.kind === 'bio' && ownedByPage) {
		throw new ApiError(400, 'bio-link', msg('頁面連結的網址、標題、開放時間和到期日，請到「內容」修改後發布'))
	}
	if (row.kind === 'bio' && row.pageId && patch.slug !== undefined) {
		row = (await setPageLinkSlug(env, row.pageId, id, { slug: patch.slug })).row
		patch = { ...patch, slug: undefined }
	}

	const settings = await loadSettings(db)
	const next: LinkRow = { ...row, updatedAt: Date.now() }
	if (patch.url !== undefined) {
		const url = patch.url.trim()
		if (!isHttpUrl(url)) throw new ApiError(400, 'invalid', msg('網址要以 http:// 或 https:// 開頭'))
		next.url = url
	}
	if (patch.title !== undefined) next.title = patch.title.trim().slice(0, 80)
	if (patch.slug !== undefined) {
		const slug = normalizeSlug(patch.slug)
		if (slug !== row.slug) {
			assertNameFree(slug, await takenAmong(db, [slug], { linkId: id }), msg('代稱'))
			next.slug = slug
		}
	}
	if (patch.startsAt !== undefined) next.startsAt = patch.startsAt
	if (patch.expiresAt !== undefined) next.expiresAt = patch.expiresAt
	if (next.startsAt && next.expiresAt && next.expiresAt <= next.startsAt) {
		throw new ApiError(400, 'invalid', msg('到期日要晚於開放時間'))
	}
	if (patch.password !== undefined) next.passwordHash = patch.password ? await hashLinkPassword(patch.password) : null
	if (patch.utm) {
		if (patch.utm.source !== undefined) next.utmSource = cleanUtm(patch.utm.source)
		if (patch.utm.medium !== undefined) next.utmMedium = cleanUtm(patch.utm.medium)
		if (patch.utm.campaign !== undefined) next.utmCampaign = cleanUtm(patch.utm.campaign)
		if (patch.utm.content !== undefined) next.utmContent = cleanUtm(patch.utm.content)
	}
	if (patch.status !== undefined) next.status = patch.status
	if (patch.iosUrl !== undefined) next.iosUrl = optionalUrl(patch.iosUrl, msg('iPhone／iPad 的導向網址'))
	if (patch.androidUrl !== undefined) next.androidUrl = optionalUrl(patch.androidUrl, msg('Android 的導向網址'))
	if (patch.lineExternal !== undefined) next.lineExternal = patch.lineExternal
	if (patch.inAppPrompt !== undefined) next.inAppPrompt = patch.inAppPrompt
	if (patch.qr !== undefined) next.qr = patch.qr

	const routingChanged = JSON.stringify(toLinkRecord(row)) !== JSON.stringify(toLinkRecord(next))
	const moved = row.slug !== next.slug
	// A new password or an archived link must never be left to an old KV copy.
	// A password can't wait for the page's copy either: its button must stop showing the address at once.
	const page = row.pageId && linkNeedsWorker(row) !== linkNeedsWorker(next) ? await getPage(db, row.pageId) : null
	const home = page?.id === settings.home
	if (row.status === 'active' && (routingChanged || moved || next.status !== 'active')) {
		await dropCopies(env, page ? [page.handle] : [], moved ? [row.slug, next.slug] : [row.slug], { home })
	}
	await db.batch([upsertLinkStatement(db, next), ...(patch.password !== undefined ? [clearPasswordTriesStatement(db, id)] : [])])
	// An archived link's slug, and the slug a link moved away from, get no copy below.
	if (row.status === 'active') await dropAgain(env, [...(moved ? [row.slug] : []), ...(next.status !== 'active' ? [row.slug, next.slug] : [])])
	const snapshot = page ? await snapshotOf(db, page, settings) : null
	await putCopies([
		next.status === 'active' && (routingChanged || moved || row.status !== 'active') ? putLinkRecord(env, next.slug, toLinkRecord(next)) : null,
		snapshot ? putSnapshot(env, snapshot) : null,
		snapshot && home ? writeSite(env, settings) : null,
	])
	return next
}
