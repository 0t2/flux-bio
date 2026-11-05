import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useLocation } from 'wouter'
import { STARTER_LABELS, starterPreview, type StarterId } from '../../shared/starters'
import { visibleItems } from '../../templates/render'
import { PhonePreview } from '../components/PhonePreview'
import { PublishHistory } from '../components/PublishHistory'
import { PageKind } from '../editors/CustomPage'
import { LinkTabs } from '../components/ui'
import { msg, t } from '../i18n'
import { usePage } from '../state/page'
import { appearanceSummary, AppearancePanel } from './AppearancePage'
import { LinksPanel } from './LinksPage'

const TABS = [
	{ href: '/', label: msg('內容') },
	{ href: '/appearance', label: msg('外觀') },
]

/** Editing a page, all in one place: the tabs change the left side while the preview stays put. */
export function EditorPage() {
	const [location] = useLocation()
	const page = usePage()
	const { draft } = page
	// Kept here so the item being edited is still open after a look at another tab.
	const [selected, setSelected] = useState<string | null>(null)
	const column = useRef<HTMLDivElement>(null)
	useTabScroll(location, column)
	// A template being looked at in the empty page; the draft stays as it is until one is used.
	const [trial, setTrial] = useState<StarterId | null>(null)
	const kind = draft.custom?.kind ?? 'links'
	// Someone's own HTML comes from the server, so the phone reloads it each time it has been saved.
	const [saves, setSaves] = useState(0)
	const saved = page.saveStatus === 'saved'
	useEffect(() => {
		if (saved) setSaves((count) => count + 1)
	}, [saved, draft.custom])
	const shown = useMemo(() => (trial ? starterPreview(trial, draft.profile.name, t) : draft), [trial, draft])

	const tabs = kind === 'links' ? TABS : TABS.slice(0, 1)
	const hiddenCount = draft.items.length - visibleItems(draft, undefined, { unfinished: true }).length
	const summary = trial
		? t(STARTER_LABELS[trial].label)
		: location === '/' ? (hiddenCount > 0 ? t('另有 {count} 項未顯示', { count: hiddenCount }) : t('全部項目都已顯示')) : appearanceSummary(draft.appearance)

	return (
		<div className="editor-grid">
			<div className="editor-col" ref={column}>
				<div className="editor-head">
					<h1 className="editor-title">{draft.profile.name.trim() || page.handle}</h1>
					{page.publishedAt && <PublishHistory />}
				</div>
				<div className="editor-tabs">
					<LinkTabs label={t('頁面分頁')} items={tabs.map((tab) => ({ ...tab, label: t(tab.label) }))} />
				</div>
				{(location === '/' || kind !== 'links') && <PageKind />}
				{location === '/' && kind === 'links' && <LinksPanel selected={selected} onSelect={setSelected} onTrial={setTrial} />}
				{location === '/appearance' && kind === 'links' && <AppearancePanel />}
			</div>
			<PhonePreview content={shown} summary={kind === 'html' ? t('自訂 HTML') : kind === 'redirect' ? t('轉址') : summary} frameSrc={kind === 'html' ? `/api/pages/${page.id}/preview?v=${saves}` : undefined} />
		</div>
	)
}

/** Each tab keeps its own scroll position, so coming back finds the edit where it was left. */
function useTabScroll(tab: string, inside: RefObject<HTMLElement | null>) {
	const positions = useRef(new Map<string, number>())
	const current = useRef(tab)
	const scroller = () => {
		const main = inside.current?.closest('.main')
		// Phones scroll the whole document instead of the page area.
		return main && getComputedStyle(main).overflowY === 'auto' ? main : document.documentElement
	}
	useEffect(() => {
		const remember = () => positions.current.set(current.current, scroller().scrollTop)
		window.addEventListener('scroll', remember, { capture: true, passive: true })
		return () => window.removeEventListener('scroll', remember, { capture: true })
	}, [])
	useLayoutEffect(() => {
		current.current = tab
		scroller().scrollTop = positions.current.get(tab) ?? 0
	}, [tab])
}
