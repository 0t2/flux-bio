import { useState } from 'react'
import type { Settings } from '../../../shared/content'
import { request } from '../../api'
import { AskAi } from '../../components/AskAi'
import { Section, toast } from '../../components/ui'
import { t } from '../../i18n'
import { dateFormat, formatNumber, formatSize } from '../../lib/format'
import { useApp } from '../../state/app'
import { refreshUsage, useUsage } from '../../state/usage'
import { errorText } from './util'

interface Meter {
	label: string
	/** Null where Cloudflare's numbers can't be read, as in local development. */
	used: number | null
	/** Null on the paid plan, which has no daily limit to measure against. */
	limit: number | null
	format?: (value: number) => string
}

/**
 * How much of the plan the site uses. The whole account's KV and D1 come from Cloudflare's analytics; Worker requests
 * aren't in them, so that one is this site's own estimate. The plan is the owner's to say: the Worker can't see it.
 */
export function UsageSection() {
	const app = useApp()
	const usage = useUsage()
	const [saving, setSaving] = useState(false)
	if (!usage) return null

	async function choose(plan: Settings['plan']) {
		if (saving || plan === app.settings.plan) return
		setSaving(true)
		try {
			const { settings } = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { ...app.settings, plan } })
			app.setSettings(settings)
			await refreshUsage()
		} catch (caught) {
			toast(errorText(caught, t('儲存失敗，請稍後再試')))
		} finally {
			setSaving(false)
		}
	}

	const limits = usage.dailyLimits
	const account = usage.account
	const reset = dateFormat({ hour: '2-digit', minute: '2-digit' }).format(Date.parse(usage.today.since) + 86_400_000)
	const site: Meter[] = [{ label: t('資料庫'), used: usage.database.bytes, limit: usage.database.limit, format: formatSize }]
	// Every row is listed even where Cloudflare's numbers can't be read, so the owner sees what there is to watch.
	const accountMeters: Meter[] = [
		{ label: t('KV 讀取'), used: account?.kv.read ?? null, limit: limits?.kv.read ?? null },
		{ label: t('KV 寫入'), used: account?.kv.write ?? null, limit: limits?.kv.write ?? null },
		{ label: t('KV 刪除'), used: account?.kv.delete ?? null, limit: limits?.kv.delete ?? null },
		{ label: t('KV 列出'), used: account?.kv.list ?? null, limit: limits?.kv.list ?? null },
		{ label: t('資料庫讀取'), used: account?.d1.rowsRead ?? null, limit: limits?.d1.rowsRead ?? null },
		{ label: t('資料庫寫入'), used: account?.d1.rowsWritten ?? null, limit: limits?.d1.rowsWritten ?? null },
		{ label: t('資料庫數量'), used: account?.databases.count ?? null, limit: limits?.databases.count ?? null },
		{ label: t('所有資料庫的大小'), used: account?.databases.bytes ?? null, limit: limits?.databases.bytes ?? null, format: formatSize },
	]
	const estimate: Meter[] = [{ label: t('請求（估計）'), used: usage.estimate.requests, limit: limits?.requests ?? null }]
	const plans: { id: Settings['plan']; label: string }[] = [
		{ id: 'free', label: t('免費') },
		{ id: 'paid', label: 'Workers Paid' },
	]

	return (
		<Section title={t('用量')}>
			<div className="usage-plan">
				<span>{t('Cloudflare 方案')}</span>
				<div className="set-scopes" role="group" aria-label={t('Cloudflare 方案')}>
					{plans.map((plan) => (
						<button key={plan.id} type="button" className="set-choice compact" aria-pressed={usage.plan === plan.id} aria-disabled={saving || undefined} onClick={() => void choose(plan.id)}>
							{plan.label}
						</button>
					))}
				</div>
			</div>
			<p className="hint">
				{usage.plan === 'paid' ? t('超過內含的額度會照用量計費，網站不會停。') : t('免費方案的額度每天 {time} 重新計算，用完的那一項會停到那時候。', { time: reset })}
			</p>

			<h3 className="usage-group">{t('這個網站')}</h3>
			<Meters meters={site} />
			<h3 className="usage-group">{t('整個 Cloudflare 帳號，今天')}</h3>
			{!account && <p className="hint">{t('本機預覽讀不到 Cloudflare 的帳號用量，部署到 Cloudflare 後就會顯示。')}</p>}
			<Meters meters={accountMeters} />
			<Meters meters={estimate} />
			<p className="hint">
				{account
					? t('帳號的數字來自 Cloudflare，會晚幾分鐘，包含帳號裡的其他專案。Cloudflare 沒有提供請求數，這裡用這個網站今天的 {views} 次瀏覽和 {clicks} 次點擊估計，圖片和機器人沒有算進去。', { views: formatNumber(usage.today.views), clicks: formatNumber(usage.today.clicks) })
					: t('請求數用這個網站今天的 {views} 次瀏覽和 {clicks} 次點擊估計，圖片和機器人沒有算進去。', { views: formatNumber(usage.today.views), clicks: formatNumber(usage.today.clicks) })}
			</p>
			<h3 className="usage-group">{t('這裡看不到，要問 AI')}</h3>
			<ul className="usage-ai">
				<li>{t('每個 KV 命名空間和每個資料庫各用了多少，看是哪個專案用掉的')}</li>
				<li>{t('前幾天每天的用量，最多 31 天')}</li>
				<li>{t('帳號是不是 Workers Paid，AI 查到後會順便更新上面的方案')}</li>
			</ul>
			<AskAi say={t('幫我查 Cloudflare 帳號今天的詳細用量，看是哪個專案用掉的')} />
			<p className="hint">{t('每個 Worker 的請求數只有 Cloudflare 後台看得到：Workers & Pages → 選 Worker → Metrics。')}</p>
		</Section>
	)
}

function Meters({ meters }: { meters: Meter[] }) {
	return (
		<ul className="usage-meters" role="list">
			{meters.map((meter) => {
				const format = meter.format ?? formatNumber
				const used = meter.used
				const text = used === null ? t('部署後顯示') : meter.limit ? `${format(used)} / ${format(meter.limit)}` : format(used)
				const share = used !== null && meter.limit ? Math.min(1, used / meter.limit) : 0
				return (
					<li key={meter.label}>
						<div className="usage-meter-head">
							<span>{meter.label}</span>
							<span className="mono">{text}</span>
						</div>
						{used !== null && meter.limit !== null && (
							<span
								className={share >= 0.9 ? 'usage-meter-bar high' : share >= 0.7 ? 'usage-meter-bar mid' : 'usage-meter-bar'}
								role="meter"
								aria-label={meter.label}
								aria-valuemin={0}
								aria-valuemax={meter.limit}
								aria-valuenow={used}
								aria-valuetext={text}
							>
								<span style={{ inlineSize: `${Math.max(share * 100, used > 0 ? 1 : 0)}%` }} />
							</span>
						)}
					</li>
				)
			})}
		</ul>
	)
}
