import { useState } from 'react'
import type { Settings } from '../../../shared/content'
import { request } from '../../api'
import { Dialog, Section, toast, Toggle } from '../../components/ui'
import { t } from '../../i18n'
import { useApp } from '../../state/app'
import { errorText } from './util'

/** Turns bio pages off, for a deployment that is only a link shortener, and says where "/" goes then. */
export function BioSection() {
	const app = useApp()
	const on = app.settings.bio
	const [asking, setAsking] = useState(false)
	const [busy, setBusy] = useState(false)
	// Where the switch is going: it rewrites every published page.
	const [going, setGoing] = useState<boolean | null>(null)
	const [error, setError] = useState<string | null>(null)
	const published = app.pages.filter((page) => page.publishedAt).length
	const [homeUrl, setHomeUrl] = useState(app.settings.homeUrl)

	async function save(bio: boolean) {
		if (busy) return
		setBusy(true)
		setGoing(bio)
		setError(null)
		try {
			const { settings } = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { ...app.settings, bio } })
			setAsking(false)
			setBusy(false)
			setGoing(null)
			// The dashboard rebuilds itself around this: with pages off, no page is loaded.
			app.setSettings(settings)
			toast(bio ? t('頁面功能打開了，已發布的頁面都回來了') : t('頁面功能關閉了，短網址照常轉址'))
		} catch (caught) {
			setError(errorText(caught, t('儲存失敗，請稍後再試')))
			setBusy(false)
			setGoing(null)
		}
	}

	async function saveHome() {
		if (busy) return
		setBusy(true)
		setError(null)
		try {
			const { settings } = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { homeUrl: homeUrl.trim() } })
			app.setSettings(settings)
			toast(t('已儲存'))
		} catch (caught) {
			setError(errorText(caught, t('儲存失敗，請稍後再試')))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Section title={t('頁面功能')}>
			<div className="set-bio-row">
				<div className="set-bio-text">
					<p className="hint">{t('關閉後這裡只做短網址：公開頁面下線，短網址照常轉址。')}</p>
					<p className="hint">{t('不會刪除任何東西，打開後頁面就回來。')}</p>
				</div>
				<Toggle on={going ?? on} label={t('頁面功能')} disabled={busy} onChange={(next) => (next ? void save(true) : setAsking(true))} />
			</div>
			{!on && (
				<>
					<div className="set-home-url">
						<input
							className="input mono"
							type="url"
							dir="ltr"
							placeholder="https://"
							aria-label={t('首頁要轉到哪裡')}
							value={homeUrl}
							onChange={(event) => setHomeUrl(event.target.value)}
						/>
						<button type="button" className="btn" disabled={busy || homeUrl.trim() === app.settings.homeUrl} onClick={() => void saveHome()}>
							{t('儲存')}
						</button>
					</div>
					<p className="hint">{t('首頁要轉到哪裡？留空的話，首頁會說明這裡只提供短網址。')}</p>
				</>
			)}
			{error && !asking && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			<Dialog
				open={asking}
				title={t('關閉頁面功能？')}
				onClose={() => {
					setAsking(false)
					setError(null)
				}}
				actions={
					<>
						<button type="button" className="btn" onClick={() => setAsking(false)}>
							{t('取消')}
						</button>
						<button type="button" className="btn danger" aria-disabled={busy || undefined} onClick={() => void save(false)}>
							{busy ? t('儲存中…') : t('關閉頁面功能')}
						</button>
					</>
				}
			>
				<p className="set-dialog-text">{published ? t('已發布的 {count} 個頁面會馬上下線，訪客打開只會看到找不到。', { count: published }) : t('訪客不會再看到任何頁面。')}</p>
				<p className="set-dialog-text">{t('短網址照常轉址，頁面、草稿和數據都留著，打開就回來。')}</p>
				{error && (
					<p className="form-error" role="alert">
						{error}
					</p>
				)}
			</Dialog>
		</Section>
	)
}
