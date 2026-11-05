import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import type { IconName } from '../../templates/icons'
import { initials } from '../../templates/render'
import { request } from '../api'
import { msg, t } from '../i18n'
import { useApp } from '../state/app'
import { useOptionalPage, usePage, type SaveStatus } from '../state/page'
import { Icon, Logo } from './Icon'
import { ShareDraft } from './ShareDraft'
import { LanguageSelect } from './LanguageSelect'
import { CopyButton, Dialog, Popover, toast } from './ui'

const NAV: { href: string; label: string; icon: IconName; pagesOnly?: true; match: (path: string) => boolean }[] = [
	{ href: '/', label: msg('[nav]頁面'), icon: 'edit', pagesOnly: true, match: (path) => EDITING.includes(path) || path === '/pages' },
	{ href: '/short-links', label: msg('短網址'), icon: 'shortlink', match: (path) => path.startsWith('/short-links') },
	{ href: '/stats', label: msg('數據'), icon: 'chart', match: (path) => path.startsWith('/stats') },
	{ href: '/settings', label: msg('設定'), icon: 'sliders', match: (path) => path.startsWith('/settings') },
]

/** Pages where you edit the draft get the save state and the publish button. */
const EDITING = ['/', '/appearance']

const SAVE_TEXT: Record<SaveStatus, string> = {
	saved: msg('已自動儲存'),
	pending: msg('有尚未儲存的變更'),
	saving: msg('儲存中…'),
	error: msg('儲存失敗，會再試一次'),
}

const NAV_KEY = 'fluxbio:nav'

/** Whether the side menu is down to its icons, remembered in this browser. */
function useFoldedNav(): [boolean, () => void] {
	const [folded, setFolded] = useState(() => {
		try {
			return localStorage.getItem(NAV_KEY) === 'folded'
		} catch {
			return false
		}
	})
	const toggle = () => {
		const next = !folded
		setFolded(next)
		try {
			if (next) localStorage.setItem(NAV_KEY, 'folded')
			else localStorage.removeItem(NAV_KEY)
		} catch {
			// Private windows can refuse: it just won't be remembered.
		}
	}
	return [folded, toggle]
}

export function Shell({ children }: { children: ReactNode }) {
	const [location, navigate] = useLocation()
	const [folded, toggleNav] = useFoldedNav()
	const navLabel = folded ? t('展開選單') : t('收合選單')
	// None while pages are off: the top bar then has only the logo, and the sidebar no 頁面.
	const page = useOptionalPage()
	const editing = EDITING.includes(location)

	return (
		<div className={folded ? 'shell nav-folded' : 'shell'}>
			<header className="topbar">
				<div className="topbar-start">
					<Link href={page ? '/' : '/short-links'} className="brand" aria-label={t('FluxBio 後台首頁')}>
						<Logo />
						<span>FluxBio</span>
					</Link>
					<button type="button" className="icon-btn nav-toggle" aria-expanded={!folded} aria-controls="side-nav" aria-label={navLabel} title={navLabel} onClick={toggleNav}>
						<Icon name="sidebar" />
					</button>
				</div>
				{page && (
					<>
						<PageSwitcher />
						<span className="spacer" />
						{editing ? (
							<>
								<span className={page.saveStatus === 'error' ? 'save-state error' : 'save-state'} role="status">
									{page.saveStatus === 'saved' && <Icon name="check" size={16} stroke={2} />}
									<span className="save-text">{t(SAVE_TEXT[page.saveStatus])}</span>
								</span>
								<a className="btn preview-btn" href={`/api/pages/${page.id}/preview`} target="_blank" rel="noopener noreferrer" aria-label={t('預覽草稿')}>
									<Icon name="eye" size={18} />
									<span>{t('預覽')}</span>
								</a>
								<ShareDraft />
								<PublishButton />
								<DraftConflict />
							</>
						) : (
							<a className="btn" href={page.publicUrl} target="_blank" rel="noopener noreferrer" aria-label={t('查看公開頁面')}>
								<Icon name="arrowUpRight" size={16} stroke={2} />
								<span>{t('查看公開頁面')}</span>
							</a>
						)}
					</>
				)}
			</header>

			<div className="layout">
				<nav className="sidenav" id="side-nav" aria-label={t('後台選單')}>
					{NAV.filter((item) => page || !item.pagesOnly).map((item) => (
						<Link key={item.href} href={item.href} className="nav-link" title={folded ? t(item.label) : undefined} aria-current={item.match(location) ? 'page' : undefined}>
							<Icon name={item.icon} />
							<span>{t(item.label)}</span>
						</Link>
					))}
					<LanguageSelect className="nav-language" />
					<button
						type="button"
						className="nav-link nav-bottom"
						title={folded ? t('登出') : undefined}
						onClick={async () => {
							await request('/auth/logout', { method: 'POST' }).catch(() => {})
							navigate('/login')
						}}
					>
						<Icon name="logout" />
						<span>{t('登出')}</span>
					</button>
				</nav>
				<main className="main">
					{page?.publishError && (
						<div className="banner" role="alert">
							<div className="section-row">
								<strong>{page.publishError}</strong>
								<button type="button" className="icon-btn" aria-label={t('關閉提示')} onClick={page.clearProblems}>
									<Icon name="close" size={16} />
								</button>
							</div>
							{page.problems.length > 1 && (
								<ul>
									{page.problems.map((problem) => (
										<li key={problem.path + problem.message}>{problem.message}</li>
									))}
								</ul>
							)}
						</div>
					)}
					{children}
				</main>
			</div>
		</div>
	)
}

/** Asks which copy stays when the draft changed somewhere else while this one had edits of its own. */
function DraftConflict() {
	const page = usePage()
	return (
		<Dialog
			open={page.conflict}
			title={t('這個頁面在別的地方改過了')}
			onClose={page.dismissConflict}
			actions={
				<>
					<button type="button" className="btn" onClick={() => void page.overwriteLatest()}>
						{t('用我的版本覆蓋')}
					</button>
					<button type="button" className="btn primary" onClick={() => void page.loadLatest()}>
						{t('載入最新版本')}
					</button>
				</>
			}
		>
			<p>{t('可能是你的 AI 或另一個分頁。你剛才的修改還沒存，請選一個版本留下。')}</p>
		</Dialog>
	)
}

function PublishButton() {
	const page = usePage()
	const label = page.publishing ? t('發布中…') : !page.publishedAt ? t('發布') : page.dirty ? t('發布變更') : t('已發布')
	return (
		<button
			type="button"
			className="btn publish"
			disabled={page.publishing || (!page.dirty && Boolean(page.publishedAt))}
			onClick={async () => {
				if (await page.publish()) toast(t('已發布，訪客現在看到的是新版本'))
			}}
		>
			{label}
		</button>
	)
}

function PageSwitcher() {
	const app = useApp()
	const page = usePage()
	const [, navigate] = useLocation()
	return (
		<Popover
			label={t('切換頁面')}
			button={({ open, toggle, id }) => (
				<div className="url-pill">
					<span className={page.publishedAt ? 'dot' : 'dot off'} aria-hidden="true" />
					<button
						type="button"
						className="switch-btn"
						aria-expanded={open}
						aria-controls={id}
						aria-label={t('切換頁面，目前是 {url}', { url: page.displayUrl })}
						onClick={toggle}
					>
						<span className="switch-url">{page.displayUrl}</span>
						<Icon name="chevronDown" size={16} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
					</button>
					<CopyButton text={page.publicUrl} label="" done="" className="icon-btn copy-url" ariaLabel={t('複製網址')} />
				</div>
			)}
		>
			{(close) => (
				<div className="switcher">
					<ul className="switcher-list">
						{app.pages.map((entry) => (
							<li key={entry.id}>
								<button
									type="button"
									className="switcher-item"
									aria-current={entry.id === page.id ? 'true' : undefined}
									onClick={() => {
										app.selectPage(entry.id)
										close()
									}}
								>
									<span className="switcher-avatar" aria-hidden="true">
										{entry.avatar ? <img src={`/media/${entry.avatar}`} alt="" /> : initials(entry.name) || '?'}
									</span>
									<span className="switcher-text">
										<strong>{entry.name || entry.handle}</strong>
										<span className="mono">{app.pageDisplay(entry)}</span>
									</span>
									{entry.id === page.id ? <span className="tag">{t('正在編輯')}</span> : !entry.publishedAt ? <span className="tag muted">{t('未發布')}</span> : null}
								</button>
							</li>
						))}
					</ul>
					<div className="switcher-actions">
						<button
							type="button"
							className="btn small"
							onClick={() => {
								close()
								navigate('/pages')
							}}
						>
							<Icon name="layers" size={16} />
							{t('管理所有頁面')}
						</button>
						<button
							type="button"
							className="btn small"
							disabled={app.pages.length >= app.limits.pages}
							onClick={() => {
								close()
								navigate('/pages?new=1')
							}}
						>
							<Icon name="plus" size={16} />
							{t('新增頁面')}
						</button>
						<a className="btn small" href={page.publicUrl} target="_blank" rel="noopener noreferrer" onClick={close}>
							<Icon name="arrowUpRight" size={16} />
							{t('查看公開頁面')}
						</a>
					</div>
				</div>
			)}
		</Popover>
	)
}
