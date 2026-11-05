import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Redirect } from 'wouter'
import type { PageJson } from '../../shared/api'
import { emptyContent, type PageContent, type Settings, type ThemeId } from '../../shared/content'
import { STARTER_IDS, STARTER_LABELS, starterContent, starterPreview, type StarterId } from '../../shared/starters'
import type { IconName } from '../../templates/icons'
import { ApiError, request } from '../api'
import { Icon, Logo } from '../components/Icon'
import { useMedia } from '../components/ui'
import { LanguageSelect } from '../components/LanguageSelect'
import { PhonePreview } from '../components/PhonePreview'
import { language, msg, t, tr } from '../i18n'
import { useApp } from '../state/app'
import '../styles/library.css'
import { ThemeChoices } from '../components/ThemeChoices'

// Getting here means the API answered a signed-in request: the password and the database both work.
const DONE = 2

function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
	} catch {
		return ''
	}
}

export function SetupPage() {
	const app = useApp()
	const [preview, setPreview] = useState<PageContent | null>(null)
	const [use, setUse] = useState<Use>('pages')
	// Wide screens keep the phone beside the steps; narrow ones put it in the form, before the button.
	const narrow = useMedia('(max-width: 1099px)')
	// With pages off there is nothing to set up. Choosing that below lands here.
	if (!app.settings.bio) return <Redirect to="/short-links" replace />
	// Creating the first page fills the page list, which hands over to the dashboard.
	if (app.pages.length > 0) return <Redirect to="/" replace />

	return (
		<div className="lib-setup">
			<header className="lib-setup-head">
				<span className="lib-brand">
					<Logo size={28} />
					<strong>FluxBio</strong>
					<span className="lib-brand-note">{t('首次設定')}</span>
				</span>
				<span className="lib-head-actions">
					<LanguageSelect />
					<span className="lib-progress">{t('{done} / 3 完成', { done: DONE })}</span>
				</span>
			</header>
			<main className="lib-setup-main">
				<div className="lib-setup-body">
				<div className="lib-setup-column">
				<div className="lib-setup-intro">
					<h1>{t('部署成功，再一步就完成')}</h1>
					<p>{t('FluxBio 交給 AI 管理：網域、時區、備份這些設定，到「設定」接上 AI 之後用說的就好。')}</p>
				</div>
				<ol className="lib-steps">
					<Step icon="check" done title={t('後台密碼')} state={t('已完成')}>
						{tr('已讀到 {secret}，之後用它登入後台。', { secret: <code>ADMIN_PASSWORD</code> })}
					</Step>
					<Step icon="check" done title={t('資料庫')} state={t('已完成')}>
						{t('已連上 D1 資料庫，資料表也建好了。')}
					</Step>
					<li className="lib-step active">
						<span className="lib-step-icon next" aria-hidden="true">
							3
						</span>
						<div className="lib-step-body">
							<h2 id="setup-use">{t('你想怎麼用？')}</h2>
							<div className="starter-row lib-setup-starts setup-use" role="group" aria-labelledby="setup-use">
								{USES.map((entry) => (
									<button key={entry.id} type="button" className="option starter" aria-pressed={use === entry.id} onClick={() => setUse(entry.id)}>
										<strong>{t(entry.label)}</strong>
										<small>{t(entry.hint)}</small>
									</button>
								))}
							</div>
							{use === 'pages' ? (
								<>
									<p>{t('取個網址、名字，挑一個主題，之後都能再改。')}</p>
									<FirstPageForm onPreview={setPreview} inlinePreview={narrow} />
								</>
							) : (
								<>
									<p>{t('不做公開頁面，首頁也不放內容。之後想要頁面，到「設定」打開就好。')}</p>
									<ShortLinksOnly />
								</>
							)}
						</div>
					</li>
				</ol>
				</div>
				{!narrow && use === 'pages' && preview && <PhonePreview content={preview} locale={language()} />}
				</div>
			</main>
		</div>
	)
}

function Step({ icon, done, title, state, children }: { icon: IconName; done?: boolean; title: string; state: string; children: ReactNode }) {
	return (
		<li className="lib-step">
			<span className={done ? 'lib-step-icon done' : 'lib-step-icon'} aria-hidden="true">
				<Icon name={icon} size={18} stroke={done ? 2.4 : 2} />
			</span>
			<div className="lib-step-body">
				<h2>
					{title}
					<span className={done ? 'lib-step-state done' : 'lib-step-state'}>{state}</span>
				</h2>
				<p>{children}</p>
			</div>
		</li>
	)
}

type Use = 'pages' | 'links'

const USES: { id: Use; label: string; hint: string }[] = [
	{ id: 'pages', label: msg('頁面加短網址'), hint: msg('做一個連結頁，也能建短網址') },
	{ id: 'links', label: msg('只要短網址'), hint: msg('只有轉址和點擊數據') },
]

/** A new site starts in UTC and English: stats days follow the owner's time zone, built-in text the language of this dashboard. */
function ownerSettings(settings: Settings): Pick<Settings, 'timezone' | 'locale'> {
	const zone = browserTimeZone()
	return { timezone: settings.timezone === 'UTC' && zone ? zone : settings.timezone, locale: language() }
}

function ShortLinksOnly() {
	const app = useApp()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function start() {
		setBusy(true)
		setError(null)
		try {
			const { settings } = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { ...app.settings, ...ownerSettings(app.settings), bio: false } })
			// Pages being off sends the owner on to 短網址.
			app.setSettings(settings)
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('儲存失敗，請稍後再試'))
			setBusy(false)
		}
	}

	return (
		<div className="lib-setup-form">
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			<button type="button" className="btn primary lib-setup-submit" disabled={busy} onClick={() => void start()}>
				{busy ? t('儲存中…') : t('開始用短網址')}
				<Icon name="arrowRight" size={16} stroke={2.4} />
			</button>
		</div>
	)
}

type Start = 'blank' | StarterId

const STARTS: { id: Start; label: string; hint: string }[] = [
	{ id: 'blank', label: msg('空白頁'), hint: msg('從零開始自己排') },
	...STARTER_IDS.map((id) => ({ id, ...STARTER_LABELS[id] })),
]

function FirstPageForm({ onPreview, inlinePreview }: { onPreview: (content: PageContent) => void; inlinePreview: boolean }) {
	const app = useApp()
	const [start, setStart] = useState<Start>('blank')
	const [handle, setHandle] = useState('')
	const [name, setName] = useState('')
	const [theme, setTheme] = useState<ThemeId>('liquid')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// What the page will look like, before anything exists.
	const content = useMemo(() => {
		const shownName = name.trim() || t('我的名字')
		const shown = start === 'blank' ? emptyContent(shownName) : starterPreview(start, shownName, t)
		shown.appearance.theme = theme
		return shown
	}, [start, name, theme])
	useEffect(() => onPreview(content), [content, onPreview])

	function chooseStart(next: Start) {
		setStart(next)
		// A template comes with the theme that suits it; still changeable below.
		if (next !== 'blank') setTheme(starterContent(next, '').appearance.theme)
	}

	async function submit(event: FormEvent) {
		event.preventDefault()
		setBusy(true)
		setError(null)
		let created: { page: PageJson; settings: Settings }
		try {
			created = await request<{ page: PageJson; settings: Settings }>('/pages', {
				method: 'POST',
				json: { handle: handle.trim(), name: name.trim(), theme, ...(start === 'blank' ? {} : { starter: start, locale: language() }) },
			})
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('建立失敗，請稍後再試'))
			setBusy(false)
			return
		}
		// Opening hours follow the owner's time zone too, and the page's built-in text their language.
		// `created.settings` already has the new page as home; keep that.
		await request('/settings', { method: 'PUT', json: { ...created.settings, ...ownerSettings(created.settings) } }).catch(() => {
			// Not worth stopping for: it can be changed on 外觀, or by the owner's AI.
		})
		// The page list now has the new page, which sends the owner on to the dashboard.
		try {
			await app.refresh()
		} catch {
			setError(t('頁面已經建好了，但後台資料沒有讀到，請重新整理這一頁。'))
			setBusy(false)
		}
	}

	return (
		<form className="lib-setup-form" onSubmit={submit} noValidate>
			<div className="lib-setup-fields">
				<div className="field">
					<label htmlFor="setup-handle">{t('網址代稱')}</label>
					<input
						id="setup-handle"
						className="input mono"
						maxLength={64}
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						placeholder={t('例如 mika')}
						value={handle}
						onChange={(event) => setHandle(event.target.value.replace(/\s+/g, ''))}
					/>
				</div>
				<div className="field">
					<label htmlFor="setup-name">{t('顯示名稱')}</label>
					<input id="setup-name" className="input" maxLength={60} placeholder={t('你的名字或品牌')} value={name} onChange={(event) => setName(event.target.value)} />
				</div>
			</div>
			<div className="field">
				<span className="label" id="setup-start">
					{t('範本')}
				</span>
				<div className="starter-row lib-setup-starts" role="group" aria-labelledby="setup-start">
					{STARTS.map((entry) => (
						<button key={entry.id} type="button" className="option starter" aria-pressed={start === entry.id} onClick={() => chooseStart(entry.id)}>
							<strong>{t(entry.label)}</strong>
							<small>{t(entry.hint)}</small>
						</button>
					))}
				</div>
			</div>
			<div className="field">
				<span className="label" id="setup-theme">
					{t('主題')}
				</span>
				<ThemeChoices value={theme} onChange={setTheme} labelledBy="setup-theme" />
			</div>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{inlinePreview && (
				<div className="starter-phone">
					<PhonePreview content={content} locale={language()} inline />
				</div>
			)}
			<button type="submit" className="btn primary lib-setup-submit" disabled={busy}>
				{busy ? t('建立中…') : t('建立頁面')}
				<Icon name="arrowRight" size={16} stroke={2.4} />
			</button>
		</form>
	)
}
