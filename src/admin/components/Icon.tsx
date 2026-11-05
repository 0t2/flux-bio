import type { CSSProperties } from 'react'
import { ICONS, logoSvg, type IconName } from '../../templates/icons'

/** Arrows that point along the line of text, so they turn round in a language written right to left. */
const ALONG_THE_LINE = new Set<IconName>(['arrowRight', 'arrowUpRight', 'shortlink', 'sidebar'])

export function Icon({
	name,
	size = 18,
	stroke = 1.8,
	style,
}: {
	name: IconName
	size?: number
	stroke?: number
	style?: CSSProperties
}) {
	return (
		<svg
			className={ALONG_THE_LINE.has(name) ? 'along-line' : undefined}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{ flex: '0 0 auto', ...style }}
			// The markup is a fixed string from ICONS, never user input.
			dangerouslySetInnerHTML={{ __html: ICONS[name] }}
		/>
	)
}

export function Logo({ size = 26 }: { size?: number }) {
	return <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: logoSvg(size) }} />
}
