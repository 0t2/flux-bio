import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearch } from 'wouter'
import type { AuthInfo } from '../../shared/api'
import { ApiError, request } from '../api'
import { Icon, Logo } from '../components/Icon'
import { LanguageSelect } from '../components/LanguageSelect'
import { t } from '../i18n'
import { CopyButton } from '../components/ui'
import '../styles/library.css'

// Prompts for the new value without echoing it, so it stays out of the shell history.
const RESET_COMMAND = 'pnpm exec cf workers secrets update ADMIN_PASSWORD --worker flux-bio --type secret_text'

/** Where to go after signing in: a path inside the dashboard, never another site ("//evil.example"). */
function nextPath(search: string): string {
	const next = new URLSearchParams(search).get('next') ?? ''
	const inside = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
	return inside && !next.startsWith('/login') ? next : '/'
}

export function LoginPage() {
	const [, navigate] = useLocation()
	const search = useSearch()
	const [info, setInfo] = useState<AuthInfo | null>(null)
	const [password, setPassword] = useState('')
	const [show, setShow] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const input = useRef<HTMLInputElement>(null)

	useEffect(() => {
		let cancelled = false
		request<AuthInfo>('/auth/info')
			.then((result) => !cancelled && setInfo(result))
			.catch(() => {
				// Signing in still works without it; there's just no setup hint.
			})
		return () => {
			cancelled = true
		}
	}, [])

	async function submit(event: FormEvent) {
		event.preventDefault()
		if (!password) {
			setError(t('請先輸入密碼。'))
			input.current?.focus()
			return
		}
		setBusy(true)
		setError(null)
		try {
			await request('/auth/login', { method: 'POST', json: { password } })
			navigate(nextPath(search), { replace: true })
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('登入失敗，請稍後再試'))
			setBusy(false)
		}
	}

	return (
		<div className="login lib-login">
			<header className="lib-login-head">
				<span className="lib-brand">
					<Logo size={28} />
					<strong>FluxBio</strong>
				</span>
				<span className="lib-head-actions">
					<LanguageSelect />
					<a className="lib-home-link" href="/">
						{t('回到首頁')}
					</a>
				</span>
			</header>
			<main className="lib-login-main">
				<div className="login-card">
					<h1>{t('登入後台')}</h1>
					<p>{t('輸入部署時在 Cloudflare 設定的後台密碼。')}</p>

					{info?.setup && (
						<div className="banner" role="alert">
							{t(info.setup)}
						</div>
					)}

					<form className="lib-form" onSubmit={submit} noValidate>
						<div className="lib-field">
							<label htmlFor="admin-password">{t('密碼')}</label>
							<div className={error ? 'lib-password invalid' : 'lib-password'}>
								<input
									ref={input}
									id="admin-password"
									name="password"
									type={show ? 'text' : 'password'}
									autoComplete="current-password"
									autoCapitalize="none"
									spellCheck={false}
									aria-invalid={Boolean(error)}
									aria-describedby={error ? 'login-error' : undefined}
									value={password}
									onChange={(event) => {
										setPassword(event.target.value)
										setError(null)
									}}
								/>
								<button type="button" className="lib-eye" aria-label={show ? t('隱藏密碼') : t('顯示密碼')} aria-pressed={show} onClick={() => setShow(!show)}>
									<Icon name={show ? 'eyeOff' : 'eye'} size={20} />
								</button>
							</div>
							{error && (
								<p id="login-error" className="lib-field-error" role="alert">
									<Icon name="alert" size={16} stroke={2} />
									{error}
								</p>
							)}
						</div>
						<button type="submit" className="btn primary lib-login-submit" disabled={busy}>
							{busy ? t('登入中…') : t('登入')}
						</button>
					</form>

					<details className="lib-forgot">
						<summary>{t('忘記密碼？')}</summary>
						<div className="lib-forgot-body">
							<p>{t('密碼存在 Cloudflare Worker 的環境變數裡，沒辦法寄信重設。到 Cloudflare 後台改，或在專案資料夾執行：')}</p>
							<div className="lib-cmd">
								<code>
									<span aria-hidden="true">$ </span>
									{RESET_COMMAND}
								</code>
								<CopyButton text={RESET_COMMAND} className="btn square lib-compact" />
							</div>
							<p>{t('接著輸入新密碼，至少 12 個字元。如果 Worker 改過名字，把指令裡的 flux-bio 換掉。')}</p>
						</div>
					</details>
				</div>
			</main>
		</div>
	)
}
