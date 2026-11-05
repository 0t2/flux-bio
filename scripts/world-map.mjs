// Generates src/admin/components/worldMap.ts, the land outline behind the
// visitor map on the stats pages, from Natural Earth's 1:50m land polygons
// (public domain, naturalearthdata.com) as packaged by world-atlas (ISC).
//
//   npm pack world-atlas@2.0.2 && tar xzf world-atlas-2.0.2.tgz
//   node scripts/world-map.mjs package/land-50m.json
//
// The outline is projected to Web Mercator and simplified, so the dashboard
// only has to set an SVG viewBox to zoom in on wherever the visitors are.

import { readFileSync, writeFileSync } from 'node:fs'

/** Map units per degree of longitude: 1 unit is 0.05°, about 5 km at the equator. */
const UNITS = 20
/** Points closer than this to the simplified line are dropped, in map units. */
const TOLERANCE = 0.8
/** Rings smaller than this many square units are left out (tiny islands). */
const MIN_AREA = 3
/** Mercator stretches toward the poles; nobody visits from beyond these. */
const NORTH = 78
const SOUTH = -56

const source = process.argv[2]
if (!source) throw new Error('usage: node scripts/world-map.mjs <land-50m.json>')
const topology = JSON.parse(readFileSync(source, 'utf8'))

const mercator = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI
const TOP = mercator(NORTH)
const WIDTH = 360 * UNITS
const HEIGHT = Math.round((TOP - mercator(SOUTH)) * UNITS)

function project([lon, lat]) {
	const clamped = Math.max(SOUTH, Math.min(NORTH, lat))
	return [(lon + 180) * UNITS, (TOP - mercator(clamped)) * UNITS]
}

// TopoJSON arcs are quantized and delta-encoded.
const [sx, sy] = topology.transform.scale
const [tx, ty] = topology.transform.translate
const arcs = topology.arcs.map((arc) => {
	let x = 0
	let y = 0
	return arc.map(([dx, dy]) => {
		x += dx
		y += dy
		return [x * sx + tx, y * sy + ty]
	})
})

function ring(indexes) {
	const points = []
	for (const index of indexes) {
		const arc = index < 0 ? [...arcs[~index]].reverse() : arcs[index]
		points.push(...(points.length ? arc.slice(1) : arc))
	}
	return points
}

function polygons(geometry) {
	if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(polygons)
	if (geometry.type === 'Polygon') return [geometry.arcs.map(ring)]
	if (geometry.type === 'MultiPolygon') return geometry.arcs.map((polygon) => polygon.map(ring))
	return []
}

function distance([px, py], [ax, ay], [bx, by]) {
	const dx = bx - ax
	const dy = by - ay
	const length = dx * dx + dy * dy
	const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function simplify(points) {
	const keep = new Uint8Array(points.length)
	keep[0] = keep[points.length - 1] = 1
	const stack = [[0, points.length - 1]]
	while (stack.length) {
		const [first, last] = stack.pop()
		let farthest = 0
		let index = -1
		for (let i = first + 1; i < last; i++) {
			const d = distance(points[i], points[first], points[last])
			if (d > farthest) {
				farthest = d
				index = i
			}
		}
		if (index >= 0 && farthest > TOLERANCE) {
			keep[index] = 1
			stack.push([first, index], [index, last])
		}
	}
	return points.filter((_, i) => keep[i])
}

const area = (points) => Math.abs(points.reduce((sum, [x, y], i) => {
	const [nx, ny] = points[(i + 1) % points.length]
	return sum + x * ny - nx * y
}, 0)) / 2

/** Sutherland–Hodgman: the part of a ring on one side of a meridian. */
function clip(points, meridian, keepEast) {
	const inside = ([lon]) => (keepEast ? lon >= meridian : lon <= meridian)
	const cross = ([ax, ay], [bx, by]) => [meridian, ay + ((meridian - ax) / (bx - ax)) * (by - ay)]
	const out = []
	points.forEach((point, i) => {
		const previous = points.at(i - 1)
		if (inside(point)) {
			if (!inside(previous)) out.push(cross(previous, point))
			out.push(point)
		} else if (inside(previous)) out.push(cross(previous, point))
	})
	return out
}

/**
 * Rings that cross the antimeridian (eastern Russia, Fiji) jump from 180° to
 * −180°. Unwrap them so they run on past the edge, then cut them at the edge
 * and move the part beyond it to the other side of the map.
 */
function unwrap(points) {
	let shift = 0
	let previous = points[0][0]
	const unwrapped = points.map(([lon, lat]) => {
		const step = lon + shift - previous
		if (step > 180) shift -= 360
		else if (step < -180) shift += 360
		previous = lon + shift
		return [lon + shift, lat]
	})
	if (unwrapped.every(([lon]) => lon >= -180 && lon <= 180)) return [unwrapped]
	const east = unwrapped.some(([lon]) => lon > 180)
	const offset = east ? -360 : 360
	return [
		clip(unwrapped, east ? 180 : -180, !east),
		clip(unwrapped.map(([lon, lat]) => [lon + offset, lat]), east ? -180 : 180, east),
	].filter((ring) => ring.length >= 3)
}

let path = ''
let count = 0
for (const polygon of polygons(topology.objects.land)) {
	for (const points of polygon.flatMap(unwrap)) {
		const lats = points.map(([, lat]) => lat)
		if (Math.max(...lats) < SOUTH) continue
		const projected = points.map(project)
		if (area(projected) < MIN_AREA) continue
		const simple = simplify(projected).map(([x, y]) => [Math.round(x), Math.round(y)])
		// Drop repeats left by rounding, and the closing point (Z closes the ring).
		const unique = simple.filter(([x, y], i) => i === 0 || x !== simple[i - 1][0] || y !== simple[i - 1][1])
		if (unique.length > 1 && unique[0][0] === unique.at(-1)[0] && unique[0][1] === unique.at(-1)[1]) unique.pop()
		if (unique.length < 3) continue
		let [x, y] = unique[0]
		let segment = `M${x} ${y}l`
		for (const [nx, ny] of unique.slice(1)) {
			segment += `${segment.endsWith('l') ? '' : ' '}${nx - x}${ny - y < 0 ? '' : ' '}${ny - y}`
			x = nx
			y = ny
		}
		path += `${segment}z`
		count += unique.length
	}
}

writeFileSync(
	'src/admin/components/worldMap.ts',
	`// Generated by scripts/world-map.mjs from Natural Earth's 1:50m land (public domain). Don't edit.

/** Web Mercator: x = (longitude + 180) × UNITS, y = (mercator(NORTH) − mercator(latitude)) × UNITS. */
export const WORLD = { units: ${UNITS}, north: ${NORTH}, south: ${SOUTH}, width: ${WIDTH}, height: ${HEIGHT} } as const

export const LAND = '${path}'
`,
)
console.log(`${count} points, ${(path.length / 1024).toFixed(0)} KB`)
