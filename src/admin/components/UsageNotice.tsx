import { useState } from 'react'
import { Link } from 'wouter'
import { t } from '../i18n'
import { dateFormat, formatDay, formatMonth } from '../lib/format'
import { useUsage } from '../state/usage'
import { Icon } from './Icon'

const FULL = 0.7
const NEARLY_FULL = 0.9
/** Days before old days become months that the dashboard says so. */
const MERGE_NOTICE_DAYS = 30

const dismissKey = (month: string) => `fluxbio-merge-notice-${month}`

function dismissed(month: string): boolean {
	try {
		return localStorage.getItem(dismissKey(month)) === '1'
	} catch {
		return false
	}
}

/** At the top of every page: the database filling up, today's free quota running low, or old days about to become months. */
export function UsageNotice() {
	const usage = useUsage()
	const [hidden, setHidden] = useState(false)
	if (!usage) return null

	const notes: { key: string; text: string; urgent?: boolean; link?: boolean; dismiss?: () => void }[] = []
	const used = usage.database.bytes / usage.database.limit
	if (used >= NEARLY_FULL) {
		notes.push({ key: 'db', urgent: true, link: true, text: t('資料庫快滿了，已用 {percent}%。滿了以後就記不到點擊，也不能編輯頁面。', { percent: Math.floor(used * 100) }) })
	} else if (used >= FULL) {
		notes.push({ key: 'db', link: true, text: t('資料庫已用 {percent}%，每天的明細改成只保留 {months} 個月，更早的合併成每月總數。', { percent: Math.floor(used * 100), months: usage.stats.dailyMonths }) })
	}
	const limits = usage.dailyLimits
	if (limits) {
		const share = Math.max(usage.estimate.requests / limits.requests, usage.estimate.kvReads / limits.kvReads, usage.estimate.rowsWritten / limits.rowsWritten)
		if (share >= FULL) {
			const reset = dateFormat({ hour: '2-digit', minute: '2-digit' }).format(Date.parse(usage.today.since) + 86_400_000)
			notes.push({
				key: 'today',
				urgent: share >= NEARLY_FULL,
				text: t('今天的免費額度估計已用 {percent}%，{time} 重新計算。這是估計值，圖片、機器人和帳號裡的其他專案沒有算進去。', { percent: Math.floor(share * 100), time: reset }),
			})
		}
	}
	const merge = usage.stats.nextMerge
	if (merge && !hidden && !dismissed(merge.month) && Date.parse(`${merge.on}T00:00:00Z`) - Date.now() < MERGE_NOTICE_DAYS * 86_400_000) {
		notes.push({
			key: 'merge',
			link: true,
			text: t('{month} 每天的數字會在 {date} 合併成每月總數。想保留每一天的數字，請先下載點擊數據。', { month: formatMonth(merge.month), date: formatDay(merge.on) }),
			dismiss: () => {
				try {
					localStorage.setItem(dismissKey(merge.month), '1')
				} catch {
					// Shown again next time, then.
				}
				setHidden(true)
			},
		})
	}
	if (!notes.length) return null
	return (
		<>
			{notes.map((note) => (
				<div key={note.key} className={note.urgent ? 'banner usage-note' : 'banner usage-note info'} role={note.urgent ? 'alert' : 'status'}>
					<Icon name="info" size={18} />
					<p>{note.text}</p>
					<span className="usage-note-actions">
						{note.link && (
							<Link href="/settings#stats-data" className="btn small">
								{t('前往設定')}
							</Link>
						)}
						{note.dismiss && (
							<button type="button" className="btn small" onClick={note.dismiss}>
								{t('知道了')}
							</button>
						)}
					</span>
				</div>
			))}
		</>
	)
}
