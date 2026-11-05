import { useEffect, useState, type FormEvent } from 'react'
import type { CreateTokenResponse, TokenJson } from '../../../shared/api'
import { request } from '../../api'
import { ConfirmButton, CopyButton, Section, toast } from '../../components/ui'
import { msg, t } from '../../i18n'
import { relativeTime } from '../../lib/format'
import { errorText } from './util'

const SCOPES: { value: TokenJson['scope']; label: string }[] = [
	{ value: 'full', label: msg('完整權限') },
	{ value: 'links', label: msg('只能建立短網址') },
]
const scopeLabel = (scope: TokenJson['scope']) => SCOPES.find((option) => option.value === scope)?.label ?? scope

export function TokensSection({ onCreated }: { onCreated: (token: string) => void }) {
	const [tokens, setTokens] = useState<TokenJson[] | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [fresh, setFresh] = useState<CreateTokenResponse | null>(null)

	useEffect(() => {
		let cancelled = false
		request<{ tokens: TokenJson[] }>('/tokens')
			.then((result) => !cancelled && setTokens(result.tokens))
			.catch((caught) => !cancelled && setLoadError(errorText(caught, t('讀不到 token 列表，請重新整理再試一次'))))
		return () => {
			cancelled = true
		}
	}, [])

	async function revoke(token: TokenJson) {
		try {
			await request(`/tokens/${encodeURIComponent(token.id)}`, { method: 'DELETE' })
			setTokens((list) => list && list.filter((entry) => entry.id !== token.id))
			setFresh((current) => (current?.info.id === token.id ? null : current))
			toast(t('已撤銷「{name}」', { name: token.name }))
		} catch (caught) {
			toast(errorText(caught, t('撤銷失敗，請再試一次')))
		}
	}

	function created(result: CreateTokenResponse) {
		setTokens((list) => [result.info, ...(list ?? [])])
		setFresh(result)
		onCreated(result.token)
	}

	return (
		<Section title="API token">
			{loadError ? (
				<p className="form-error" role="alert">
					{loadError}
				</p>
			) : (
				<TokenTable tokens={tokens} onRevoke={(token) => void revoke(token)} />
			)}
			<div>
				<CreateToken onCreated={created} />
				{/* Always present, so screen readers announce the new token when it appears. */}
				<div role="status">{fresh && <NewToken token={fresh.token} />}</div>
			</div>
		</Section>
	)
}

function TokenTable({ tokens, onRevoke }: { tokens: TokenJson[] | null; onRevoke: (token: TokenJson) => void }) {
	return (
		<div className="set-table-wrap">
			<table className="set-table">
				<thead>
					<tr>
						<th scope="col">{t('名稱')}</th>
						<th scope="col" className="set-col">
							{t('權限')}
						</th>
						<th scope="col" className="set-col">
							{t('最後使用')}
						</th>
						<th scope="col" className="set-cell-action">
							<span className="sr-only">{t('動作')}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{!tokens ? (
						<tr>
							<td colSpan={4} className="set-empty-cell">
								{t('載入中…')}
							</td>
						</tr>
					) : tokens.length === 0 ? (
						<tr>
							<td colSpan={4} className="set-empty-cell">
								{t('還沒有 token。在下面取個名字就能產生。')}
							</td>
						</tr>
					) : (
						tokens.map((token) => <TokenRow key={token.id} token={token} onRevoke={onRevoke} />)
					)}
				</tbody>
			</table>
		</div>
	)
}

function TokenRow({ token, onRevoke }: { token: TokenJson; onRevoke: (token: TokenJson) => void }) {
	const scope = t(scopeLabel(token.scope))
	const used = token.lastUsedAt ? relativeTime(token.lastUsedAt) : t('還沒用過')
	return (
		<tr>
			<td>
				<span className="set-token-name">{token.name}</span>
				<span className="set-token-mask" aria-hidden="true">
					fbk_••••••••{token.hint}
				</span>
				<span className="sr-only">{t('結尾是 {hint}', { hint: token.hint })}</span>
				{/* Narrow screens hide the two columns below and show them here instead. */}
				<span className="set-token-meta">
					{scope} · <span className="set-nowrap">{t('最後使用：{time}', { time: used })}</span>
				</span>
			</td>
			<td className="set-col">{scope}</td>
			<td className="set-col">{used}</td>
			<td className="set-cell-action">
				<ConfirmButton label={t('撤銷')} confirm={t('確定撤銷？')} className="btn small set-revoke" onConfirm={() => onRevoke(token)} />
			</td>
		</tr>
	)
}

function CreateToken({ onCreated }: { onCreated: (result: CreateTokenResponse) => void }) {
	const [name, setName] = useState('')
	const [scope, setScope] = useState<TokenJson['scope']>('full')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function submit(event: FormEvent) {
		event.preventDefault()
		if (busy) return
		const trimmed = name.trim()
		if (!trimmed) {
			setError(t('先幫 token 取個名字，之後才認得出是哪個工具在用'))
			return
		}
		setBusy(true)
		setError(null)
		try {
			onCreated(await request<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: trimmed, scope } }))
			setName('')
		} catch (caught) {
			setError(errorText(caught, t('產生失敗，請再試一次')))
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			<form className="set-token-form" onSubmit={(event) => void submit(event)}>
				<div className="field">
					<label htmlFor="set-token-name">{t('新 token 的名稱')}</label>
					<input
						id="set-token-name"
						className="input"
						maxLength={40}
						placeholder={t('例如 Claude')}
						value={name}
						onChange={(event) => {
							setName(event.target.value)
							setError(null)
						}}
					/>
				</div>
				<div className="set-scopes" role="group" aria-label={t('權限')}>
					{SCOPES.map((option) => (
						<button key={option.value} type="button" className="set-choice compact" aria-pressed={scope === option.value} onClick={() => setScope(option.value)}>
							{t(option.label)}
						</button>
					))}
				</div>
				<button type="submit" className="btn primary square" aria-disabled={busy || undefined}>
					{busy ? t('產生中…') : t('產生 token')}
				</button>
			</form>
			{scope === 'full' && <p className="hint set-after">{t('完整權限可以改頁面、短網址和所有設定，只給你信任的工具。')}</p>}
			{error && (
				<p className="form-error set-after" role="alert">
					{error}
				</p>
			)}
		</>
	)
}

function NewToken({ token }: { token: string }) {
	return (
		<div className="set-new-token set-after">
			<strong>{t('新的 token：只會顯示這一次，請現在複製起來')}</strong>
			<div className="set-new-token-row">
				<code>{token}</code>
				<CopyButton text={token} className="btn small set-lime" />
			</div>
		</div>
	)
}
