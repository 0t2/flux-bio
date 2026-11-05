import { lazy, Suspense, useEffect, useState } from 'react'
import { Redirect, Route, Router, Switch, useLocation } from 'wouter'
import type { StateResponse } from '../shared/api'
import { ApiError, request, setUnauthorizedHandler } from './api'
import { Loading } from './components/Loading'
import { Shell } from './components/Shell'
import { ToastHost } from './components/ui'
import { t, useLanguage } from './i18n'
import { EditorPage } from './pages/EditorPage'
import { LoginPage } from './pages/LoginPage'
import { SetupPage } from './pages/SetupPage'
import { ShortenPage } from './pages/ShortenPage'
import { ShortLinksPage } from './pages/ShortLinksPage'
import { AppProvider, useApp } from './state/app'
import { CurrentPage } from './state/page'

// Pages people open less often load on demand, so the editor starts faster.
const LinkStatsPage = lazy(() => import('./pages/LinkStatsPage').then((m) => ({ default: m.LinkStatsPage })))
const PagesPage = lazy(() => import('./pages/PagesPage').then((m) => ({ default: m.PagesPage })))
const QrPage = lazy(() => import('./pages/QrPage').then((m) => ({ default: m.QrPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const ShortLinksStats = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.ShortLinksStats })))

export function App() {
	// A new language re-mounts everything, so text computed while rendering is redone in it.
	const language = useLanguage()
	return (
		<Router base="/admin" key={language}>
			<Switch>
				<Route path="/login">
					<LoginPage />
				</Route>
				<Route>
					<Dashboard />
				</Route>
			</Switch>
		</Router>
	)
}

function Dashboard() {
	const [location, navigate] = useLocation()
	const [state, setState] = useState<StateResponse | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		// Keep the query too, e.g. /shorten?url=… from the bookmarklet. Worked out once: a 401 calls this twice, and by the
		// second time the address is already the login page's, which would go inside its own "next".
		const next = encodeURIComponent(location + window.location.search)
		const toLogin = () => navigate(`/login?next=${next}`, { replace: true })
		setUnauthorizedHandler(toLogin)
		request<StateResponse>('/state')
			.then(setState)
			.catch((caught) => {
				if (caught instanceof ApiError && caught.status === 401) toLogin()
				else setError(caught instanceof Error ? caught.message : t('載入失敗'))
			})
		// Only on first load; later navigation keeps the state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	if (error) {
		return (
			<div className="loading">
				<p className="form-error" role="alert" style={{ maxWidth: 520 }}>
					{error}
				</p>
			</div>
		)
	}
	if (!state) return <Loading />

	return (
		<AppProvider initial={state}>
			<Switch>
				<Route path="/setup">
					<SetupPage />
				</Route>
				{/* Bookmarklets installed from v0.2's settings still open this page. */}
				<Route path="/shorten">
					<ShortenPage />
				</Route>
				<Route>
					<Main />
				</Route>
			</Switch>
			{/* Up here so a message outlives the bio switch, which replaces everything in Main. */}
			<ToastHost />
		</AppProvider>
	)
}

/** The dashboard behind the sidebar. With pages off, no page is loaded, so none has to exist. */
function Main() {
	const { settings } = useApp()
	if (!settings.bio) {
		return (
			<Shell>
				<Routes pages={false} />
			</Shell>
		)
	}
	return (
		// A fresh install has no pages yet: the setup wizard creates the first one.
		<CurrentPage fallback={<Redirect to="/setup" />}>
			<Shell>
				<Routes pages />
			</Shell>
		</CurrentPage>
	)
}

function Routes({ pages }: { pages: boolean }) {
	return (
		<Suspense fallback={<Loading inline />}>
			<Switch>
				{/* One route, so switching tabs keeps the preview and the item being edited. */}
				{pages && (
					<Route path={/^\/(appearance)?$/}>
						<EditorPage />
					</Route>
				)}
				{/* The theme library's address, in a tab left open. */}
				{pages && (
					<Route path="/appearance/themes">
						<Redirect to="/appearance" replace />
					</Route>
				)}
				<Route path="/short-links">
					<ShortLinksPage />
				</Route>
				{/* Bulk creation moved to the owner's AI. */}
				<Route path="/short-links/bulk">
					<Redirect to="/short-links" replace />
				</Route>
				<Route path="/short-links/:id/stats">{(params) => <LinkStatsPage id={params.id} />}</Route>
				<Route path="/short-links/:id/qr">{(params) => <QrPage id={params.id} />}</Route>
				<Route path="/stats">{pages ? <StatsPage /> : <ShortLinksStats />}</Route>
				<Route path="/settings">
					<SettingsPage />
				</Route>
				{/* v0.2 had tabs here. */}
				<Route path="/settings/:tab">
					<Redirect to="/settings" replace />
				</Route>
				{pages && (
					<Route path="/pages">
						<PagesPage />
					</Route>
				)}
				{/* With pages off, this is also where every page route ends up. */}
				<Route>
					<Redirect to={pages ? '/' : '/short-links'} replace />
				</Route>
			</Switch>
		</Suspense>
	)
}
