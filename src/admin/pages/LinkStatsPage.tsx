import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'wouter'
import type { LinkStatsResponse, RecentEventJson } from '../../shared/api'
import { sourceLabel } from '../../shared/source'
import { ApiError, request } from '../api'
import { Bars, CampaignTable, deviceAndBrowser, eventTime, InsightsNote, LoadError, Panel, perDay, PeriodPicker, placeOf, Tile, TrendChart, type Days } from '../components/charts'
import { Icon } from '../components/Icon'
import { Breadcrumb, EmptyState } from '../components/ui'
import { t, tMessage } from '../i18n'
import { formatDate, formatNumber, networkName, percent } from '../lib/format'
import { useApp } from '../state/app'
import '../styles/stats.css'
import { Loading } from '../components/Loading'

// The map's land outline is large; load it only where a map is shown.
const VisitorMap = lazy(() => import('../components/VisitorMap').then((m) => ({ default: m.VisitorMap })))

export function LinkStatsPage({ id }: { id: string }) {
	const app = useApp()
	const [days, setDays] = useState<Days>(30)
	const [data, setData] = useState<LinkStatsResponse | null>(null)
	const [error, setError] = useState<{ message: string; missing: boolean } | null>(null)
	const [loading, setLoading] = useState(true)
	const [attempt, setAttempt] = useState(0)

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		setError(null)
		request<LinkStatsResponse>(`/links/${encodeURIComponent(id)}/stats?days=${days}`)
			.then((result) => {
				if (!cancelled) setData(result)
			})
			.catch((caught: unknown) => {
				if (cancelled) return
				setError({
					message: caught instanceof Error ? caught.message : t('讀取數據失敗'),
					missing: caught instanceof ApiError && caught.status === 404,
				})
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [id, days, attempt])

	if (error?.missing) return <Missing />
	const retry = () => setAttempt((count) => count + 1)
	// Data for another link (we just navigated here) isn't shown, not even dimmed.
	const current = data?.link.id === id ? data : null
	if (!current) {
		return (
			<div className="st-page">
				<Breadcrumb items={[{ href: '/short-links', label: t('短網址') }]} />
				{error ? <LoadError message={error.message} onRetry={retry} /> : <Loading inline />}
			</div>
		)
	}

	const { link, insights } = current
	const total = current.total
	const span = current.days.length
	const qr = current.sources.find((source) => source.value === 'qr')?.count ?? 0

	return (
		<div className="st-page">
			<Breadcrumb items={[{ href: '/short-links', label: t('短網址') }, { label: link.slug }]} />
			<div className="page-head">
				<div className="st-link-titles">
					<h1 className="st-link-title" dir="ltr">
						<span>{app.host}/</span>
						<b>{link.slug}</b>
					</h1>
					<p className="st-link-sub">
						<span dir="ltr">→ {link.url}</span> · {tMessage({ key: current.placeKey, params: current.placeParams })} · {t('{date} 建立', { date: formatDate(link.createdAt) })}
					</p>
				</div>
				<div className="st-head-actions">
					<Link href={`/short-links/${encodeURIComponent(id)}/qr`} className="btn square">
						<Icon name="qr" size={16} />
						{t('QR Code 樣式')}
					</Link>
					<Link href={`/short-links?select=${encodeURIComponent(id)}`} className="btn square">
						<Icon name="edit" size={16} />
						{t('編輯短網址')}
					</Link>
				</div>
			</div>
			<div className="st-toolbar">
				<PeriodPicker value={days} onChange={setDays} />
			</div>
			{error && <LoadError message={error.message} onRetry={retry} />}
			<div className="st-content" aria-busy={loading}>
				{!insights && <InsightsNote analytics={app.analytics} />}
				<div className="st-kpis">
					<Tile label={t('點擊')} value={formatNumber(total)} note={t('近 {days} 天', { days: span })} />
					<Tile label={t('每日不重複訪客')} value={insights ? formatNumber(insights.visitors) : '—'} note={insights ? t('依裝置估算') : t('部署後才有資料')} />
					<Tile label={t('QR 掃描')} value={formatNumber(qr)} note={t('佔全部點擊 {share}', { share: percent(qr, total) })} />
					<Tile label={t('平均每天')} value={perDay(total, span)} note={t('次點擊')} />
				</div>
				<Panel title={t('每日點擊')}>
					<TrendChart key={span} days={current.days} values={current.clicks} name={t('點擊')} />
				</Panel>
				<div className="st-row">
					<Panel
						className="st-wide"
						title={t('UTM 活動成效')}
					>
						<CampaignTable items={insights?.campaigns ?? []} views={false} empty={insights ? t('這段期間還沒有帶 UTM 標籤的點擊。') : t('部署後才會有 UTM 數據。')} />
					</Panel>
					<Panel className="st-narrow" title={t('點擊來源')}>
						<Bars
							counts
							items={current.sources.map((source) => ({ label: t(sourceLabel(source.value)), value: source.count }))}
							empty={t('這段期間還沒有點擊，分享出去後就會開始統計。')}
						/>
					</Panel>
				</div>
				{insights && (
					<div className="st-row">
						<Panel className="st-wide" title={t('點擊分布')} note={t('Cloudflare 從連線推算到城市，不是 GPS')}>
							<Suspense fallback={<div className="st-map" />}>
								<VisitorMap points={insights.points} empty={t('這段期間還沒有點擊。')} />
							</Suspense>
						</Panel>
						<Panel className="st-narrow" title={t('網路')} note={t('看點擊的人用哪家電信商或公司網路')}>
							<Bars counts items={insights.networks.map((network) => ({ label: networkName(network.value), value: network.count }))} empty={t('這段期間還沒有點擊。')} />
						</Panel>
					</div>
				)}
				<Panel title={t('最近的點擊')} note={t('不記錄 IP，只留下地區、來源和裝置。')}>
					{insights ? <RecentClicks events={insights.recent} timezone={current.timezone} /> : <p className="hint">{t('部署後才會有逐筆紀錄。')}</p>}
				</Panel>
			</div>
		</div>
	)
}

function RecentClicks({ events, timezone }: { events: RecentEventJson[]; timezone: string }) {
	if (!events.length) return <p className="hint">{t('這段期間還沒有點擊。')}</p>
	// Explicit roles keep this a table for screen readers when phones lay the rows out as cards.
	return (
		<table className="st-table st-recent st-stack" role="table">
			<thead role="rowgroup">
				<tr role="row">
					<th scope="col" role="columnheader">
						{t('時間')}
					</th>
					<th scope="col" role="columnheader">
						{t('地區')}
					</th>
					<th scope="col" role="columnheader">
						{t('來源')}
					</th>
					<th scope="col" role="columnheader">
						{t('裝置與瀏覽器')}
					</th>
					<th scope="col" role="columnheader">
						{t('方式')}
					</th>
				</tr>
			</thead>
			<tbody role="rowgroup">
				{events.map((event, i) => {
					const scanned = event.source === 'qr'
					return (
						<tr key={`${event.at}-${i}`} role="row">
							<td role="cell" className="st-when">
								{eventTime(event.at, timezone)}
							</td>
							<td role="cell" className="st-where">
								{placeOf(event)}
							</td>
							<td role="cell" className="st-from">
								{t(sourceLabel(event.source))}
							</td>
							<td role="cell" className="st-device">
								{deviceAndBrowser(event)}
							</td>
							<td role="cell" className="st-way">
								<span className={scanned ? 'tag cyan' : 'tag muted'}>{scanned ? 'QR' : t('[via]連結')}</span>
							</td>
						</tr>
					)
				})}
			</tbody>
		</table>
	)
}

function Missing() {
	return (
		<div className="st-page">
			<Breadcrumb items={[{ href: '/short-links', label: t('短網址') }, { label: t('找不到') }]} />
			<EmptyState icon="shortlink" title={t('找不到這個短網址')}>
				<p>{t('可能是網址打錯了，或這個短網址已經刪除。')}</p>
				<Link href="/short-links" className="btn primary">
					{t('回到短網址')}
				</Link>
			</EmptyState>
		</div>
	)
}
