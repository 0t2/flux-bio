import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Section, toast } from '../../components/ui'
import { t } from '../../i18n'
import { downloadBlob } from '../../lib/format'
import { createBackup } from './backup'
import { errorText } from './util'

/** The whole site as one file, for owners whose AI can't save files on their computer, and for anyone who wants their own copy. */
export function BackupSection() {
	const [progress, setProgress] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	async function download() {
		if (progress !== null) return
		setProgress(t('準備備份…'))
		setError(null)
		setNotice(null)
		try {
			const { file, fileName, missing } = await createBackup((done, total) => {
				if (total) setProgress(t('下載圖片 {done} / {total}…', { done, total }))
			})
			downloadBlob(file, fileName)
			if (missing) setNotice(t('備份下載好了，但有 {count} 張圖片讀不到，檔案裡沒有這些圖片。', { count: missing }))
			else toast(t('備份下載好了'))
		} catch (caught) {
			setError(errorText(caught, t('備份沒有完成，請再試一次')))
		} finally {
			setProgress(null)
		}
	}

	return (
		<Section title={t('備份')}>
			<div className="set-backup-row">
				<div>
					<p className="hint">{t('下載一個檔案，裡面有所有頁面、短網址、我的主題和圖片，不含點擊紀錄和 API token。')}</p>
					<p className="hint">{t('請存在自己的電腦，不要傳給別人。要還原時，把檔案交給 AI。')}</p>
				</div>
				<button type="button" className="btn" aria-disabled={progress !== null || undefined} onClick={() => void download()}>
					<Icon name="download" size={16} />
					{progress ?? t('下載備份')}
				</button>
			</div>
			{notice && (
				<p className="form-error" role="alert">
					{notice}
				</p>
			)}
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
		</Section>
	)
}
