import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { PageSummary, Role, SiteJson, StateResponse } from '../../shared/api'
import { pageDisplayUrl, type Settings } from '../../shared/content'
import { request } from '../api'

/**
 * Everything the dashboard shares across pages: the deployment's settings,
 * the list of bio pages, and which one is being edited. The page itself
 * lives in PageProvider (state/page.tsx).
 */
interface AppStore {
	version: string
	/** Where visitors reach this deployment: the custom domain, or the address the dashboard is open at. */
	origin: string
	host: string
	role: Role
	settings: Settings
	setSettings: (settings: Settings) => void
	pages: PageSummary[]
	/** The other sites this Worker holds, and this one: empty when it is the only one. Each has its own dashboard, at its own address. */
	sites: SiteJson[]
	/** Reloads the page list (names, counts, publish state). */
	refresh: () => Promise<void>
	/** Changes one page's line in the list to what the dashboard has just been told, with no request. */
	patchPage: (id: string, patch: Partial<PageSummary>) => void
	currentId: string | null
	current: PageSummary | null
	selectPage: (id: string) => void
	/** Public URL of a page: "/" for the home page. */
	pageUrl: (page: Pick<PageSummary, 'handle' | 'id'>) => string
	/** e.g. "links.example.com/mei". */
	pageDisplay: (page: Pick<PageSummary, 'handle' | 'id'>) => string
	analytics: boolean
}

const AppContext = createContext<AppStore | null>(null)

export function useApp(): AppStore {
	const store = useContext(AppContext)
	if (!store) throw new Error('useApp() must be used inside <AppProvider>')
	return store
}

const CURRENT_KEY = 'fluxbio:page'

function readStored(): string | null {
	try {
		return localStorage.getItem(CURRENT_KEY)
	} catch {
		return null
	}
}

function pickCurrent(pages: PageSummary[], settings: Settings, wanted: string | null): string | null {
	return (
		pages.find((page) => page.id === wanted)?.id ??
		pages.find((page) => page.id === settings.home)?.id ??
		pages[0]?.id ??
		null
	)
}

export function AppProvider({ initial, children }: { initial: StateResponse; children: ReactNode }) {
	const [state, setState] = useState(initial)
	const [currentId, setCurrentId] = useState(() => pickCurrent(initial.pages, initial.settings, readStored()))

	const refresh = useCallback(async () => {
		const next = await request<StateResponse>('/state')
		setState(next)
		setCurrentId((id) => pickCurrent(next.pages, next.settings, id))
	}, [])

	const selectPage = useCallback((id: string) => {
		setCurrentId(id)
		try {
			localStorage.setItem(CURRENT_KEY, id)
		} catch {
			// Private mode: the choice just isn't remembered.
		}
	}, [])

	const patchPage = useCallback((id: string, patch: Partial<PageSummary>) => {
		setState((previous) => ({ ...previous, pages: previous.pages.map((page) => (page.id === id ? { ...page, ...patch } : page)) }))
	}, [])

	const setSettings = useCallback((settings: Settings) => setState((previous) => ({ ...previous, settings })), [])

	const store = useMemo<AppStore>(() => {
		const host = new URL(state.origin).host
		const isHome = (page: Pick<PageSummary, 'id'>) => state.settings.home === page.id
		return {
			version: state.version,
			origin: state.origin,
			host,
			role: state.role,
			settings: state.settings,
			setSettings,
			pages: state.pages,
			sites: state.sites ?? [],
			refresh,
			patchPage,
			currentId,
			current: state.pages.find((page) => page.id === currentId) ?? null,
			selectPage,
			pageUrl: (page) => (isHome(page) ? `${state.origin}/` : `${state.origin}/${encodeURIComponent(page.handle)}`),
			pageDisplay: (page) => pageDisplayUrl(host, { handle: page.handle, home: isHome(page) }),
			analytics: state.analytics,
		}
	}, [state, currentId, refresh, patchPage, selectPage, setSettings])

	return <AppContext.Provider value={store}>{children}</AppContext.Provider>
}
