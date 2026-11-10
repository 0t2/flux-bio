import { useState } from 'react'
import type { Settings } from '../../shared/content'
import { ApiError, request } from '../api'
import { Icon } from '../components/Icon'
import { CopyButton, Dialog, Toggle, toast } from '../components/ui'
import { t, tr } from '../i18n'
import { useApp } from '../state/app'
import '../styles/settings.css'

/**
 * Where public pages load their fonts from: Google Fonts (the default, no
 * quota) or this site (settings.hostFonts: visitors never connect to Google,
 * which matters for visitors in the EU). A site setting, saved at once; the
 * Worker copies or drops the fonts of published pages when it changes.
 */
export function FontHosting() {
	const app = useApp()
	const on = app.settings.hostFonts
	const [busy, setBusy] = useState(false)
	// Where the switch is going: copying the fonts can take a few seconds.
	const [going, setGoing] = useState<boolean | null>(null)
	const [help, setHelp] = useState(false)
	const tip = t('如果有歐盟（GDPR）等重視隱私地區的訪客，可以打開：訪客不會連到 Google。')

	async function save(hostFonts: boolean) {
		if (busy) return
		setBusy(true)
		setGoing(hostFonts)
		try {
			const { settings } = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { hostFonts } })
			app.setSettings(settings)
			toast(hostFonts ? t('已改成從你的網站載入字型，已發布的頁面也一起更新了') : t('已改回從 Google 載入字型'))
		} catch (error) {
			toast(error instanceof ApiError ? error.message : t('儲存失敗，請稍後再試'))
		} finally {
			setBusy(false)
			setGoing(null)
		}
	}

	return (
		<div className="font-hosting">
			<div className="section-row">
				<div>
					<p className="font-hosting-title">
						<span id="font-hosting-label">{t('字型從你的網站載入')}</span>
						<button type="button" className="info-tip" data-tip={tip} aria-label={t('說明：{text}', { text: tip })} onClick={() => setHelp(true)}>
							<Icon name="info" size={16} stroke={2} />
						</button>
					</p>
					<p className="hint">
						{busy
							? t('更新中…')
							: on
								? t('訪客不會連到 Google。每位新訪客每載入一個字型檔，會多用一次請求和一次 KV 讀取。')
								: t('目前從 Google Fonts 載入：不佔額度，但訪客的瀏覽器會連到 Google。')}
					</p>
				</div>
				<Toggle on={going ?? on} onChange={(next) => void save(next)} label={t('字型從你的網站載入')} disabled={busy} />
			</div>
			<Dialog open={help} title={t('字型與隱私')} onClose={() => setHelp(false)}>
				<FontHelp origin={app.origin} />
			</Dialog>
		</div>
	)
}

function FontHelp({ origin }: { origin: string }) {
	const prompt = t(
		'幫我的 FluxBio 網站（{site}）換字型。先看 {site}/llms.txt 裡的 Fonts 說明，推薦兩三套適合我頁面的 Google Fonts 字型，講清楚會多用多少額度，我說好了再設定、發布。',
		{ site: origin },
	)
	return (
		<div className="font-help">
			<h3>{t('兩種載入方式')}</h3>
			<ul>
				<li>
					{tr('{name}：不佔你的 Cloudflare 額度。訪客的瀏覽器會向 Google 下載字型，Google 因此會收到訪客的 IP 位址。', {
						name: <b>{t('從 Google Fonts（預設）')}</b>,
					})}
				</li>
				<li>
					{tr(
						'{name}：發布時只把頁面用到的字複製到你的網站，訪客不會連到 Google。每位新訪客每載入一個字型檔，多用一次請求和一次 KV 讀取（免費方案每天各 10 萬次）；頁面內容改了再發布，會多幾次寫入。',
						{ name: <b>{t('從你的網站')}</b> },
					)}
				</li>
			</ul>
			<h3>{t('歐盟的訪客')}</h3>
			<p>{t('德國法院在 2022 年判決：網站沒經同意就讓訪客從 Google 載入字型，違反 GDPR。如果你有歐盟的訪客，建議打開。')}</p>
			<h3>{t('想用其他字型？')}</h3>
			<p>{t('每個主題都有自己的字型。想換成 Google Fonts 的其他字型，把這段話複製給你的 AI。')}</p>
			<div className="set-command">
				<code className="set-wrap">{prompt}</code>
				<CopyButton text={prompt} />
			</div>
		</div>
	)
}
