import { useEffect, useState } from 'react'
import type { PageVersionJson } from '../../shared/api'
import { ApiError, request } from '../api'
import { t } from '../i18n'
import { formatDateTime } from '../lib/format'
import { usePage } from '../state/page'
import { ConfirmButton, Dialog, toast } from './ui'
import { Loading } from './Loading'

/** The page's published versions: who published each, and a way back to any of them. */
export function PublishHistory() {
	const page = usePage()
	const [open, setOpen] = useState(false)
	const [versions, setVersions] = useState<PageVersionJson[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		if (!open) return
		let cancelled = false
		setVersions(null)
		setError(null)
		request<{ versions: PageVersionJson[] }>(`/pages/${page.id}/versions`)
			.then((result) => !cancelled && setVersions(result.versions))
			.catch((caught) => !cancelled && setError(caught instanceof ApiError ? caught.message : t('讀取失敗')))
		return () => {
			cancelled = true
		}
	}, [open, page.id])

	async function restore(id: string) {
		setBusy(true)
		setError(null)
		try {
			await page.restoreVersion(id)
			toast(t('已還原成草稿，確認後再發布'))
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('還原失敗，請稍後再試'))
			setBusy(false)
		}
	}

	return (
		<>
			<button type="button" className="btn small" onClick={() => setOpen(true)}>
				{t('發布紀錄')}
			</button>
			<Dialog open={open} title={t('發布紀錄')} onClose={() => setOpen(false)}>
				<p className="history-note">{t('留下最近 {count} 次發布。還原後會先變成草稿，確認沒問題再發布。', { count: 20 })}</p>
				{page.dirty && page.publishedAt ? <p className="history-note">{t('草稿裡還沒發布的修改會被取代。')}</p> : null}
				{error && (
					<div className="banner" role="alert">
						{error}
					</div>
				)}
				{!versions && !error && <Loading inline />}
				{versions?.length === 0 && <p className="history-note">{t('還沒有發布紀錄')}</p>}
				{versions && versions.length > 0 && (
					<ol className="history">
						{versions.map((version) => (
							<li key={version.id}>
								<span className="history-when">
									<b>{formatDateTime(version.publishedAt)}</b>
									{version.by && <span>{version.by === 'owner' ? t('你') : version.tokenName}</span>}
								</span>
								{version.current ? (
									<span className="tag muted">{t('目前版本')}</span>
								) : (
									<ConfirmButton label={t('還原成草稿')} confirm={t('確定還原')} disabled={busy} onConfirm={() => void restore(version.id)} />
								)}
							</li>
						))}
					</ol>
				)}
			</Dialog>
		</>
	)
}
