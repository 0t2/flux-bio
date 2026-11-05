import { Fragment, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { InsightsJson, RecentEventJson } from '../../shared/api'
import { DEVICE_LABELS } from '../../shared/source'
import { msg, t } from '../i18n'
import { cityName, dateFormat, formatNumber, numberFormat, percent, regionLabel, relativeTime } from '../lib/format'
import { Icon } from './Icon'
import { Segmented } from './ui'
import '../styles/stats.css'

/*
 * Charts, plus the small pieces the 數據 page and the per-link stats page share.
 * Every chart has a text summary for screen readers, and its values can be
 * reached with the keyboard as well as by hovering.
 */

export function Sparkline({ values, color = 'var(--accent)' }: { values: number[]; color?: string }) {
	const width = 72
	const height = 24
	const max = Math.max(1, ...values)
	const step = values.length > 1 ? width / (values.length - 1) : width
	const points = values.map((value, i) => `${(i * step).toFixed(1)},${(height - 2 - (value / max) * (height - 4)).toFixed(1)}`)
	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
			<polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	)
}

/** Horizontal bars; shows each item's share of the total, and with `counts` the number too. */
export function Bars({ items, empty = t('還沒有資料'), counts = false }: { items: { label: string; value: number }[]; empty?: string; counts?: boolean }) {
	const total = items.reduce((sum, item) => sum + item.value, 0)
	const max = Math.max(1, ...items.map((item) => item.value))
	if (!items.length || !total) return <p className="hint">{empty}</p>
	if (counts) {
		return (
			<ul className="st-bars">
				{items.map((item, i) => (
					<li className="st-bar-row" key={`${item.label}-${i}`}>
						<span className="st-bar-label">{item.label}</span>
						<span className="st-bar" aria-hidden="true">
							<i style={{ width: `${(item.value / max) * 100}%` }} />
						</span>
						<span className="st-bar-count">{formatNumber(item.value)}</span>
						<span className="st-bar-share">{share(item.value, total)}</span>
					</li>
				))}
			</ul>
		)
	}
	return (
		<div className="bars">
			{items.map((item) => (
				<div className="bar-row" key={item.label}>
					<span title={item.label}>{item.label}</span>
					<span className="bar">
						<i style={{ width: `${(item.value / max) * 100}%` }} />
					</span>
					<span title={formatNumber(item.value)}>{percent(item.value, total)}</span>
				</div>
			))}
		</div>
	)
}

/** A bar and its number, for table cells. */
export function Meter({ value, max }: { value: number; max: number }) {
	return (
		<span className="st-meter">
			<span className="st-meter-bar" aria-hidden="true">
				<i style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
			</span>
			<span className="st-num">{formatNumber(value)}</span>
		</span>
	)
}

/** One number at the top of a stats page, with what it means under it. */
export function Tile({ label, value, note }: { label: string; value: string; note: string }) {
	return (
		<div className="st-kpi">
			<span className="st-kpi-label">{label}</span>
			<span className="st-kpi-value">{value}</span>
			<span className="st-kpi-note">{note}</span>
		</div>
	)
}

/** Clicks per day; one decimal below 10, so a quiet link reads 0.3 rather than 0. */
export function perDay(total: number, days: number): string {
	const value = days ? total / days : 0
	return value >= 10 ? formatNumber(Math.round(value)) : numberFormat({ maximumFractionDigits: 1 }).format(value)
}

// ---------------------------------------------------------------- trend

/** One series over days: a line over a soft wash, with a crosshair and tooltip on hover or focus. */
export function TrendChart({
	days,
	values,
	name,
	unit = msg('{count} 次'),
	ratio = false,
}: {
	/** "YYYY-MM-DD", oldest first. */
	days: string[]
	/** One value per day; null where there is nothing to show, e.g. a click rate on a day without views. */
	values: (number | null)[]
	/** What is plotted, e.g. "連結點擊". */
	name: string
	/** How one value reads, e.g. "{count} 次"; {count} is the formatted number. */
	unit?: string
	/** Values are shares (0–1), shown as percentages. */
	ratio?: boolean
}) {
	const [hover, setHover] = useState<number | null>(null)
	const [focused, setFocused] = useState<number | null>(null)
	const hits = useRef<(HTMLSpanElement | null)[]>([])
	const n = Math.min(days.length, values.length)
	if (!n) return <p className="hint">{t('還沒有資料')}</p>

	const series = values.slice(0, n)
	const known = series.filter((value): value is number => value !== null)
	const max = Math.max(0, ...known)
	const ticks = niceTicks(max, ratio)
	const top = ticks[ticks.length - 1] || 1
	const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50)
	const y = (value: number) => 100 - (value / top) * 100
	const plain = (value: number) => (ratio ? ratioText(value) : formatNumber(value))
	const spoken = (value: number | null) => (value === null ? t('沒有資料') : ratio ? ratioText(value) : t(unit, { count: formatNumber(value) }))
	const tickText = (value: number) => (ratio ? `${Number((value * 100).toFixed(1))}%` : top >= 10_000 ? compact().format(value) : formatNumber(value))
	const { line, area, dots } = trendPaths(series, x, y)
	const last = series.findLastIndex((value) => value !== null)
	const lastValue = series[last] ?? null
	const peak = series.indexOf(max)
	const summary = !known.length
		? t('{name}，近 {days} 天沒有資料。', { name, days: n })
		: max === 0
			? t('{name}，近 {days} 天每天都是 0。', { name, days: n })
			: t('{name}，近 {days} 天每日趨勢。最高是 {peakDay}的 {peak}，最近一天 {last}。', {
					name,
					days: n,
					peakDay: dayLabel(days[peak] ?? ''),
					peak: spoken(max),
					last: spoken(lastValue),
				})
	const active = hover ?? focused
	const activeValue = active === null ? null : (series[active] ?? null)
	const xTicks = n <= 7 ? [0, 2, 4, 6].filter((i) => i < n) : [...new Set([0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1])]
	// Each day's focus target is centered on its point, halfway to the neighbors.
	const half = n > 1 ? 50 / (n - 1) : 50
	const band = (i: number) => {
		const start = Math.max(0, x(i) - half)
		return { left: `${start}%`, width: `${Math.min(100, x(i) + half) - start}%` }
	}

	const track = (event: PointerEvent<HTMLDivElement>) => {
		const box = event.currentTarget.getBoundingClientRect()
		if (!box.width) return
		const at = Math.round(((event.clientX - box.left) / box.width) * (n - 1))
		setHover(Math.max(0, Math.min(n - 1, at)))
	}
	const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const from = focused ?? n - 1
		const moves: Partial<Record<string, number>> = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: n - 1, PageUp: from - 7, PageDown: from + 7 }
		const next = moves[event.key]
		if (next === undefined) return
		event.preventDefault()
		hits.current[Math.max(0, Math.min(n - 1, next))]?.focus()
	}
	const onBlur = (event: FocusEvent<HTMLDivElement>) => {
		if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null)
	}

	return (
		<div className="st-trend">
			<div
				className="st-plot"
				onPointerMove={track}
				onPointerDown={track}
				onPointerLeave={(event) => {
					if (event.pointerType === 'mouse') setHover(null)
				}}
				onPointerCancel={() => setHover(null)}
			>
				<div className="st-gridlines" aria-hidden="true">
					{ticks.map((tick) => (
						<div key={tick} className={tick ? 'st-gridline' : 'st-gridline base'} style={{ top: `${y(tick)}%` }}>
							<span>{tickText(tick)}</span>
						</div>
					))}
				</div>
				<svg className="st-lines" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={summary}>
					<path className="st-area" d={area} />
					<path className="st-line" d={line} />
				</svg>
				<div className="st-marks" aria-hidden="true">
					{dots.map((point) => (
						<span key={point.i} className="st-dot small" style={{ left: `${x(point.i)}%`, top: `${y(point.value)}%` }} />
					))}
					{active === null ? (
						lastValue !== null && (
							<>
								<span className="st-dot" style={{ left: `${x(last)}%`, top: `${y(lastValue)}%` }} />
								<span
									className={['st-end', x(last) < 25 && 'start', y(lastValue) < 20 && 'below'].filter(Boolean).join(' ')}
									style={{ left: `${x(last)}%`, top: `${y(lastValue)}%` }}
								>
									<span>{shortDate(days[last] ?? '')}</span>
									<b>{plain(lastValue)}</b>
								</span>
							</>
						)
					) : (
						<>
							<span className="st-cross" style={{ left: `${x(active)}%` }} />
							{activeValue !== null && <span className="st-dot" style={{ left: `${x(active)}%`, top: `${y(activeValue)}%` }} />}
							<span className={x(active) > 70 ? 'st-tip flip' : 'st-tip'} style={{ left: `${x(active)}%` }}>
								<strong>
									<i />
									{spoken(activeValue)}
								</strong>
								{/* e.g. "10/31（六）連結點擊": the day, then what is plotted. */}
								<span>{t('{day}{name}', { day: dayLabel(days[active] ?? ''), name })}</span>
							</span>
						</>
					)}
				</div>
				{/* One focusable point per day; arrow keys move between them. Mouse clicks don't take focus. */}
				<div className="st-hits" role="group" aria-label={t('{name}每日數值，可用左右方向鍵查看', { name })} onKeyDown={onKey} onBlur={onBlur} onMouseDown={(event) => event.preventDefault()}>
					{series.map((value, i) => (
						<span
							key={days[i]}
							ref={(element) => {
								hits.current[i] = element
							}}
							className="st-hit"
							style={band(i)}
							role="img"
							tabIndex={i === (focused ?? n - 1) ? 0 : -1}
							aria-label={`${dayLabel(days[i] ?? '')} ${name} ${spoken(value)}`}
							onFocus={() => {
								setHover(null)
								setFocused(i)
							}}
						/>
					))}
				</div>
			</div>
			<div className="st-xaxis" aria-hidden="true">
				{xTicks.map((i) => (
					<span key={i} className={i === 0 ? 'start' : i === n - 1 ? 'end' : undefined} style={{ left: `${x(i)}%` }}>
						{shortDate(days[i] ?? '')}
					</span>
				))}
			</div>
		</div>
	)
}

/** Round ticks from 0 to just past `max`, e.g. 0 / 25 / 50 / 75 / 100; counts never get fractional ticks. */
function niceTicks(max: number, ratio: boolean): number[] {
	if (!(max > 0)) return ratio ? [0, 0.05, 0.1] : [0, 1, 2]
	const rough = max / 4
	const power = 10 ** Math.floor(Math.log10(rough))
	const steps = [1, 2, 2.5, 5, 10].map((factor) => factor * power).filter((step) => ratio || Number.isInteger(step))
	const step = Math.max(ratio ? 0 : 1, steps.find((candidate) => candidate >= rough) ?? 10 * power)
	return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, i) => i * step)
}

interface Point {
	i: number
	value: number
}

/** Line and wash paths in a 0–100 box. A missing day breaks the line; a lone day becomes a dot. */
function trendPaths(values: (number | null)[], x: (i: number) => number, y: (value: number) => number) {
	const runs: Point[][] = []
	let run: Point[] = []
	for (const [i, value] of values.entries()) {
		if (value !== null) {
			run.push({ i, value })
			continue
		}
		if (run.length) runs.push(run)
		run = []
	}
	if (run.length) runs.push(run)
	const at = (point: Point) => `${x(point.i).toFixed(2)} ${y(point.value).toFixed(2)}`
	const drawn = runs.filter((points) => points.length > 1)
	return {
		line: drawn.map((points) => `M${points.map(at).join('L')}`).join(''),
		area: drawn
			.map((points) => {
				const first = points[0]
				const end = points[points.length - 1]
				return first && end ? `M${x(first.i).toFixed(2)} 100L${points.map(at).join('L')}L${x(end.i).toFixed(2)} 100Z` : ''
			})
			.join(''),
		dots: runs.filter((points) => points.length === 1).flat(),
	}
}

// ---------------------------------------------------------------- heatmap

const WEEK = [msg('週一'), msg('週二'), msg('週三'), msg('週四'), msg('週五'), msg('週六'), msg('週日')]
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const LEVELS = [0, 1, 2, 3, 4, 5]

/** Clicks by weekday (rows, Monday first) × hour, with a readout of the cell under the pointer or focus. */
export function Heatmap({ values }: { values: number[][] }) {
	const [hover, setHover] = useState<number | null>(null)
	const [focused, setFocused] = useState<number | null>(null)
	const cells = useRef<(HTMLSpanElement | null)[]>([])
	const counts = WEEK.flatMap((_, day) => HOURS.map((hour) => values[day]?.[hour] ?? 0))
	const max = Math.max(0, ...counts)
	const total = counts.reduce((sum, count) => sum + count, 0)
	const peak = max ? counts.indexOf(max) : null
	const describe = (index: number) =>
		t('{day} {time}・{count} 次點擊', {
			day: t(WEEK[Math.floor(index / 24)] ?? ''),
			time: `${String(index % 24).padStart(2, '0')}:00`,
			count: formatNumber(counts[index] ?? 0),
		})
	const level = (count: number) => (count && max ? 1 + Math.min(4, Math.floor((count / max) * 5)) : 0)
	const active = hover ?? focused
	const stop = focused ?? peak ?? 0
	const readout = active !== null ? describe(active) : peak !== null ? t('最多人點：{time}', { time: describe(peak) }) : t('這段期間還沒有點擊')
	const summary =
		peak === null
			? t('點擊時段：這段期間還沒有點擊。')
			: t('點擊時段，週一到週日每小時的點擊數，共 {total} 次。最多人點的是{peak}。', { total: formatNumber(total), peak: describe(peak) })

	const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const from = focused ?? stop
		const hour = from % 24
		const day = Math.floor(from / 24)
		const moves: Partial<Record<string, number>> = {
			ArrowLeft: hour > 0 ? from - 1 : from,
			ArrowRight: hour < 23 ? from + 1 : from,
			ArrowUp: day > 0 ? from - 24 : from,
			ArrowDown: day < 6 ? from + 24 : from,
			Home: from - hour,
			End: from - hour + 23,
		}
		const next = moves[event.key]
		if (next === undefined) return
		event.preventDefault()
		cells.current[next]?.focus()
	}
	const onBlur = (event: FocusEvent<HTMLDivElement>) => {
		if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null)
	}
	// A touch stays with the cell it started on, so find the cell under the finger instead.
	const onTouchMove = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === 'mouse') return
		const cell = document.elementFromPoint(event.clientX, event.clientY)
		const index = cell instanceof HTMLElement && cell.dataset.index ? Number(cell.dataset.index) : null
		if (index !== null) setHover(index)
	}

	return (
		<div className="st-heatmap">
			<div className="st-heat-head">
				<p className="hint st-heat-readout">{readout}</p>
				<div className="st-legend" aria-hidden="true">
					<span>{t('少')}</span>
					{LEVELS.map((step) => (
						<i key={step} data-level={step} />
					))}
					<span>{t('多')}</span>
				</div>
			</div>
			<div className="st-heat-scroll">
				<div className="st-heat-board">
					<div className="st-heat-grid" role="img" aria-label={summary}>
						{WEEK.map((day, row) => (
							<Fragment key={day}>
								<span className="st-heat-day">{t(day)}</span>
								{HOURS.map((hour) => {
									const index = row * 24 + hour
									return <span key={hour} className="st-heat-cell" data-level={level(counts[index] ?? 0)} data-on={active === index || undefined} />
								})}
							</Fragment>
						))}
						<span />
						{HOURS.map((hour) => (
							<span key={hour} className="st-heat-hour">
								{hour % 3 ? '' : hour}
							</span>
						))}
					</div>
					{/* The same grid again, on top and transparent: these are the cells you can focus. */}
					<div
						className="st-heat-grid st-heat-hits"
						role="group"
						aria-label={t('各時段的點擊數，可用方向鍵移動')}
						onKeyDown={onKey}
						onBlur={onBlur}
						onMouseDown={(event) => event.preventDefault()}
						onPointerMove={onTouchMove}
						onPointerLeave={(event) => {
							if (event.pointerType === 'mouse') setHover(null)
						}}
					>
						{WEEK.map((day, row) => (
							<Fragment key={day}>
								<span />
								{HOURS.map((hour) => {
									const index = row * 24 + hour
									return (
										<span
											key={hour}
											ref={(element) => {
												cells.current[index] = element
											}}
											className="st-heat-hit"
											data-index={index}
											role="img"
											tabIndex={index === stop ? 0 : -1}
											aria-label={describe(index)}
											onPointerEnter={() => setHover(index)}
											onFocus={() => {
												setHover(null)
												setFocused(index)
											}}
										/>
									)
								})}
							</Fragment>
						))}
					</div>
				</div>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------- campaigns

type Campaign = InsightsJson['campaigns'][number]

/**
 * Visits and clicks by their UTM tags. On a short link's page only clicks are
 * counted, so `views` is false there. The utm_content column shows only when
 * some row has one.
 */
export function CampaignTable({ items, views = true, empty }: { items: Campaign[]; views?: boolean; empty: string }) {
	if (!items.length) return <p className="hint">{empty}</p>
	const content = items.some((item) => item.content)
	const max = Math.max(1, ...items.map((item) => item.clicks))
	return (
		<div className="st-table-wrap">
			<table className="st-table st-utm">
				<thead>
					<tr>
						<th scope="col">utm_campaign</th>
						{content && <th scope="col">utm_content</th>}
						<th scope="col">source / medium</th>
						{views && (
							<th scope="col" className="st-num">
								{t('[count]瀏覽')}
							</th>
						)}
						<th scope="col" className={views ? 'st-num' : 'st-utm-count'}>
							{t('點擊')}
						</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item, i) => (
						<tr key={`${item.campaign}|${item.content}|${item.source}|${item.medium}|${i}`}>
							<td className="st-utm-tag">{item.campaign || '—'}</td>
							{content && <td className="st-utm-tag">{item.content || '—'}</td>}
							<td className="st-utm-tag st-soft">{[item.source, item.medium].filter(Boolean).join(' / ') || '—'}</td>
							{views && <td className="st-num">{formatNumber(item.views)}</td>}
							<td className={views ? 'st-num' : undefined}>{views ? formatNumber(item.clicks) : <Meter value={item.clicks} max={max} />}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

// ---------------------------------------------------------------- layout pieces

export type Days = 7 | 30 | 90

const PERIODS: readonly Days[] = [7, 30, 90]

export function PeriodPicker({ value, onChange }: { value: Days; onChange: (days: Days) => void }) {
	const options = PERIODS.map((days) => ({ value: days, label: t('近 {days} 天', { days }) }))
	return (
		<div className="st-seg st-period">
			<Segmented label={t('期間')} options={options} value={value} onChange={onChange} />
		</div>
	)
}

/** A card with a title, an optional one-line note under it and an action on the right. */
export function Panel({ title, note, action, className, children }: { title: string; note?: string; action?: ReactNode; className?: string; children: ReactNode }) {
	const id = useId()
	return (
		<section className={className ? `section st-panel ${className}` : 'section st-panel'} aria-labelledby={id}>
			<div className="st-panel-head">
				<div className="st-panel-titles">
					<h2 id={id} className="section-title">
						{title}
					</h2>
					{note && <p className="hint">{note}</p>}
				</div>
				{action}
			</div>
			{children}
		</section>
	)
}

/** Shown when `insights` is null: in local development, or when Analytics Engine didn't answer. */
export function InsightsNote({ analytics }: { analytics: boolean }) {
	return (
		<div className="banner st-info" role="note">
			<Icon name="info" size={18} />
			<p>
				{analytics
					? t('不重複訪客、地區、裝置、時段暫時讀不到（來自 Cloudflare Analytics Engine），請稍後再看；瀏覽和點擊次數不受影響。')
					: t('不重複訪客、地區、裝置、時段來自 Cloudflare Analytics Engine，部署到 Cloudflare 後就會出現。現在先顯示 D1 記下的瀏覽和點擊次數。')}
			</p>
		</div>
	)
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
	return (
		<div className="banner st-error" role="alert">
			<span>{message}</span>
			<button type="button" className="btn" onClick={onRetry}>
				{t('重試')}
			</button>
		</div>
	)
}

// ---------------------------------------------------------------- labels

const oneDecimal = () => numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 })
const compact = () => numberFormat({ notation: 'compact', maximumFractionDigits: 1 })

/** 0.382 → "38.2%". */
export const ratioText = (value: number): string => `${oneDecimal().format(value * 100)}%`

/** A share as a whole percentage; a small but non-zero share reads "<1%" rather than "0%". */
function share(part: number, whole: number): string {
	if (!whole || !part) return '0%'
	const value = (part / whole) * 100
	return value < 1 ? '<1%' : `${Math.round(value)}%`
}

// One key per weekday, Sunday first, so each language can place the weekday itself.
const WEEKDAYS = [msg('{date}（日）'), msg('{date}（一）'), msg('{date}（二）'), msg('{date}（三）'), msg('{date}（四）'), msg('{date}（五）'), msg('{date}（六）')]

/** "2026-10-31" → "10/31" (in the dashboard's language: "31.10." in German). */
export function shortDate(day: string): string {
	const ms = Date.parse(`${day}T00:00:00Z`)
	return Number.isFinite(ms) ? dateFormat({ month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(ms) : day
}

/** "2026-10-31" → "10/31（六）". */
export function dayLabel(day: string): string {
	const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]
	return weekday ? t(weekday, { date: shortDate(day) }) : shortDate(day)
}

/** Analytics Engine reports times in UTC without a zone, e.g. "2026-10-31 06:01:02". */
export function eventTime(at: string, timeZone: string): string {
	const iso = at.includes('T') ? at : at.replace(' ', 'T')
	const ms = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`)
	if (!Number.isFinite(ms)) return at
	try {
		return relativeTime(ms, timeZone)
	} catch {
		// A zone this browser doesn't know: fall back to the browser's own.
		return relativeTime(ms)
	}
}

export function deviceLabel(device: string): string {
	const label = (DEVICE_LABELS as Partial<Record<string, string>>)[device]
	return label ? t(label) : device || t('其他裝置')
}

const IN_APP: Partial<Record<string, string>> = { Instagram: msg('IG App 內'), Threads: msg('Threads App 內'), Facebook: msg('FB App 內'), LINE: msg('LINE App 內') }

/** In-app browsers read as the app they live in: "Instagram" → "IG App 內". */
export function browserLabel(browser: string): string {
	const inApp = IN_APP[browser]
	return inApp ? t(inApp) : browser && browser !== 'Other' ? browser : t('其他瀏覽器')
}

const SYSTEMS: Partial<Record<string, string>> = { Android: 'Android', Windows: 'Windows', macOS: 'Mac', ChromeOS: 'ChromeOS', Linux: 'Linux' }

/** "iPhone · IG App 內": the phone or system, then the browser. */
export function deviceAndBrowser(event: Pick<RecentEventJson, 'device' | 'os' | 'browser'>): string {
	const system = event.os === 'iOS' ? (event.device === 'tablet' ? 'iPad' : 'iPhone') : (SYSTEMS[event.os] ?? deviceLabel(event.device))
	return `${system} · ${browserLabel(event.browser)}`
}

/** Where a visit came from: the region when Cloudflare knows it, else the city or the country. */
export function placeOf(event: Pick<RecentEventJson, 'country' | 'region' | 'city'>): string {
	if (event.region) return regionLabel(event.country, event.region)
	if (event.city) return cityName(`${event.country}:${event.city}`)
	return regionLabel(event.country, '')
}
