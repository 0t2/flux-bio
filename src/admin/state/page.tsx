import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LinkJson, PageJson, PageSummary, PublishResponse, ShortLinkResponse } from '../../shared/api'
import { linkItems, type PageContent } from '../../shared/content'
import type { Problem } from '../../shared/validate'
import { ApiError, request, requestIfNewer } from '../api'
import { Loading } from '../components/Loading'
import { toast } from '../components/ui'
import { t } from '../i18n'
import { refreshShareImage, shareImageIsStale } from '../lib/ogImage'
import { useApp } from './app'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

/** The bio page being edited: its draft, autosave and publishing. */
interface PageStore {
	id: string
	handle: string
	/** Served at "/". */
	home: boolean
	/** e.g. "links.example.com/mei". */
	displayUrl: string
	publicUrl: string
	draft: PageContent
	published: PageContent | null
	publishedAt: number | null
	/** Edit a copy of the draft; it is saved automatically shortly after. */
	update: (mutate: (draft: PageContent) => void) => void
	saveStatus: SaveStatus
	/** The draft differs from what visitors see. */
	dirty: boolean
	publishing: boolean
	publish: () => Promise<boolean>
	publishError: string | null
	problems: Problem[]
	clearProblems: () => void
	/** Changes the page's address; throws ApiError when the name is taken. */
	rename: (handle: string) => Promise<void>
	/** Gives a link its short link now, or a new slug, live at once; throws ApiError when the name is taken. */
	shortLink: (itemId: string, slug?: string) => Promise<LinkJson>
	/** The draft changed somewhere else while this copy had edits of its own: the owner picks one. */
	conflict: boolean
	/** Puts the question off; the next save asks again. */
	dismissConflict: () => void
	/** Drops this copy's edits. */
	loadLatest: () => Promise<void>
	/** Saves this copy's edits over the other one. */
	overwriteLatest: () => Promise<void>
	/** Puts a published version in the draft; throws ApiError if it can't. */
	restoreVersion: (versionId: string) => Promise<void>
}

const PageContext = createContext<PageStore | null>(null)

export function usePage(): PageStore {
	const store = useContext(PageContext)
	if (!store) throw new Error('usePage() must be used inside <PageProvider>')
	return store
}

/** The page being edited, or null where there is none: nothing loads one while pages are off. */
export function useOptionalPage(): PageStore | null {
	return useContext(PageContext)
}

const AUTOSAVE_DELAY = 700

/** A page's line in the list, as far as its content decides it: what the Worker would work out, without asking it. */
function summaryOf(content: PageContent): Pick<PageSummary, 'name' | 'avatar' | 'theme' | 'kind' | 'items' | 'links'> {
	return {
		name: content.profile.name,
		avatar: content.profile.avatar,
		theme: content.appearance.theme,
		kind: content.custom?.kind ?? 'links',
		items: content.items.length,
		links: linkItems(content).filter((link) => link.url.trim()).length,
	}
}

/** Loads the page the dashboard is set to and remounts the editor when it changes. */
export function CurrentPage({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
	const app = useApp()
	const [page, setPage] = useState<PageJson | null>(null)
	const [error, setError] = useState<string | null>(null)
	const id = app.currentId

	useEffect(() => {
		if (!id) return
		let cancelled = false
		setPage((current) => (current?.id === id ? current : null))
		request<{ page: PageJson }>(`/pages/${id}`)
			.then((result) => !cancelled && setPage(result.page))
			.catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : t('讀取頁面失敗')))
		return () => {
			cancelled = true
		}
	}, [id])

	if (!id) return <>{fallback}</>
	if (error) {
		return (
			<div className="banner" role="alert">
				{error}
			</div>
		)
	}
	if (!page || page.id !== id) return <Loading inline />
	return (
		<PageProvider key={page.id} initial={page}>
			{children}
		</PageProvider>
	)
}

function PageProvider({ initial, children }: { initial: PageJson; children: ReactNode }) {
	const app = useApp()
	const [draft, setDraft] = useState(initial.draft)
	const [published, setPublished] = useState(initial.published)
	const [publishedAt, setPublishedAt] = useState(initial.publishedAt)
	const [handle, setHandle] = useState(initial.handle)
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
	const [publishing, setPublishing] = useState(false)
	const [publishError, setPublishError] = useState<string | null>(null)
	const [problems, setProblems] = useState<Problem[]>([])
	const [conflict, setConflict] = useState(false)
	// Editors hold some values of their own, so a draft from elsewhere starts them afresh.
	const [revision, setRevision] = useState(0)

	const id = initial.id
	// The version of the draft this copy is based on, sent with every save.
	const version = useRef(initial.draftUpdatedAt)
	const inConflict = useRef(false)
	const publishingRef = useRef(false)
	const latest = useRef(draft)
	latest.current = draft
	const statusRef = useRef(saveStatus)
	statusRef.current = saveStatus
	const savedJson = useRef(JSON.stringify(initial.draft))
	const timer = useRef(0)
	const queue = useRef<Promise<boolean>>(Promise.resolve(true))

	/** Saves the latest draft; resolves to false if saving failed. */
	const save = useCallback((): Promise<boolean> => {
		window.clearTimeout(timer.current)
		queue.current = queue.current.then(async () => {
			const snapshot = latest.current
			const json = JSON.stringify(snapshot)
			if (json === savedJson.current) {
				setSaveStatus('saved')
				return true
			}
			if (inConflict.current) {
				setConflict(true)
				setSaveStatus('error')
				return false
			}
			setSaveStatus('saving')
			try {
				const saved = await request<{ draftUpdatedAt: number }>(`/pages/${id}/draft`, {
					method: 'PUT',
					json: snapshot,
					headers: { 'if-match': String(version.current) },
				})
				version.current = saved.draftUpdatedAt
				savedJson.current = json
				setSaveStatus(JSON.stringify(latest.current) === json ? 'saved' : 'pending')
				return true
			} catch (error) {
				if (error instanceof ApiError && error.code === 'draft-changed') {
					inConflict.current = true
					setConflict(true)
				}
				setSaveStatus('error')
				return false
			}
		})
		return queue.current
	}, [id])

	const schedule = useCallback(() => {
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => void save(), AUTOSAVE_DELAY)
	}, [save])

	const update = useCallback(
		(mutate: (draft: PageContent) => void) => {
			setDraft((previous) => {
				const next = structuredClone(previous)
				mutate(next)
				latest.current = next
				return next
			})
			setSaveStatus('pending')
			schedule()
		},
		[schedule],
	)

	/** Takes the page as it is on the server, in place of whatever this copy has. */
	const adopt = useCallback((page: PageJson) => {
		window.clearTimeout(timer.current)
		version.current = page.draftUpdatedAt
		latest.current = page.draft
		savedJson.current = JSON.stringify(page.draft)
		inConflict.current = false
		setConflict(false)
		setDraft(page.draft)
		setPublished(page.published)
		setPublishedAt(page.publishedAt)
		setHandle(page.handle)
		setSaveStatus('saved')
		setRevision((current) => current + 1)
	}, [])

	const readLatest = useCallback(async () => (await request<{ page: PageJson }>(`/pages/${id}`)).page, [id])
	/** The page, if its draft has moved on from the one this copy is based on; null, and nearly free, when it hasn't. */
	const readIfNewer = useCallback(async () => (await requestIfNewer<{ page: PageJson }>(`/pages/${id}`, version.current))?.page ?? null, [id])

	const shortLink = useCallback(
		async (itemId: string, slug?: string) => {
			// The Worker reads the link from the saved draft, so it has to be there first.
			if (!(await save())) throw new Error('The draft was not saved')
			const done = queue.current.then(async () => {
				const result = await request<ShortLinkResponse>(`/pages/${id}/links/${encodeURIComponent(itemId)}/short`, {
					method: 'PUT',
					json: slug === undefined ? {} : { slug },
					headers: { 'if-match': String(version.current) },
				})
				const withSlug = (content: PageContent): PageContent => {
					const copy = structuredClone(content)
					for (const link of linkItems(copy)) if (link.id === itemId) link.slug = result.link.slug
					return copy
				}
				version.current = result.draftUpdatedAt
				savedJson.current = JSON.stringify(withSlug(JSON.parse(savedJson.current) as PageContent))
				setDraft((current) => {
					const next = withSlug(current)
					latest.current = next
					return next
				})
				setPublished((current) => current && withSlug(current))
				return result.link
			})
			queue.current = done.then(
				() => true,
				() => true,
			)
			return done
		},
		[id, save],
	)

	const home = app.settings.home === id
	const displayUrl = app.pageDisplay({ id, handle })

	const publish = useCallback(async (): Promise<boolean> => {
		publishingRef.current = true
		setPublishing(true)
		setPublishError(null)
		setProblems([])
		try {
			// With no edits here and a newer draft there, this screen hasn't shown what would go live. Publishing
			// says which draft it means, so the Worker refuses then (see the catch below). But a share card drawn
			// first would count as an edit of its own, saved over the newer draft, so that case looks beforehand.
			if (statusRef.current === 'saved' && shareImageIsStale(latest.current, displayUrl)) {
				const fresh = await readIfNewer()
				if (fresh && fresh.draftUpdatedAt > version.current) {
					adopt(fresh)
					setPublishError(t('這個頁面剛被改過，已載入最新版本。確認後再發布一次。'))
					return false
				}
			}
			// The automatic share card is drawn here in the browser and uploaded with the page.
			try {
				const withCard = await refreshShareImage(latest.current, displayUrl)
				if (withCard) {
					latest.current = withCard
					setDraft(withCard)
				}
			} catch {
				// Publishing still works without a fresh card; the old one (or the avatar) is used.
			}
			if (!(await save())) {
				setPublishError(t('草稿還沒儲存成功，請稍後再試一次'))
				return false
			}
			const before = JSON.stringify(latest.current)
			const result = await request<PublishResponse>(`/pages/${id}/publish`, { method: 'POST', headers: { 'if-match': String(version.current) } })
			version.current = result.draftUpdatedAt
			setPublished(result.content)
			setPublishedAt(result.publishedAt)
			const unchanged = JSON.stringify(latest.current) === before
			if (unchanged) {
				// The server filled in short link slugs; take its version as-is.
				savedJson.current = JSON.stringify(result.content)
				latest.current = result.content
				setDraft(result.content)
			} else {
				// Edits arrived while publishing: keep them, but adopt the new slugs.
				const slugs = new Map(linkItems(result.content).map((link) => [link.id, link.slug]))
				setDraft((current) => {
					const next = structuredClone(current)
					for (const link of linkItems(next)) {
						const slug = slugs.get(link.id)
						if (slug && !link.slug.trim()) link.slug = slug
					}
					return next
				})
				schedule()
			}
			// The answer has everything the page's line in the list shows, so the list isn't read again.
			app.patchPage(id, {
				...summaryOf(result.content),
				publishedAt: result.publishedAt,
				draftUpdatedAt: result.draftUpdatedAt,
				dirty: !unchanged,
				untranslated: Object.values(result.untranslated).reduce((sum, texts) => sum + texts.length, 0),
			})
			return true
		} catch (error) {
			if (error instanceof ApiError && error.code === 'draft-changed') {
				// Everything here was saved just before, so nothing is lost by taking the newer draft.
				adopt(await readLatest())
				setPublishError(t('這個頁面剛被改過，已載入最新版本。確認後再發布一次。'))
			} else if (error instanceof ApiError) {
				setPublishError(error.message)
				setProblems(error.problems)
			} else {
				setPublishError(t('發布失敗，請稍後再試'))
			}
			return false
		} finally {
			publishingRef.current = false
			setPublishing(false)
		}
	}, [adopt, app, displayUrl, id, readIfNewer, readLatest, save, schedule])

	const loadLatest = useCallback(async () => {
		adopt(await readLatest())
		void app.refresh().catch(() => {})
	}, [adopt, app, readLatest])

	const overwriteLatest = useCallback(async () => {
		version.current = (await readLatest()).draftUpdatedAt
		inConflict.current = false
		setConflict(false)
		await save()
	}, [readLatest, save])

	const restoreVersion = useCallback(
		async (versionId: string) => {
			if (!(await save())) throw new ApiError(409, 'draft-changed', t('草稿還沒儲存成功，請稍後再試一次'))
			await request(`/pages/${id}/versions/${encodeURIComponent(versionId)}/restore`, { method: 'POST', headers: { 'if-match': String(version.current) } })
			adopt(await readLatest())
		},
		[adopt, id, readLatest, save],
	)

	// Coming back to the dashboard, say from a chat with the owner's AI: show what it did.
	useEffect(() => {
		let lookedAt = 0
		const look = async () => {
			if (Date.now() - lookedAt < 5000 || statusRef.current !== 'saved' || inConflict.current || publishingRef.current) return
			lookedAt = Date.now()
			try {
				const fresh = await readIfNewer()
				// An edit started meanwhile finds out for itself when it saves.
				if (!fresh || fresh.draftUpdatedAt <= version.current || statusRef.current !== 'saved' || publishingRef.current) return
				adopt(fresh)
				toast(t('這個頁面剛被改過，已載入最新版本'))
				void app.refresh().catch(() => {})
			} catch {
				// Offline for a moment: the next save or look will tell.
			}
		}
		window.addEventListener('focus', look)
		return () => window.removeEventListener('focus', look)
	}, [adopt, app, readIfNewer])

	const rename = useCallback(
		async (next: string) => {
			const result = await request<{ page: PageJson }>(`/pages/${id}`, { method: 'PATCH', json: { handle: next } })
			setHandle(result.page.handle)
			app.patchPage(id, { handle: result.page.handle })
		},
		[app, id],
	)

	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (statusRef.current !== 'saved') event.preventDefault()
		}
		window.addEventListener('beforeunload', warn)
		return () => {
			window.removeEventListener('beforeunload', warn)
			// Switching to another page: don't lose the last keystrokes.
			if (statusRef.current !== 'saved') void save()
		}
	}, [save])

	const dirty = useMemo(() => !published || JSON.stringify(draft) !== JSON.stringify(published), [draft, published])

	const store: PageStore = {
		id,
		handle,
		home,
		displayUrl,
		publicUrl: app.pageUrl({ id, handle }),
		draft,
		published,
		publishedAt,
		update,
		saveStatus,
		dirty,
		publishing,
		publish,
		publishError,
		problems,
		clearProblems: () => {
			setProblems([])
			setPublishError(null)
		},
		rename,
		shortLink,
		conflict,
		dismissConflict: () => setConflict(false),
		loadLatest,
		overwriteLatest,
		restoreVersion,
	}
	return (
		<PageContext.Provider value={store}>
			<Fragment key={revision}>{children}</Fragment>
		</PageContext.Provider>
	)
}
