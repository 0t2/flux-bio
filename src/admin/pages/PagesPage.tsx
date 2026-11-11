import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearch } from 'wouter'
import type { PageJson, PageSummary } from '../../shared/api'
import { defaultAppearance, type Settings, type ThemeId } from '../../shared/content'
import { normalizeSlug, uniqueSlug } from '../../shared/slug'
import { STARTER_IDS, STARTER_LABELS, starterContent, type StarterId } from '../../shared/starters'
import { resolveAppearance, THEMES } from '../../templates/themes'
import { ApiError, request } from '../api'
import { Icon } from '../components/Icon'
import { ConfirmButton, Dialog, Popover, toast } from '../components/ui'
import { language, msg, t, tr } from '../i18n'
import { formatNumber } from '../lib/format'
import { useApp } from '../state/app'
import '../styles/library.css'
import { MiniBio } from '../components/MiniBio'
import { ThemeChoices } from '../components/ThemeChoices'

type Start = 'blank' | StarterId | 'copy'

const STARTS: { id: Start; label: string; hint: string }[] = [
	{ id: 'blank', label: msg('空白頁'), hint: msg('從零開始自己排') },
	...STARTER_IDS.map((id) => ({ id, ...STARTER_LABELS[id] })),
	{ id: 'copy', label: msg('複製現有頁面'), hint: msg('內容和外觀都複製一份') },
]

/** Each card draws the page in miniature, so a long list is drawn a bit at a time. */
const PAGE_CARDS = 60

const titleOf = (page: PageSummary): string => page.name.trim() || page.handle

function statusOf(page: PageSummary): { label: string; className: string } {
	if (!page.publishedAt) return { label: t('草稿'), className: 'tag muted' }
	if (page.dirty) return { label: t('有未發布的變更'), className: 'tag lib-amber' }
	return { label: t('公開'), className: 'tag' }
}

/** Copies a page under the first free handle: "mei-2", "mei-3"… */
async function copyPage(page: PageSummary, pages: PageSummary[]): Promise<PageJson> {
	const taken = new Set(pages.map((entry) => normalizeSlug(entry.handle)))
	for (;;) {
		const handle = uniqueSlug(normalizeSlug(page.handle), taken)
		try {
			const result = await request<{ page: PageJson }>('/pages', { method: 'POST', json: { handle, name: page.name, copyFrom: page.id } })
			return result.page
		} catch (caught) {
			// Short links share these names and aren't listed here, so a free-looking one can still be taken.
			if (!(caught instanceof ApiError && caught.code === 'slug-taken') || taken.size > pages.length + 8) throw caught
			taken.add(handle)
		}
	}
}

export function PagesPage() {
	const app = useApp()
	const [, navigate] = useLocation()
	const search = useSearch()
	const [creating, setCreating] = useState(false)
	const [busyId, setBusyId] = useState<string | null>(null)
	const [shown, setShown] = useState(PAGE_CARDS)

	// "新增頁面" in the page switcher comes here as /pages?new=1.
	useEffect(() => {
		if (new URLSearchParams(search).get('new') !== '1') return
		setCreating(true)
		navigate('/pages', { replace: true })
	}, [search, navigate])

	async function run(page: PageSummary, action: () => Promise<string>) {
		if (busyId) return
		setBusyId(page.id)
		try {
			toast(await action())
		} catch (caught) {
			toast(caught instanceof ApiError ? caught.message : t('操作失敗，請稍後再試'))
		} finally {
			setBusyId(null)
		}
	}

	const duplicate = (page: PageSummary) =>
		run(page, async () => {
			const copy = await copyPage(page, app.pages)
			await app.refresh()
			return t('已複製成 {host}/{handle}', { host: app.host, handle: copy.handle })
		})

	const toggleHome = (page: PageSummary) =>
		run(page, async () => {
			const home = app.settings.home === page.id ? '' : page.id
			const result = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { home } })
			app.setSettings(result.settings)
			await app.refresh()
			return home ? t('已設為首頁：{host}', { host: app.host }) : t('已從首頁移除')
		})

	const remove = (page: PageSummary) =>
		run(page, async () => {
			await request(`/pages/${page.id}`, { method: 'DELETE' })
			await app.refresh()
			return t('已刪除「{name}」', { name: titleOf(page) })
		})

	return (
		<>
			<div className="page-head">
				<div>
					<h1>{t('頁面')}</h1>
					<p>{t('一個 FluxBio 可以管理多個頁面，每頁有自己的網址、主題和數據；短網址則是所有頁面共用。')}</p>
				</div>
				<button type="button" className="btn primary" onClick={() => setCreating(true)}>
					<Icon name="plus" size={16} stroke={2.4} />
					{t('新增頁面')}
				</button>
			</div>

			<div className="lib-pages">
				{app.pages.slice(0, shown).map((page) => (
					<PageCard
						key={page.id}
						page={page}
						busy={busyId === page.id}
						onEdit={() => {
							app.selectPage(page.id)
							navigate('/')
						}}
						onCopy={() => void duplicate(page)}
						onHome={() => void toggleHome(page)}
						onDelete={app.pages.length > 1 ? () => void remove(page) : undefined}
					/>
				))}
				<button type="button" className="lib-add-card" onClick={() => setCreating(true)}>
					<span className="lib-add-icon" aria-hidden="true">
						<Icon name="plus" size={22} stroke={2.2} />
					</span>
					<strong>{t('新增頁面')}</strong>
					<small>{t('從空白開始，或複製現有頁面')}</small>
				</button>
			</div>
			{app.pages.length > shown && (
				<div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
					<button type="button" className="btn" onClick={() => setShown((count) => count + PAGE_CARDS)}>
						{t('載入更多')}
					</button>
				</div>
			)}

			<Dialog open={creating} title={t('新增頁面')} onClose={() => setCreating(false)}>
				<NewPageForm onDone={() => setCreating(false)} />
			</Dialog>
		</>
	)
}

function PageCard({
	page,
	busy,
	onEdit,
	onCopy,
	onHome,
	onDelete,
}: {
	page: PageSummary
	busy: boolean
	onEdit: () => void
	onCopy: () => void
	onHome: () => void
	/** Missing for the last page, which can't be deleted. */
	onDelete?: () => void
}) {
	const app = useApp()
	const moreButton = useRef<HTMLButtonElement>(null)
	const title = titleOf(page)
	const theme = THEMES[page.theme]
	const status = statusOf(page)
	const editing = page.id === app.currentId
	// From settings rather than page.home, so it changes together with the address right after 設為首頁.
	const home = app.settings.home === page.id
	// The summary only knows the base theme, so the preview uses its own colors.
	const look = resolveAppearance({ ...defaultAppearance(), theme: page.theme })
	// The page's name for screen readers, after 編輯, 開啟公開頁 and 預覽草稿.
	const named = <span className="sr-only">{t('「{text}」', { text: title })}</span>

	/** Closing the menu removes the item that had focus; hand it back to the menu's button. */
	const pick = (close: () => void, action: () => void) => () => {
		close()
		moreButton.current?.focus()
		action()
	}

	return (
		<article className={editing ? 'lib-page-card current' : 'lib-page-card'} aria-labelledby={`page-${page.id}`} aria-busy={busy}>
			{page.kind === 'links' ? (
				<MiniBio look={look} name={title} avatar={page.avatar} links={Array.from({ length: Math.min(page.items, 4) }, () => '')} size="medium" />
			) : (
				<div className="lib-page-custom">{page.kind === 'html' ? t('自訂 HTML') : t('轉址')}</div>
			)}
			<div className="lib-page-head">
				<div className="lib-theme-title">
					<h2 id={`page-${page.id}`}>{title}</h2>
					<span className={status.className}>{status.label}</span>
					{home && <span className="tag cyan">{t('首頁')}</span>}
					{editing && <span className="lib-outline-tag">{t('正在編輯')}</span>}
				</div>
				<p className="lib-page-url">{app.pageDisplay(page)}</p>
			</div>
			<dl className="lib-facts">
				{page.kind === 'links' && (
					<>
						<dt>{t('主題')}</dt>
						<dd>
							{/* The English name is a subtitle; in English it would repeat the label. */}
							{language() === 'en' ? theme.en : `${t(theme.label)} ${theme.en}`}
						</dd>
						<dt>{t('連結數')}</dt>
						<dd>{t('{count} 個', { count: page.links })}</dd>
					</>
				)}
				<dt>{t('近 7 天點擊')}</dt>
				<dd>{page.publishedAt ? formatNumber(page.clicks7d) : '—'}</dd>
			</dl>
			<div className="lib-actions">
				<button type="button" className="btn primary square lib-compact" onClick={onEdit}>
					{tr('編輯{title}', { title: named })}
				</button>
				{page.publishedAt ? (
					<a className="btn square lib-compact" href={app.pageUrl(page)} target="_blank" rel="noopener noreferrer">
						<Icon name="arrowUpRight" size={16} stroke={2} />
						{tr('開啟公開頁面{title}', { title: named })}
					</a>
				) : (
					// Never published: the public address has nothing to show yet.
					<a className="btn square lib-compact" href={`/api/pages/${page.id}/preview`} target="_blank" rel="noopener noreferrer">
						<Icon name="eye" size={16} />
						{tr('預覽草稿{title}', { title: named })}
					</a>
				)}
				<div className="lib-more">
					<Popover
						label={t('更多動作：{title}', { title })}
						align="end"
						button={({ open, toggle, id }) => (
							<button
								ref={moreButton}
								type="button"
								className="btn square lib-icon"
								aria-label={t('更多動作：{title}', { title })}
								aria-expanded={open}
								aria-controls={id}
								onClick={toggle}
							>
								<Icon name="more" size={20} stroke={2.4} />
							</button>
						)}
					>
						{(close) => (
							<div className="lib-menu">
								<button type="button" className="lib-menu-item" onClick={pick(close, onCopy)}>
									<Icon name="copy" size={16} />
									{t('複製')}
								</button>
								<button type="button" className="lib-menu-item" onClick={pick(close, onHome)}>
									<Icon name="home" size={16} />
									{home ? t('不放在首頁') : t('設為首頁')}
								</button>
								{onDelete && <ConfirmButton label={t('刪除')} confirm={t('確定刪除')} icon="trash" className="lib-menu-item" onConfirm={pick(close, onDelete)} />}
							</div>
						)}
					</Popover>
				</div>
			</div>
		</article>
	)
}

function NewPageForm({ onDone }: { onDone: () => void }) {
	const app = useApp()
	const [, navigate] = useLocation()
	const [handle, setHandle] = useState('')
	const [name, setName] = useState('')
	const [start, setStart] = useState<Start>('blank')
	const [copyFrom, setCopyFrom] = useState(app.currentId ?? app.pages[0]?.id ?? '')
	const [theme, setTheme] = useState<ThemeId>('liquid')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const handleInput = useRef<HTMLInputElement>(null)
	const source = app.pages.find((page) => page.id === copyFrom)

	// The form mounts just before <Dialog> calls showModal(); focus once it is open.
	useEffect(() => {
		const timer = window.setTimeout(() => handleInput.current?.focus())
		return () => window.clearTimeout(timer)
	}, [])

	function pick(next: Start) {
		setStart(next)
		// A starter comes with the theme that suits it; show that one, still changeable.
		if (next !== 'blank' && next !== 'copy') setTheme(starterContent(next, '').appearance.theme)
	}

	async function submit(event: FormEvent) {
		event.preventDefault()
		setBusy(true)
		setError(null)
		const base = { handle: handle.trim(), name: name.trim() }
		const body = start === 'copy' ? { ...base, copyFrom } : start === 'blank' ? { ...base, theme } : { ...base, theme, starter: start, locale: language() }
		let page: PageJson
		try {
			page = (await request<{ page: PageJson }>('/pages', { method: 'POST', json: body })).page
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('建立失敗，請稍後再試'))
			setBusy(false)
			return
		}
		// The editor loads the page by id, so it opens even if the list didn't reload.
		await app.refresh().catch(() => {})
		app.selectPage(page.id)
		navigate('/')
	}

	return (
		<form className="lib-form" onSubmit={submit} noValidate>
			<div className="field">
				<label htmlFor="new-page-handle">{t('網址代稱')}</label>
				<div className="prefixed">
					<span>{app.host}/</span>
					<input
						ref={handleInput}
						id="new-page-handle"
						maxLength={64}
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						placeholder={t('例如 shop')}
						value={handle}
						onChange={(event) => setHandle(event.target.value.replace(/\s+/g, ''))}
					/>
				</div>
			</div>
			<div className="field">
				<label htmlFor="new-page-name">{t('顯示名稱')}</label>
				<input
					id="new-page-name"
					className="input"
					maxLength={60}
					placeholder={start === 'copy' && source ? titleOf(source) : t('你的名字或品牌')}
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
			</div>
			<div className="field">
				<span className="label" id="new-page-start">
					{t('從哪裡開始')}
				</span>
				<div className="lib-choices" role="group" aria-labelledby="new-page-start">
					{STARTS.map((choice) => (
						<button key={choice.id} type="button" className="option lib-choice" aria-pressed={start === choice.id} onClick={() => pick(choice.id)}>
							<strong>{t(choice.label)}</strong>
							<small>{t(choice.hint)}</small>
						</button>
					))}
				</div>
			</div>
			{start === 'copy' ? (
				<div className="field">
					<label htmlFor="new-page-source">{t('要複製的頁面')}</label>
					<select id="new-page-source" className="select" value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)}>
						{app.pages.map((page) => (
							<option key={page.id} value={page.id}>
								{t('{name}（{url}）', { name: titleOf(page), url: app.pageDisplay(page) })}
							</option>
						))}
					</select>
				</div>
			) : (
				<div className="field">
					<span className="label" id="new-page-theme">
						{t('主題')}
					</span>
					<ThemeChoices value={theme} onChange={setTheme} labelledBy="new-page-theme" />
				</div>
			)}
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			<div className="dialog-actions">
				<button type="button" className="btn" onClick={onDone}>
					{t('取消')}
				</button>
				<button type="submit" className="btn primary" disabled={busy}>
					{busy ? t('建立中…') : t('建立頁面')}
				</button>
			</div>
		</form>
	)
}
