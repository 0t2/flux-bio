import { useEffect, useState } from 'react'
import { t } from '../i18n'

const SLOW_AFTER = 8000

/** "Loading…", which says so and offers a way out when it goes on too long, instead of sitting there for good. */
export function Loading({ inline }: { inline?: boolean }) {
	const [slow, setSlow] = useState(false)

	useEffect(() => {
		const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER)
		return () => window.clearTimeout(timer)
	}, [])

	return (
		<div className={inline ? 'loading inline' : 'loading'}>
			{slow ? (
				<div className="loading-slow" role="status">
					<p>{t('載入得比平常久，可能是網路或伺服器的問題。')}</p>
					<button type="button" className="btn small" onClick={() => window.location.reload()}>
						{t('重新整理')}
					</button>
				</div>
			) : (
				t('載入中…')
			)}
		</div>
	)
}
