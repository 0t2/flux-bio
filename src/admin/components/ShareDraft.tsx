import { useState } from 'react'
import type { PreviewLinkResponse } from '../../shared/api'
import { ApiError, request } from '../api'
import { msg, t } from '../i18n'
import { usePage } from '../state/page'
import { Icon } from './Icon'
import { CopyButton, Dialog, toast } from './ui'

/** How long a link can work; the first is the default. An AI can ask for any length. */
const LENGTHS = [
	{ minutes: 10, label: msg('10 分鐘') },
	{ minutes: 60, label: msg('1 小時') },
	{ minutes: 24 * 60, label: msg('24 小時') },
	{ minutes: 7 * 24 * 60, label: msg('7 天') },
]
const SHORTEST = LENGTHS[0]!.minutes

/**
 * Makes a link that shows the live draft to anyone who has it, without signing
 * in. The expiry is part of the signed link, so another length is another link,
 * and a link already handed out keeps working until its own expiry.
 */
export function ShareDraft() {
	const page = usePage()
	const [url, setUrl] = useState<string | null>(null)
	const [minutes, setMinutes] = useState(SHORTEST)
	const [busy, setBusy] = useState(false)

	async function open(length: number) {
		setBusy(true)
		try {
			setUrl((await request<PreviewLinkResponse>(`/pages/${page.id}/preview-link`, { method: 'POST', json: { minutes: length } })).url)
			setMinutes(length)
		} catch (caught) {
			toast(caught instanceof ApiError ? caught.message : t('連結產生失敗，請稍後再試'))
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			<button type="button" className="btn preview-btn" aria-label={t('分享預覽')} disabled={busy} onClick={() => void open(SHORTEST)}>
				<Icon name="smartphone" size={18} />
				<span>{t('分享預覽')}</span>
			</button>
			<Dialog open={url !== null} title={t('預覽連結')} onClose={() => setUrl(null)}>
				<p className="hint">{t('拿到連結的人不用登入就能看到草稿，你一改，對方的畫面會自己更新。換一個時間會產生新連結，舊的要到期才失效。')}</p>
				<div className="field">
					<label htmlFor="share-length">{t('有效時間')}</label>
					<select id="share-length" className="select" value={minutes} disabled={busy} onChange={(event) => void open(Number(event.target.value))}>
						{LENGTHS.map((length) => (
							<option key={length.minutes} value={length.minutes}>
								{t(length.label)}
							</option>
						))}
					</select>
				</div>
				<div className="share-link">
					<input className="input mono" readOnly aria-label={t('預覽連結')} value={url ?? ''} onFocus={(event) => event.target.select()} />
					{url && <CopyButton text={url} label={t('複製')} done={t('已複製')} />}
				</div>
			</Dialog>
		</>
	)
}
