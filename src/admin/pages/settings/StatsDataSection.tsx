import { useEffect, useState } from 'react'
import { request } from '../../api'
import { Icon } from '../../components/Icon'
import { Dialog, Section, toast } from '../../components/ui'
import { t } from '../../i18n'
import { addMonths } from '../../../shared/time'
import { formatMonth, formatNumber } from '../../lib/format'
import { refreshUsage, useUsage } from '../../state/usage'
import { downloadStats } from './statsFile'
import { errorText } from './util'

/** The numbers behind Stats: how long days are kept, a download of all of it, and clearing old months. */
export function StatsDataSection() {
	const usage = useUsage()
	const [progress, setProgress] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [clearing, setClearing] = useState(false)

	async function download() {
		if (progress !== null) return
		setProgress(t('準備下載…'))
		setError(null)
		try {
			await downloadStats((rows) => setProgress(t('已讀 {count} 筆…', { count: formatNumber(rows) })))
			toast(t('點擊數據下載好了'))
		} catch (caught) {
			setError(errorText(caught, t('下載沒有完成，請再試一次')))
		} finally {
			setProgress(null)
		}
	}

	// The notice at the top links here.
	useEffect(() => {
		if (location.hash === '#stats-data') document.getElementById('stats-data')?.scrollIntoView({ block: 'start' })
	}, [])

	const stats = usage?.stats
	const canClear = Boolean(stats?.oldestMonth && stats.oldestMonth < stats.clearableBefore && !stats.clearing)
	return (
		<Section title={t('點擊數據')} id="stats-data">
			<div className="set-backup-row">
				<div>
					{stats && <p className="hint">{t('每天的瀏覽和點擊次數保留 {months} 個月，更早的月份只留每月總數。', { months: stats.dailyMonths })}</p>}
					<p className="hint">{t('下載成 CSV 檔，Excel 和 Google 試算表都能開。下載不會刪掉任何資料。')}</p>
					{stats?.clearing && <p className="hint">{t('正在清除 {month} 以前的點擊數據，每次打開後台會清掉一部分。', { month: formatMonth(stats.clearing) })}</p>}
				</div>
				<div className="set-stats-actions">
					<button type="button" className="btn" aria-disabled={progress !== null || undefined} onClick={() => void download()}>
						<Icon name="download" size={16} />
						{progress ?? t('下載點擊數據')}
					</button>
					{canClear && (
						<button type="button" className="btn" onClick={() => setClearing(true)}>
							{t('清除舊數據')}
						</button>
					)}
				</div>
			</div>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{stats?.oldestMonth && <ClearDialog open={clearing} oldest={stats.oldestMonth} latest={stats.clearableBefore} onClose={() => setClearing(false)} />}
		</Section>
	)
}

/** Picks a month, downloads everything before it, and only then has it deleted. */
function ClearDialog({ open, oldest, latest, onClose }: { open: boolean; oldest: string; latest: string; onClose: () => void }) {
	// The months whose "before" leaves something to delete, newest first.
	const months: string[] = []
	for (let month = latest; month > oldest; month = addMonths(month, -1)) months.push(month)
	const [before, setBefore] = useState(months.at(-1) ?? latest)
	const [progress, setProgress] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	function close() {
		if (progress !== null) return
		setError(null)
		onClose()
	}

	async function run() {
		if (progress !== null) return
		setError(null)
		setProgress(t('準備下載…'))
		try {
			await downloadStats((rows) => setProgress(t('已讀 {count} 筆…', { count: formatNumber(rows) })), before)
			setProgress(t('清除中…'))
			await request('/stats/clear', { method: 'POST', json: { before } })
			await refreshUsage().catch(() => {})
			toast(t('已下載，舊數據會在接下來幾次打開後台時陸續清除'))
			setProgress(null)
			onClose()
		} catch (caught) {
			setError(errorText(caught, t('沒有完成，請再試一次')))
			setProgress(null)
		}
	}

	return (
		<Dialog
			open={open}
			title={t('清除舊的點擊數據？')}
			onClose={close}
			actions={
				<>
					<button type="button" className="btn" onClick={close}>
						{t('取消')}
					</button>
					<button type="button" className="btn danger" aria-disabled={progress !== null || undefined} onClick={() => void run()}>
						{progress ?? t('下載並清除')}
					</button>
				</>
			}
		>
			<p className="set-dialog-text">{t('會先下載這些數據，下載完成才清除。清除後救不回來；數據頁看得到的範圍不受影響。')}</p>
			<div className="field">
				<label htmlFor="set-clear-before">{t('清除這個月以前的數據')}</label>
				<select id="set-clear-before" className="select" value={before} onChange={(event) => setBefore(event.target.value)}>
					{months.map((month) => (
						<option key={month} value={month}>
							{formatMonth(month)}
						</option>
					))}
				</select>
			</div>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
		</Dialog>
	)
}
