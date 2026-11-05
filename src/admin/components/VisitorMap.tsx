import type { InsightsJson } from '../../shared/api'
import { t } from '../i18n'
import { cityName, formatNumber, regionName } from '../lib/format'
import { LAND, WORLD } from './worldMap'

// Where visitors were, as dots on a land outline. Cloudflare places each IP in
// a town and the Worker keeps that to 0.1°, so a dot is a town, never an address.
// The map zooms to the dots; the outline is a Web Mercator path (worldMap.ts).

type Point = InsightsJson['points'][number]

/** Width ÷ height, matched by .st-map's aspect-ratio. */
const ASPECT = 2
/** Never zoom in closer than this many degrees of longitude, so one town still shows where it is. */
const MIN_SPAN = 14
const PADDING = 1.3

const mercator = (lat: number) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI
const TOP = mercator(WORLD.north)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function project(point: Point): { x: number; y: number } {
	const lat = clamp(point.lat, WORLD.south, WORLD.north)
	return { x: (point.lon + 180) * WORLD.units, y: (TOP - mercator(lat)) * WORLD.units }
}

/** The part of the world that holds every dot, padded, at the map's aspect ratio. */
function frame(spots: { x: number; y: number }[]) {
	const xs = spots.map((spot) => spot.x)
	const ys = spots.map((spot) => spot.y)
	const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
	let width = Math.max((maxX - minX) * PADDING, (maxY - minY) * PADDING * ASPECT, MIN_SPAN * WORLD.units)
	width = Math.min(width, WORLD.width)
	const height = width / ASPECT
	const x = clamp((minX + maxX - width) / 2, 0, WORLD.width - width)
	const y = height >= WORLD.height ? (WORLD.height - height) / 2 : clamp((minY + maxY - height) / 2, 0, WORLD.height - height)
	return { x, y, width, height }
}

const placeName = (point: Point) => (point.city ? cityName(`${point.country}:${point.city}`) : regionName(point.country))

export function VisitorMap({ points, empty }: { points: Point[]; empty: string }) {
	if (!points.length) return <p className="hint">{empty}</p>
	const spots = points.map((point) => ({ point, ...project(point) }))
	const view = frame(spots)
	const max = Math.max(...points.map((point) => point.count))
	return (
		<div className="st-map" role="img" aria-label={t('訪客分布地圖：{count} 個地點', { count: points.length })}>
			<svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-hidden="true">
				<path d={LAND} />
			</svg>
			{/* Largest first, so smaller dots stay on top and can be hovered. */}
			{spots.map(({ point, x, y }) => {
				const size = Math.round(6 + 22 * Math.sqrt(point.count / max))
				return (
					<span
						key={`${point.lat},${point.lon}`}
						className="st-map-dot"
						title={`${placeName(point)} · ${formatNumber(point.count)}`}
						style={{ left: `${((x - view.x) / view.width) * 100}%`, top: `${((y - view.y) / view.height) * 100}%`, width: size, height: size }}
					/>
				)
			})}
		</div>
	)
}
