import { AskAi } from '../../components/AskAi'
import { Section } from '../../components/ui'
import { t } from '../../i18n'
import { dateFormat, formatNumber, formatSize } from '../../lib/format'
import { useUsage } from '../../state/usage'

interface Meter {
	label: string
	used: number
	limit: number
	text: string
}

/** How much of the plan the site uses: its database, and on the free plan today's estimate against the daily limits. */
export function UsageSection() {
	const usage = useUsage()
	if (!usage) return null
	const limits = usage.dailyLimits
	const meters: Meter[] = [
		{ label: t('資料庫'), used: usage.database.bytes, limit: usage.database.limit, text: `${formatSize(usage.database.bytes)} / ${formatSize(usage.database.limit)}` },
	]
	if (limits) {
		const daily = (label: string, used: number, limit: number): Meter => ({ label, used, limit, text: `${formatNumber(used)} / ${formatNumber(limit)}` })
		meters.push(
			daily(t('今天的請求'), usage.estimate.requests, limits.requests),
			daily(t('今天的 KV 讀取'), usage.estimate.kvReads, limits.kvReads),
			daily(t('今天的資料庫寫入'), usage.estimate.rowsWritten, limits.rowsWritten),
		)
	}
	const reset = dateFormat({ hour: '2-digit', minute: '2-digit' }).format(Date.parse(usage.today.since) + 86_400_000)
	return (
		<Section title={t('用量')}>
			<p className="hint">
				{usage.plan === 'paid' ? t('Cloudflare 方案：Workers Paid。超過內含的額度會照用量計費，網站不會停。') : t('Cloudflare 方案：免費。每天的額度用完，網站會停到 {time} 重新計算。', { time: reset })}
			</p>
			<ul className="usage-meters" role="list">
				{meters.map((meter) => {
					const share = meter.limit ? Math.min(1, meter.used / meter.limit) : 0
					return (
						<li key={meter.label}>
							<div className="usage-meter-head">
								<span>{meter.label}</span>
								<span className="mono">{meter.text}</span>
							</div>
							<span className={share >= 0.9 ? 'usage-meter-bar high' : share >= 0.7 ? 'usage-meter-bar mid' : 'usage-meter-bar'} role="meter" aria-label={meter.label} aria-valuemin={0} aria-valuemax={meter.limit} aria-valuenow={meter.used} aria-valuetext={meter.text}>
								<span style={{ inlineSize: `${Math.max(share * 100, meter.used > 0 ? 1 : 0)}%` }} />
							</span>
						</li>
					)
				})}
			</ul>
			<p className="hint">
				{t('今天到目前有 {views} 次瀏覽、{clicks} 次點擊。今天的數字是這個網站自己估的，圖片、機器人和帳號裡的其他專案沒有算進去。', { views: formatNumber(usage.today.views), clicks: formatNumber(usage.today.clicks) })}
			</p>
			<AskAi say={t('幫我查 Cloudflare 帳號今天實際用了多少')} />
		</Section>
	)
}
