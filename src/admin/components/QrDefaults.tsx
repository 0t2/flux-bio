import { useRef, useState } from 'react'
import type { Settings } from '../../shared/content'
import { request } from '../api'
import { t } from '../i18n'
import { uploadImage } from '../lib/image'
import { errorText } from '../pages/settings/util'
import { useApp } from '../state/app'
import { Icon } from './Icon'
import { Dialog, toast } from './ui'

/** A button on the short links page that opens the pictures QR codes follow. */
export function QrDefaultsButton() {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button type="button" className="btn small" onClick={() => setOpen(true)}>
				<Icon name="qr" size={16} />
				{t('QR Code 預設圖片')}
			</button>
			<Dialog open={open} title={t('QR Code 預設圖片')} onClose={() => setOpen(false)} wide>
				<QrDefaults />
			</Dialog>
		</>
	)
}

/** The pictures QR codes follow: one for the site, and one for each page, which comes first for that page's links. */
function QrDefaults() {
	const app = useApp()
	const input = useRef<HTMLInputElement>(null)
	const [target, setTarget] = useState<string | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const SITE = '_site'
	// With pages off a page stays listed only while it has a picture to take away.
	const pages = app.pages.filter((page) => app.settings.bio || page.qrLogo)
	const rows = [
		{ id: SITE, name: t('全站'), hint: t('所有短網址沒有其他圖片時，用這張'), media: app.settings.qrLogo || null },
		...pages.map((page) => ({ id: page.id, name: page.name || page.handle, hint: t('頁面上的連結沒有自己的圖片時，用這張'), media: page.qrLogo })),
	]

	async function save(id: string, media: string | null) {
		if (id === SITE) {
			const { settings } = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { qrLogo: media ?? '' } })
			app.setSettings(settings)
		} else {
			await request(`/pages/${id}`, { method: 'PATCH', json: { qrLogo: media } })
			await app.refresh()
		}
	}

	async function run(id: string, work: () => Promise<string>) {
		setBusy(id)
		try {
			toast(await work())
		} catch (caught) {
			toast(errorText(caught, t('儲存失敗，請稍後再試')))
		} finally {
			setBusy(null)
		}
	}

	function onFile(file: File | undefined) {
		const id = target
		if (input.current) input.current.value = ''
		if (!file || !id) return
		void run(id, async () => {
			await save(id, await uploadImage(file, { maxWidth: 512, maxHeight: 512, square: true }))
			return t('已儲存，立即生效')
		})
	}

	return (
		<>
			<p className="hint">{t('沒有另外選圖片的短網址，QR Code 中間會放這裡的圖片，頁面的圖片優先於全站。換圖後，後台看到和下載的都會更新，已經印出來的不會變。')}</p>
			<ul className="qr-defaults" role="list">
				{rows.map((row) => (
					<li key={row.id}>
						<span className="qr-defaults-thumb">{row.media ? <img src={`/media/${encodeURIComponent(row.media)}`} alt="" /> : <Icon name="image" size={18} />}</span>
						<div>
							<strong>{row.name}</strong>
							<p className="hint">{row.hint}</p>
						</div>
						<div className="qr-defaults-actions">
							<button
								type="button"
								className="btn small"
								disabled={busy !== null}
								onClick={() => {
									setTarget(row.id)
									input.current?.click()
								}}
							>
								<Icon name="upload" size={16} />
								{busy === row.id ? t('上傳中…') : row.media ? t('換一張圖片') : t('上傳圖片')}
							</button>
							{row.media && (
								<button
									type="button"
									className="btn small"
									disabled={busy !== null}
									onClick={() =>
										void run(row.id, async () => {
											await save(row.id, null)
											return t('已移除預設圖片')
										})
									}
								>
									{t('移除')}
								</button>
							)}
						</div>
					</li>
				))}
			</ul>
			<input ref={input} type="file" accept="image/*" hidden onChange={(event) => onFile(event.target.files?.[0])} />
		</>
	)
}
