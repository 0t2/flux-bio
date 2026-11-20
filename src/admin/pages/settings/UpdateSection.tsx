import { useEffect, useState } from 'react'
import type { UpdateResponse } from '../../../shared/api'
import { request } from '../../api'
import { CopyButton, Section } from '../../components/ui'
import { language, t } from '../../i18n'

/**
 * Whether a newer FluxBio is out, asked once each time Settings opens: an owner who rarely talks to their AI would
 * otherwise never hear of a security fix. Null until it answers, and when it can't be asked.
 */
export function useUpdate(): UpdateResponse | null {
	const [update, setUpdate] = useState<UpdateResponse | null>(null)
	useEffect(() => {
		let wanted = true
		request<UpdateResponse>('/update')
			.then((answer) => {
				if (wanted) setUpdate(answer)
			})
			// Not knowing is not worth a message: the version is in the footer either way.
			.catch(() => {})
		return () => {
			wanted = false
		}
	}, [])
	return update
}

/** Shown only when there is something to do. Updating takes the owner's computer, so it gives the sentence to say. */
export function UpdateSection({ update }: { update: UpdateResponse | null }) {
	if (!update?.latest || update.behind < 1) return null
	const say = t('幫我把 FluxBio 更新到最新版')
	return (
		<Section title={t('有新版本')}>
			<p className="hint">{t('FluxBio {latest} 出了，這個網站還在 {version}。', { latest: update.latest, version: update.version })}</p>
			{update.security && (
				<p className="form-error" role="alert">
					{t('其中有安全性修正，請盡快更新。')}
				</p>
			)}
			{update.actionNeeded && <p className="hint">{t('這次更新除了重新部署，還有別的步驟，你的 AI 會帶你做。')}</p>}
			<p className="set-tool-note">{t('更新是在你的電腦上做的。對你的 AI 說：')}</p>
			<div className="set-command set-after">
				<code className="set-wrap">{say}</code>
				<CopyButton text={say} />
			</div>
			<p className="hint">
				<a href={`https://fluxbio.link/${language()}/changelog/#v${update.latest}`} target="_blank" rel="noopener noreferrer">
					{t('看看改了什麼')}
				</a>
			</p>
		</Section>
	)
}
