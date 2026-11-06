import { useState } from 'react'
import { useLocation } from 'wouter'
import { request } from '../api'
import { Icon } from '../components/Icon'
import { LanguageSelect } from '../components/LanguageSelect'
import { t } from '../i18n'
import { useApp } from '../state/app'
import { BackupSection } from './settings/BackupSection'
import { BioSection } from './settings/BioSection'
import { ConnectAi } from './settings/ConnectAi'
import { DangerSection } from './settings/DangerSection'
import { StatsDataSection } from './settings/StatsDataSection'
import { UsageSection } from './settings/UsageSection'
import { REPO_URL } from './settings/util'
import '../styles/settings.css'

export function SettingsPage() {
	const app = useApp()
	const [, navigate] = useLocation()
	const [leaving, setLeaving] = useState(false)

	async function logout() {
		if (leaving) return
		setLeaving(true)
		await request('/auth/logout', { method: 'POST' }).catch(() => {})
		navigate('/login')
	}
	return (
		<div className="set-page">
			<div className="page-head">
				<div>
					<h1>{t('設定')}</h1>
					<p>{t('其他設定交給 AI：接上之後，用說的就能改頁面、網域和時區，做短網址、看數據，備份或搬到另一個 FluxBio。')}</p>
				</div>
				{/* Phones hide the sidebar, and its language and 登出 with it. */}
				<span className="mobile-only set-head-actions">
					<LanguageSelect />
					<button type="button" className="btn small" aria-disabled={leaving || undefined} onClick={() => void logout()}>
						<Icon name="logout" size={16} />
						{leaving ? t('登出中…') : t('登出')}
					</button>
				</span>
			</div>
			<div className="set-stack wide">
				<BioSection />
				<ConnectAi />
				<UsageSection />
				<BackupSection />
				<StatsDataSection />
				<DangerSection />
				<p className="set-footer">
					<span>FluxBio v{app.version}</span>
					<span aria-hidden="true">·</span>
					<a href={REPO_URL} target="_blank" rel="noopener noreferrer">
						GitHub
					</a>
					<span aria-hidden="true">·</span>
					<a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
						AGPL-3.0
					</a>
				</p>
			</div>
		</div>
	)
}
