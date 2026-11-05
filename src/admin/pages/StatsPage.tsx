import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'wouter'
import type { InsightsJson, LabelKey, LinksResponse, RankedJson, RecentEventJson, StatsResponse, TopTargetJson } from '../../shared/api'
import { sourceLabel } from '../../shared/source'
import { request } from '../api'
import {
	Bars,
	browserLabel,
	CampaignTable,
	dayLabel,
	deviceAndBrowser,
	deviceLabel,
	eventTime,
	Heatmap,
	InsightsNote,
	LoadError,
	Meter,
	Panel,
	perDay,
	PeriodPicker,
	placeOf,
	ratioText,
	Tile,
	TrendChart,
	type Days,
} from '../components/charts'
import { Icon } from '../components/Icon'
import { QrCode } from '../components/QrCode'
import { CopyButton, Dialog, EmptyState, Segmented } from '../components/ui'
import { msg, t, tMessage, tr } from '../i18n'
import { downloadCsv, formatNumber, groupPlaces, languageName, networkName, numberFormat, percent, zoneLabel } from '../lib/format'
import { useApp } from '../state/app'
import { usePage } from '../state/page'
import '../styles/stats.css'
import { Loading } from '../components/Loading'

// The map's land outline is large; load it only where a map is shown.
const VisitorMap = lazy(() => import('../components/VisitorMap').then((m) => ({ default: m.VisitorMap })))

type Metric = 'views' | 'clicks' | 'ctr' | 'visitors'

const METRICS: Record<Metric, { label: string; unit: string }> = {
	views: { label: msg('頁面瀏覽'), unit: msg('{count} 次') },
	clicks: { label: msg('連結點擊'), unit: msg('{count} 次') },
	ctr: { label: msg('點擊率'), unit: '{count}' },
	visitors: { label: msg('每日不重複訪客'), unit: msg('{count} 次') },
}

const VIEWS = [
	{ value: 'chart', label: msg('圖表') },
	{ value: 'table', label: msg('表格') },
] as const

/** Top links shown before 看全部. */
const TOP = 10

export function StatsPage() {
	const app = useApp()
	const { handle } = usePage()
	const [days, setDays] = useState<Days>(30)
	const [stats, setStats] = useState<StatsResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [attempt, setAttempt] = useState(0)
	const pageId = app.currentId

	useEffect(() => {
		if (!pageId) return
		let cancelled = false
		setLoading(true)
		setError(null)
		request<StatsResponse>(`/stats?page=${encodeURIComponent(pageId)}&days=${days}`)
			.then((result) => {
				if (!cancelled) setStats(result)
			})
			.catch((caught: unknown) => {
				if (!cancelled) setError(caught instanceof Error ? caught.message : t('讀取數據失敗'))
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [pageId, days, attempt])

	const empty = Boolean(stats && !stats.totals.views && !stats.totals.clicks)

	return (
		<div className="st-page">
			<div className="page-head">
				<div>
					<h1>{t('數據')}</h1>
					<p>{t('資料由你的 Cloudflare Worker 記錄，時間以{zone}計算。', { zone: zoneLabel(stats?.timezone ?? app.settings.timezone) })}</p>
				</div>
			</div>
			<div className="st-toolbar">
				<PeriodPicker value={days} onChange={setDays} />
				{stats && !empty && (
					<button type="button" className="btn square" onClick={() => exportCsv(stats, handle)}>
						<Icon name="download" size={16} stroke={2} />
						{t('匯出 CSV')}
					</button>
				)}
			</div>
			{error && <LoadError message={error} onRetry={() => setAttempt((count) => count + 1)} />}
			{stats ? (
				<div className="st-content" aria-busy={loading}>
					{empty ? <NoClicks stats={stats} /> : <Report stats={stats} />}
				</div>
			) : (
				!error && <Loading inline />
			)}
		</div>
	)
}

/**
 * 數據 while pages are off. GET /api/stats is about one page and has nothing to
 * say without one, so this adds up GET /api/links, which gives every short link's
 * last 7 days. Longer periods, places and devices are on each link's own stats page.
 */
export function ShortLinksStats() {
	const app = useApp()
	const [data, setData] = useState<LinksResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [attempt, setAttempt] = useState(0)

	useEffect(() => {
		let cancelled = false
		setError(null)
		request<LinksResponse>('/links')
			.then((result) => {
				if (!cancelled) setData(result)
			})
			.catch((caught: unknown) => {
				if (!cancelled) setError(caught instanceof Error ? caught.message : t('讀取數據失敗'))
			})
		return () => {
			cancelled = true
		}
	}, [attempt])

	return (
		<div className="st-page">
			<div className="page-head">
				<div>
					<h1>{t('數據')}</h1>
					<p>{t('全部短網址近 7 天的點擊，時間以{zone}計算。要看更長的期間、地區和裝置，點進各個短網址。', { zone: zoneLabel(app.settings.timezone) })}</p>
				</div>
			</div>
			{error && <LoadError message={error} onRetry={() => setAttempt((count) => count + 1)} />}
			{data ? <ShortLinksReport data={data} /> : !error && <Loading inline />}
		</div>
	)
}

function ShortLinksReport({ data }: { data: LinksResponse }) {
	const app = useApp()
	const { days, links } = data
	const clicks = days.map((_, i) => links.reduce((sum, link) => sum + (link.stats?.series[i] ?? 0), 0))
	const total = clicks.reduce((sum, count) => sum + count, 0)
	if (!total) {
		return (
			<EmptyState icon="chart" title={t('近 {days} 天沒有人點', { days: days.length })}>
				<p>{t('把短網址分享出去，有人點了，這裡就會開始畫圖。')}</p>
				<Link href="/short-links" className="btn primary">
					{t('回到短網址')}
				</Link>
			</EmptyState>
		)
	}
	const sources = new Map<string, number>()
	for (const link of links) for (const { source, count } of link.stats?.sources ?? []) sources.set(source, (sources.get(source) ?? 0) + count)
	const clicked = links.filter((link) => link.stats?.total)
	const top: TopTargetJson[] = clicked
		.map((link) => ({ target: link.id, count: link.stats?.total ?? 0, label: link.title || link.slug, slug: link.slug.startsWith('~') ? '' : link.slug, kind: 'link' as const }))
		.sort((a, b) => b.count - a.count)
	const qr = sources.get('qr') ?? 0
	return (
		<div className="st-content">
			<div className="st-kpis">
				<Tile label={t('點擊')} value={formatNumber(total)} note={t('近 {days} 天', { days: days.length })} />
				<Tile label={t('有人點的短網址')} value={formatNumber(clicked.length)} note={t('共 {count} 個', { count: links.length })} />
				<Tile label={t('QR 掃描')} value={formatNumber(qr)} note={t('佔全部點擊 {share}', { share: percent(qr, total) })} />
				<Tile label={t('平均每天')} value={perDay(total, days.length)} note={t('次點擊')} />
			</div>
			<Panel title={t('每日點擊')}>
				<TrendChart days={days} values={clicks} name={t('點擊')} />
			</Panel>
			<div className="st-row">
				<Panel className="st-wide" title={t('熱門短網址')}>
					<TopLinks links={top} host={app.host} />
				</Panel>
				<Panel className="st-narrow" title={t('點擊來源')}>
					<Bars counts items={[...sources].sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ label: t(sourceLabel(source)), value: count }))} />
				</Panel>
			</div>
		</div>
	)
}

function Report({ stats }: { stats: StatsResponse }) {
	const app = useApp()
	const [picked, setPicked] = useState<Metric>('clicks')
	const [view, setView] = useState<'chart' | 'table'>('chart')
	const insights = stats.insights
	const metric = picked === 'visitors' && !insights ? 'clicks' : picked
	const label = t(METRICS[metric].label)
	const { unit } = METRICS[metric]

	return (
		<>
			{!insights && <InsightsNote analytics={app.analytics} />}
			<Kpis stats={stats} metric={metric} onPick={setPicked} />
			<Panel
				title={t('{metric}・每日', { metric: label })}
				action={
					<div className="st-seg">
						<Segmented label={t('檢視方式')} options={VIEWS.map((option) => ({ ...option, label: t(option.label) }))} value={view} onChange={setView} />
					</div>
				}
			>
				{view === 'chart' ? (
					<TrendChart key={`${metric}-${stats.days.length}`} days={stats.days} values={seriesOf(stats, metric)} name={label} unit={unit} ratio={metric === 'ctr'} />
				) : (
					<DailyTable stats={stats} />
				)}
			</Panel>
			<div className="st-row">
				<Panel
					className="st-wide"
					title={t('熱門連結')}
					action={
						<Link href="/short-links" className="st-head-link">
							{t('管理短網址')}
						</Link>
					}
				>
					<TopLinks links={stats.topLinks} views={stats.totals.views} host={app.host} />
				</Panel>
				<Panel className="st-narrow" title={t('來源平台')} note={t('訪客從哪裡打開頁面，之後點了多少連結')}>
					<SourceTable views={stats.viewSources} clicks={stats.clickSources} />
				</Panel>
			</div>
			{insights && <Details insights={insights} timezone={stats.timezone} />}
		</>
	)
}

type Change = { tone: 'up' | 'down' | 'flat' | 'none'; text: string }

const oneDecimal = () => numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 })
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${oneDecimal().format(Math.abs(value))}`
const toneOf = (value: number): Change['tone'] => (value > 0 ? 'up' : value < 0 ? 'down' : 'flat')
const noPrevious = (days: number): Change => ({ tone: 'none', text: t('前 {days} 天沒有資料', { days }) })

/** Percent change against the previous period, rounded to one decimal. */
function growth(now: number, before: number, days: number): Change {
	if (!before) return noPrevious(days)
	const value = Math.round(((now - before) / before) * 1000) / 10
	return { tone: toneOf(value), text: `${signed(value)}%` }
}

/** A change in click rate, in percentage points. */
function points(now: number | null, before: number | null, days: number): Change {
	if (now === null) return { tone: 'none', text: t('這段期間沒有瀏覽') }
	if (before === null) return noPrevious(days)
	const value = Math.round((now - before) * 1000) / 10
	return { tone: toneOf(value), text: t('{value} 個百分點', { value: signed(value) }) }
}

function Kpis({ stats, metric, onPick }: { stats: StatsResponse; metric: Metric; onPick: (metric: Metric) => void }) {
	const { totals, previous, insights } = stats
	const days = stats.days.length
	const rate = totals.views ? totals.clicks / totals.views : null
	const rateBefore = previous.views ? previous.clicks / previous.views : null
	const tiles: { id: Metric; value: string; change: Change }[] = [
		{ id: 'views', value: formatNumber(totals.views), change: growth(totals.views, previous.views, days) },
		{ id: 'clicks', value: formatNumber(totals.clicks), change: growth(totals.clicks, previous.clicks, days) },
		{ id: 'ctr', value: rate === null ? '—' : ratioText(rate), change: points(rate, rateBefore, days) },
		{
			id: 'visitors',
			value: insights ? formatNumber(insights.visitors) : '—',
			change: insights ? growth(insights.visitors, insights.previousVisitors, days) : { tone: 'none', text: t('部署後才有資料') },
		},
	]
	return (
		<div className="st-kpis" role="group" aria-label={t('指標，點選切換下方圖表')}>
			{tiles.map((tile) => (
				<button
					key={tile.id}
					type="button"
					className="st-kpi"
					aria-pressed={metric === tile.id}
					disabled={tile.id === 'visitors' && !insights}
					onClick={() => onPick(tile.id)}
				>
					<span className="st-kpi-label">{t(METRICS[tile.id].label)}</span>
					<span className="st-kpi-value">{tile.value}</span>
					<span className={`st-change ${tile.change.tone}`}>
						<span className="st-delta">
							{tile.change.tone === 'up' && <Icon name="arrowUp" size={14} stroke={2.4} />}
							{tile.change.tone === 'down' && <Icon name="arrowDown" size={14} stroke={2.4} />}
							{tile.change.text}
						</span>
						{tile.change.tone !== 'none' && <span>{t('比前 {days} 天', { days })}</span>}
					</span>
				</button>
			))}
		</div>
	)
}

function seriesOf(stats: StatsResponse, metric: Metric): (number | null)[] {
	switch (metric) {
		case 'views':
			return stats.views
		case 'clicks':
			return stats.clicks
		case 'ctr':
			return stats.days.map((_, i) => {
				const views = stats.views[i] ?? 0
				return views ? (stats.clicks[i] ?? 0) / views : null
			})
		case 'visitors':
			return stats.days.map((day) => stats.insights?.visitorsByDay[day] ?? 0)
	}
}

function DailyTable({ stats }: { stats: StatsResponse }) {
	const visitors = stats.insights?.visitorsByDay
	const rows = stats.days.map((day, i) => ({ day, views: stats.views[i] ?? 0, clicks: stats.clicks[i] ?? 0 })).reverse()
	return (
		<div className="st-daily" role="region" aria-label={t('每日數據')} tabIndex={0}>
			<table className="st-table">
				<thead>
					<tr>
						<th scope="col">{t('日期')}</th>
						<th scope="col" className="st-num">
							{t('頁面瀏覽')}
						</th>
						<th scope="col" className="st-num">
							{t('連結點擊')}
						</th>
						<th scope="col" className="st-num">
							{t('點擊率')}
						</th>
						<th scope="col" className="st-num">
							{t('每日不重複訪客')}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.day}>
							<th scope="row">{dayLabel(row.day)}</th>
							<td className="st-num">{formatNumber(row.views)}</td>
							<td className="st-num">{formatNumber(row.clicks)}</td>
							<td className="st-num">{row.views ? ratioText(row.clicks / row.views) : '—'}</td>
							<td className="st-num">{visitors ? formatNumber(visitors[row.day] ?? 0) : '—'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/** With no `views` there is no click rate to work out, and no such column. */
function TopLinks({ links, views, host }: { links: TopTargetJson[]; views?: number; host: string }) {
	const [all, setAll] = useState(false)
	if (!links.length) return <p className="hint">{t('這段期間還沒有人點連結。')}</p>
	const max = Math.max(1, ...links.map((link) => link.count))
	const shown = all ? links : links.slice(0, TOP)
	return (
		<>
			<div className="st-table-wrap">
				<table className="st-table st-top">
					<thead>
						<tr>
							<th scope="col" className="st-rank">
								#
							</th>
							<th scope="col">{t('連結')}</th>
							<th scope="col" className="st-top-clicks">
								{t('點擊')}
							</th>
							{views !== undefined && (
								<th scope="col" className="st-num">
									{t('點擊率')}
								</th>
							)}
						</tr>
					</thead>
					<tbody>
						{shown.map((link, i) => (
							<tr key={link.target}>
								<td className="st-rank">{i + 1}</td>
								<td className="st-top-name">
									<span className="st-top-label">
										{link.kind === 'link' ? <Link href={`/short-links/${encodeURIComponent(link.target)}/stats`}>{labelText(link)}</Link> : labelText(link)}
									</span>
									{link.slug && (
										<span className="st-top-url" dir="ltr">
											{host}/{link.slug}
										</span>
									)}
									<span className="st-top-bar" aria-hidden="true">
										<i style={{ width: `${(link.count / max) * 100}%` }} />
									</span>
								</td>
								<td className="st-top-clicks">
									<Meter value={link.count} max={max} />
								</td>
								{views !== undefined && <td className="st-num">{views ? ratioText(link.count / views) : '—'}</td>}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{links.length > TOP && (
				<button type="button" className="btn small st-more" aria-expanded={all} onClick={() => setAll(!all)}>
					{all ? t('只看前 {count} 名', { count: TOP }) : t('看全部 {count} 個', { count: links.length })}
				</button>
			)}
		</>
	)
}

/**
 * Where visitors opened the bio page (Instagram, X, Facebook…) and how many
 * clicks each source led to. Links on the page carry the visit's source, so a
 * click counts under the platform the page was opened from.
 */
function SourceTable({ views, clicks }: { views: RankedJson[]; clicks: RankedJson[] }) {
	const rows = new Map<string, { views: number; clicks: number }>()
	for (const source of views) rows.set(source.value, { views: source.count, clicks: 0 })
	for (const source of clicks) rows.set(source.value, { views: rows.get(source.value)?.views ?? 0, clicks: source.count })
	const sorted = [...rows].sort(([, a], [, b]) => b.views - a.views || b.clicks - a.clicks).slice(0, 8)
	if (!sorted.length) return <p className="hint">{t('這段期間還沒有瀏覽。')}</p>
	return (
		<div className="st-table-wrap">
			<table className="st-table st-sources">
				<thead>
					<tr>
						<th scope="col">{t('來源')}</th>
						<th scope="col" className="st-num">
							{t('[count]瀏覽')}
						</th>
						<th scope="col" className="st-num">
							{t('點擊')}
						</th>
						<th scope="col" className="st-num">
							{t('點擊率')}
						</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map(([source, row]) => (
						<tr key={source}>
							<td>{t(sourceLabel(source))}</td>
							<td className="st-num">{formatNumber(row.views)}</td>
							<td className="st-num">{formatNumber(row.clicks)}</td>
							<td className="st-num">{row.views ? percent(row.clicks, row.views) : '—'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/** Everything that comes from Analytics Engine. */
function Details({ insights, timezone }: { insights: InsightsJson; timezone: string }) {
	return (
		<>
			<div className="st-row">
				<Panel className="st-wide" title={t('訪客分布')} note={t('依頁面瀏覽，Cloudflare 從連線推算到城市，不是 GPS')}>
					<Suspense fallback={<div className="st-map" />}>
						<VisitorMap points={insights.points} empty={t('這段期間還沒有瀏覽。')} />
					</Suspense>
				</Panel>
				<Panel className="st-narrow" title={t('地區')} note={t('依連結點擊，Cloudflare 從連線推算到城市')}>
					<Bars counts items={groupPlaces(insights.places).map((place) => ({ label: place.label, value: place.count }))} empty={t('這段期間還沒有點擊。')} />
				</Panel>
			</div>
			<div className="st-row">
				<Panel className="st-half" title={t('裝置與瀏覽器')}>
					<h3 className="st-sub">{t('裝置')}</h3>
					<Bars counts items={insights.devices.map((device) => ({ label: deviceLabel(device.value), value: device.count }))} empty={t('這段期間還沒有瀏覽。')} />
					<h3 className="st-sub">{t('瀏覽器')}</h3>
					<Bars counts items={insights.browsers.map((browser) => ({ label: browserLabel(browser.value), value: browser.count }))} empty={t('這段期間還沒有瀏覽。')} />
				</Panel>
				<Panel className="st-half" title={t('網路')} note={t('依頁面瀏覽，看訪客用哪家電信商或公司網路')}>
					<Bars counts items={insights.networks.map((network) => ({ label: networkName(network.value), value: network.count }))} empty={t('這段期間還沒有瀏覽。')} />
				</Panel>
			</div>
			<Panel title={t('點擊時段')}>
				<Heatmap values={insights.heatmap} />
			</Panel>
			<div className="st-row">
				<Panel className="st-wide" title={t('UTM 活動')} note={t('帶 UTM 標籤的瀏覽和點擊')}>
					<CampaignTable items={insights.campaigns} empty={t('還沒有帶 UTM 標籤的瀏覽或點擊。')} />
				</Panel>
				<Panel className="st-narrow" title={t('語言')} note={t('依頁面瀏覽，看瀏覽器的語言設定')}>
					<Bars counts items={insights.languages.map((language) => ({ label: languageName(language.value), value: language.count }))} empty={t('這段期間還沒有瀏覽。')} />
				</Panel>
			</div>
			<div className="st-row">
				<Panel className="st-wide" title={t('最近活動')}>
					<RecentList events={insights.recent} timezone={timezone} />
				</Panel>
				<Panel className="st-narrow" title={t('外部網站')} note={t('依頁面瀏覽，看訪客從哪個網站連過來')}>
					<Bars counts items={insights.referrers.map((referrer) => ({ label: referrer.value, value: referrer.count }))} empty={t('還沒有從其他網站連過來的瀏覽。')} />
				</Panel>
			</div>
		</>
	)
}

function RecentList({ events, timezone }: { events: RecentEventJson[]; timezone: string }) {
	if (!events.length) return <p className="hint">{t('這段期間還沒有活動。')}</p>
	return (
		<ul className="recent">
			{events.map((event, i) => (
				<li key={`${event.at}-${i}`}>
					<span className="mono">{eventTime(event.at, timezone)}</span>
					<span className={event.kind === 'click' ? 'tag' : 'tag muted'}>{event.kind === 'click' ? t('[event]點擊') : t('[event]瀏覽')}</span>
					<span className="recent-label">{labelText(event)}</span>
					<span className="recent-meta">{[t(sourceLabel(event.source)), placeOf(event), deviceAndBrowser(event)].join(' · ')}</span>
				</li>
			))}
		</ul>
	)
}

function NoClicks({ stats }: { stats: StatsResponse }) {
	const page = usePage()
	const [qrOpen, setQrOpen] = useState(false)
	// Quiet lately, but not new: don't claim nobody ever came.
	const quiet = stats.previous.views + stats.previous.clicks > 0
	const days = stats.days.length
	return (
		<>
			<section className="empty-state st-empty" aria-labelledby="st-empty-title">
				<EmptyArt />
				<h2 id="st-empty-title">{quiet ? t('近 {days} 天沒有人點', { days }) : t('還沒有人點過')}</h2>
				{quiet ? (
					<p>
						{tr('換個長一點的期間看看，或再把 {url} 分享到 IG、Threads 或 LINE。', { url: <span className="st-empty-url">{page.displayUrl}</span> })}
					</p>
				) : (
					<p>
						{tr('把 {url} 貼到 IG、Threads 或 LINE。第一筆點擊進來，這裡就會開始畫圖。', { url: <span className="st-empty-url">{page.displayUrl}</span> })}
					</p>
				)}
				{!page.publishedAt && (
					<p>{tr('這個頁面還沒發布，先到 {link} 按「發布」。', { link: <Link href="/">{t('[nav]頁面')}</Link> })}</p>
				)}
				<div className="st-empty-actions">
					<CopyButton text={page.publicUrl} label={t('複製我的網址')} className="btn primary" />
					<button type="button" className="btn" onClick={() => setQrOpen(true)}>
						<Icon name="qr" size={16} />
						{t('做一張 QR Code')}
					</button>
				</div>
				<p className="st-empty-foot">{t('數據會在點擊後幾秒內出現')}</p>
			</section>
			<Dialog open={qrOpen} title={t('頁面的 QR Code')} onClose={() => setQrOpen(false)}>
				<QrCode value={`${page.publicUrl}?s=qr`} fileName={`qr-${page.handle}`} />
			</Dialog>
		</>
	)
}

function EmptyArt() {
	return (
		<div className="st-empty-art" aria-hidden="true">
			<svg width="240" height="170" viewBox="0 0 240 170" fill="none">
				<path className="axis" d="M20 140H220" strokeWidth="1.5" />
				<path className="grid" d="M20 100H220 M20 60H220" />
				<path className="curve" d="M20 138 C60 138 80 136 110 128 S170 92 200 58" strokeWidth="2.5" strokeLinecap="round" />
				<circle cx="200" cy="58" r="6" strokeWidth="2" />
			</svg>
		</div>
	)
}

/** A label the Worker worded is translated; a link's own title is shown as it is. */
function labelText({ label, labelKey, labelParams }: LabelKey & { label: string }): string {
	return labelKey ? tMessage({ key: labelKey, params: labelParams }) : label
}

function exportCsv(stats: StatsResponse, handle: string): void {
	const visitors = stats.insights?.visitorsByDay
	const rows: (string | number)[][] = [
		[t('日期'), t('頁面瀏覽'), t('連結點擊'), t('點擊率'), t('每日不重複訪客')],
		...stats.days.map((day, i) => {
			const views = stats.views[i] ?? 0
			const clicks = stats.clicks[i] ?? 0
			return [day, views, clicks, views ? ratioText(clicks / views) : '', visitors ? (visitors[day] ?? 0) : '']
		}),
	]
	downloadCsv(rows, `fluxbio-${handle}-${stats.days.length}d.csv`)
}
