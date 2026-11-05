import { useState, type FormEvent } from 'react'
import { Link, useSearch } from 'wouter'
import type { CreateLinkResponse } from '../../shared/api'
import { isHttpUrl } from '../../shared/content'
import { ApiError, request } from '../api'
import { Logo } from '../components/Icon'
import { CopyButton } from '../components/ui'
import { t } from '../i18n'
import { copyText } from '../lib/format'
import { useApp } from '../state/app'

/**
 * Where the 縮短這頁 bookmarklet lands, with ?url= filled in. It waits for the
 * 縮短 button: any site can send a signed-in owner here, and shortening on
 * arrival would let that site put its own address on the owner's domain.
 */
export function ShortenPage() {
	const app = useApp()
	const search = useSearch()
	const initial = new URLSearchParams(search).get('url') ?? ''
	const [url, setUrl] = useState(initial)
	const [slug, setSlug] = useState('')
	const [short, setShort] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	async function shorten(target: string, wanted?: string) {
		setBusy(true)
		setError(null)
		try {
			const result = await request<CreateLinkResponse>('/links', { method: 'POST', json: { url: target, slug: wanted || undefined } })
			setShort(result.short)
			setCopied(await copyText(result.short))
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('縮短失敗'))
		} finally {
			setBusy(false)
		}
	}

	function submit(event: FormEvent) {
		event.preventDefault()
		void shorten(url, slug)
	}

	return (
		<div className="login">
			<div className="login-card shorten-card">
				<div className="brand">
					<Logo size={30} />
					<span>FluxBio</span>
				</div>
				<h1>{t('縮短這頁')}</h1>
				{short ? (
					<>
						<p className="shorten-result mono" dir="ltr">
							{short}
						</p>
						{copied && <p className="hint">{t('已經複製到剪貼簿，可以直接貼上。')}</p>}
						<div className="row-start">
							<CopyButton text={short} label={t('複製短網址')} className="btn primary square" />
							<Link href="/short-links" className="btn square">
								{t('到後台管理')}
							</Link>
						</div>
					</>
				) : (
					<form className="field-stack" onSubmit={submit}>
						{error && (
							<p className="form-error" role="alert">
								{error}
							</p>
						)}
						<div className="field">
							<label htmlFor="shorten-url">{t('網址')}</label>
							<input id="shorten-url" className="input mono" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} />
						</div>
						<div className="field">
							<label htmlFor="shorten-slug">{t('自訂代稱（選填）')}</label>
							<div className="prefixed">
								<span>{app.host}/</span>
								<input id="shorten-slug" maxLength={64} value={slug} onChange={(event) => setSlug(event.target.value)} />
							</div>
						</div>
						{/* Focused when the bookmarklet filled in the address, so Enter shortens it. */}
						<button type="submit" className="btn primary square" disabled={busy || !url} autoFocus={isHttpUrl(initial)}>
							{busy ? t('縮短中…') : t('縮短')}
						</button>
					</form>
				)}
			</div>
		</div>
	)
}
