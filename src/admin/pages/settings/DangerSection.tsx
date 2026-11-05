import { useState } from 'react'
import { request } from '../../api'
import { Dialog } from '../../components/ui'
import { t } from '../../i18n'
import { errorText } from './util'

const CONFIRM_WORD = 'DELETE'

export function DangerSection() {
	const [open, setOpen] = useState(false)
	return (
		<section className="section set-danger" aria-labelledby="set-danger-title">
			<div className="set-danger-row">
				<div>
					<h2 id="set-danger-title" className="section-title">
						{t('清除所有資料')}
					</h2>
					<p className="hint">
						{t('刪除所有頁面、短網址、點擊紀錄、我的主題、設定、API token 和上傳的圖片，刪了就救不回來。要留著的話，先下載備份（備份不含點擊紀錄）。')}
					</p>
				</div>
				<button type="button" className="btn danger" onClick={() => setOpen(true)}>
					{t('清除資料')}
				</button>
			</div>
			<ClearDialog open={open} onClose={() => setOpen(false)} />
		</section>
	)
}

function ClearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const [typed, setTyped] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const ready = typed.trim() === CONFIRM_WORD

	function close() {
		setTyped('')
		setError(null)
		onClose()
	}

	async function clear() {
		if (!ready || busy) return
		setBusy(true)
		setError(null)
		try {
			await request('/data', { method: 'DELETE', json: { confirm: CONFIRM_WORD } })
			// Everything is gone, the in-memory dashboard included: start over at the setup wizard.
			window.location.assign('/admin/setup')
		} catch (caught) {
			setError(errorText(caught, t('清除失敗，請再試一次')))
			setBusy(false)
		}
	}

	return (
		<Dialog
			open={open}
			title={t('清除所有資料？')}
			onClose={close}
			actions={
				<>
					<button type="button" className="btn" onClick={close}>
						{t('取消')}
					</button>
					<button type="button" className="btn danger" disabled={!ready} aria-disabled={busy || undefined} onClick={() => void clear()}>
						{busy ? t('清除中…') : t('永久清除')}
					</button>
				</>
			}
		>
			<p className="set-dialog-text">{t('所有頁面、短網址、點擊紀錄、我的主題、設定、API token 和上傳的圖片都會刪掉，沒辦法復原。後台密碼不變，清完會回到建立第一個頁面的步驟。')}</p>
			<div className="field">
				<label htmlFor="set-clear-word">{t('輸入 {word} 確認', { word: CONFIRM_WORD })}</label>
				<input
					id="set-clear-word"
					className="input mono"
					value={typed}
					autoComplete="off"
					autoCapitalize="characters"
					autoCorrect="off"
					spellCheck={false}
					onChange={(event) => setTyped(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && !event.nativeEvent.isComposing) void clear()
					}}
				/>
			</div>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
		</Dialog>
	)
}
