import type { LinkIcon, LinkItem, SocialPlatform } from '../shared/content'
import { msg } from './msg'

/** Inner markup of 24×24 stroke icons. They inherit `currentColor`. */
export const ICONS = {
	link: '<path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6"/>',
	palette:
		'<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.9 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-1.9 2-1.9h2.2A4.8 4.8 0 0 0 21 9.8C21 6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/>',
	shortlink: '<path d="M3 12h11"/><path d="M10 7l5 5-5 5"/><path d="M20 5v14"/>',
	sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9.5 4v16"/>',
	chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
	sliders:
		'<path d="M4 6h9"/><path d="M19 6h1"/><path d="M4 12h3"/><path d="M13 12h7"/><path d="M4 18h11"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
	copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
	check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
	search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
	qr: '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2v2h-2z"/><path d="M18.5 18.5h2v2h-2z"/><path d="M18.5 14.5h2"/><path d="M14.5 20.5h2"/>',
	arrowRight: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
	arrowUpRight: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
	arrowDown: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
	plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
	close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
	trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
	grip: '<path d="M9 6h.01"/><path d="M15 6h.01"/><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M9 18h.01"/><path d="M15 18h.01"/>',
	chevronDown: '<path d="M6 9l6 6 6-6"/>',
	upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
	eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
	eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.4 16.4 0 0 1-3 3.7"/><path d="M6.5 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
	logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
	lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
	clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
	// Blocks and dashboard
	image: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><path d="M15.5 8.5h.01"/>',
	bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
	map: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.2"/>',
	phone: '<path d="M6.6 3.5h2.6l1.6 4-2 1.3a11 11 0 0 0 6.4 6.4l1.3-2 4 1.6v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
	heading: '<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/>',
	arrowUp: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
	more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
	download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
	home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
	layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
	key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M17 6l3 3"/><path d="M15 8l2 2"/>',
	bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
	zap: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>',
	smartphone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
	refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
	alert: '<path d="M12 4l9.5 16h-19z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
	table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17"/><path d="M3.5 14.5h17"/><path d="M9.5 9.5v10"/>',
	edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
	info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
	shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/>',
	// Link and platform icons
	play: '<circle cx="12" cy="12" r="9.5"/><path d="M10 8.5v7l5.5-3.5z"/>',
	camera: '<path d="M14.5 4.5h-5L7.6 7H4.5A1.5 1.5 0 0 0 3 8.5v10A1.5 1.5 0 0 0 4.5 20h15a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 19.5 7h-3.1z"/><circle cx="12" cy="13" r="3.5"/>',
	// LINE's own mark, filled, so it reads as LINE at any size.
	line: '<path fill="currentColor" stroke="none" d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>',
	threads: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>',
	chat: '<path d="M21 11.3c0 4.3-4 7.7-9 7.7-1 0-2-.1-2.9-.4L5 20.5l.9-3.4C4.1 15.7 3 13.6 3 11.3 3 7 7 3.5 12 3.5s9 3.5 9 7.8z"/>',
	video: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
	doc: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><path d="M9 13h6"/><path d="M9 16.5h4"/>',
	briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18"/>',
	mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
	shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
	music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
	calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
	gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8"/><path d="M12 8v12"/><path d="M12 8C10.5 5 7 4.5 7 6.8 7 8 9 8 12 8zM12 8c1.5-3 5-3.5 5-1.2C17 8 15 8 12 8z"/>',
	heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
	star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
	globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
	book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
	mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
	facebook: '<path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z"/>',
	x: '<path d="M4.5 4h4l11 16h-4z"/><path d="M19.5 4l-6.3 7.2"/><path d="M10.8 12.8L4.5 20"/>',
	tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.8 2.4 4.6 5 5"/>',
	github:
		'<path d="M9 19c-4 1.3-4-2-6-2.5"/><path d="M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
} as const satisfies Record<string, string>

export type IconName = keyof typeof ICONS

export function iconSvg(name: IconName, size = 20, strokeWidth = 1.8): string {
	return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

/**
 * The FluxBio mark: an octopus, one body with many arms, as one link goes out to everything.
 * Drawn in a 32×32 box with the eyes cut out, so fill it with fill-rule evenodd. This is the one source of
 * the logo: `pnpm brand` makes the favicon, the app icons and the landing page's pictures from it.
 */
export const LOGO_PATH = 'M14.85 3.01C13.11 3.3,11.57 4.11,10.4 5.37C7.84 8.12,7.72 12.06,10.12 14.52C10.34 14.75,10.53 14.94,10.53 14.95C10.53 14.95,10.33 14.96,10.08 14.98C7.82 15.12,5.58 13.96,5.11 12.42C4.95 11.9,5.04 11.58,5.47 11.05C6.11 10.26,5.94 9.35,5.09 9.04C3.8 8.55,2.33 10.24,2.51 12C2.83 15.09,6.51 17.34,10.23 16.71C10.68 16.64,9.14 17.48,8.24 17.8C6.61 18.39,5.12 18.29,3.86 17.5C3.03 16.99,2.58 16.9,2.02 17.15C1.2 17.51,1 18.5,1.6 19.26C2.45 20.34,5.08 20.65,7.68 20C8.24 19.85,9.01 19.58,10.03 19.17C11.17 18.7,11.47 18.59,11.47 18.63C11.47 18.78,10.57 19.9,10.15 20.27C8.59 21.65,6.93 22.18,4.64 22.03C4.05 21.99,3.81 21.99,3.62 22.03C1.9 22.34,1.98 24.54,3.71 24.63C4.94 24.69,7.75 23.97,9.27 23.21C10.53 22.58,12.07 21.34,12.78 20.4C13.02 20.07,13.03 20.08,13 20.82C12.9 23.86,10.94 26.31,9.07 25.74C7.78 25.35,6.72 26.57,7.33 27.76C7.85 28.79,9.62 28.97,11.25 28.16C13.51 27.05,15.04 24.54,15.84 20.66C15.87 20.49,15.92 20.49,15.95 20.68C16.11 21.55,16.46 22.86,16.68 23.45C16.74 23.61,16.84 23.85,16.88 23.98C17.38 25.26,18.37 26.68,19.33 27.46C21.38 29.12,24.01 29.1,24.49 27.42C24.81 26.32,23.7 25.36,22.57 25.76C21.18 26.25,19.54 24.71,18.95 22.39C18.75 21.59,18.68 20.41,18.83 20.41C18.86 20.41,19.04 20.61,19.23 20.85C20.65 22.59,22.6 23.83,24.78 24.38C25.96 24.68,27.48 24.79,28.2 24.63C29.77 24.29,29.7 22.29,28.11 22.03C27.94 22,27.65 22.01,26.96 22.08C24.66 22.29,23.06 21.78,21.59 20.35C21.08 19.87,20.21 18.69,20.29 18.61C20.3 18.6,20.74 18.81,21.27 19.08C22.66 19.78,23.58 20.12,24.61 20.33C26.74 20.75,29.1 20.36,30.04 19.42C31 18.47,30.5 17.11,29.19 17.11C28.73 17.11,28.57 17.17,27.96 17.56C27.42 17.91,27.06 18.07,26.42 18.24C25.15 18.56,23.37 18.13,21.96 17.15C21.42 16.77,21.38 16.72,21.7 16.75C23.63 16.93,25.09 16.67,26.44 15.91C29.1 14.4,30.07 11.33,28.43 9.59C27.44 8.54,25.92 8.87,25.92 10.14C25.92 10.52,25.99 10.69,26.34 11.1C26.66 11.49,26.74 11.7,26.71 12.09C26.63 13.36,24.96 14.62,22.99 14.92C22.65 14.98,21.26 15,21.21 14.96C21.2 14.95,21.37 14.75,21.6 14.52C25.05 10.98,23.04 4.81,17.9 3.23C17.1 2.99,15.67 2.88,14.85 3.01M11.74 11.42a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0ZM17.44 11.42a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0Z'
export const LOGO_INK = '#131416'
export const LOGO_LIME = '#CCFF4D'

/** The mark itself: ink, with lime eyes showing through from beneath. */
export function logoSvg(size = 26): string {
	return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="12.99" cy="11.42" r="1.6" fill="${LOGO_LIME}"/><circle cx="18.69" cy="11.42" r="1.6" fill="${LOGO_LIME}"/><path d="${LOGO_PATH}" fill="${LOGO_INK}" fill-rule="evenodd"/></svg>`
}

/**
 * The mark on a lime rounded square, for where it may land on any color: the favicon, a QR code.
 * `inset` is the margin around the square, in a 32×32 box.
 */
export function logoTile(inset = 0): string {
	const side = 32 - inset * 2
	const scale = (side * 0.8) / 32
	const at = inset + side * 0.1
	return `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${side * 0.22}" fill="${LOGO_LIME}"/><path transform="translate(${at} ${at}) scale(${scale})" d="${LOGO_PATH}" fill="${LOGO_INK}" fill-rule="evenodd"/>`
}

/** The mark alone in `currentColor`, beside the address on system pages. */
export function badgeMarkSvg(size = 14): string {
	return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="${LOGO_PATH}" fill="currentColor" fill-rule="evenodd"/></svg>`
}

export const SOCIAL_META: Record<SocialPlatform, { label: string; icon: IconName; placeholder: string }> = {
	youtube: { label: 'YouTube', icon: 'play', placeholder: msg('https://youtube.com/@你的頻道') },
	instagram: { label: 'Instagram', icon: 'camera', placeholder: msg('https://instagram.com/你的帳號') },
	threads: { label: 'Threads', icon: 'threads', placeholder: msg('https://threads.com/@你的帳號') },
	line: { label: 'LINE', icon: 'line', placeholder: msg('https://line.me/R/ti/p/@你的帳號') },
	facebook: { label: 'Facebook', icon: 'facebook', placeholder: msg('https://facebook.com/你的帳號') },
	x: { label: 'X', icon: 'x', placeholder: msg('https://x.com/你的帳號') },
	tiktok: { label: 'TikTok', icon: 'tiktok', placeholder: msg('https://tiktok.com/@你的帳號') },
	github: { label: 'GitHub', icon: 'github', placeholder: msg('https://github.com/你的帳號') },
	email: { label: 'Email', icon: 'mail', placeholder: 'you@example.com' },
	website: { label: msg('網站'), icon: 'globe', placeholder: 'https://' },
}

export const LINK_ICON_LABELS: Record<LinkIcon, string> = {
	auto: msg('自動'),
	none: msg('不顯示'),
	link: msg('[icon]連結'),
	video: msg('影片'),
	play: msg('播放'),
	doc: msg('文件'),
	briefcase: msg('工作'),
	chat: msg('聊天'),
	camera: msg('相機'),
	mail: msg('信件'),
	shop: msg('商店'),
	music: msg('音樂'),
	calendar: msg('行事曆'),
	gift: msg('禮物'),
	heart: msg('愛心'),
	star: msg('星星'),
	globe: msg('網站'),
	book: msg('書'),
	mic: msg('麥克風'),
}

const AUTO_ICON_HOSTS: [RegExp, IconName][] = [
	[/(^|\.)(youtube\.com|youtu\.be)$/, 'play'],
	[/(^|\.)instagram\.com$/, 'camera'],
	[/(^|\.)threads\.(net|com)$/, 'threads'],
	[/(^|\.)(line\.me|lin\.ee)$/, 'line'],
	[/(^|\.)(facebook\.com|fb\.me)$/, 'facebook'],
	[/(^|\.)(x\.com|twitter\.com)$/, 'x'],
	[/(^|\.)tiktok\.com$/, 'tiktok'],
	[/(^|\.)github\.com$/, 'github'],
	[/(^|\.)(spotify\.com|soundcloud\.com|music\.apple\.com|kkbox\.com|streetvoice\.com)$/, 'music'],
	[/(^|\.)(calendly\.com|cal\.com)$/, 'calendar'],
	[/(^|\.)(shopee\.tw|pinkoi\.com|etsy\.com|shopify\.com|ruten\.com\.tw|shopline\.tw)$/, 'shop'],
	[/(^|\.)(substack\.com|medium\.com|vocus\.cc)$/, 'book'],
	[/(^|\.)(podcasts\.apple\.com|firstory\.me|soundon\.fm)$/, 'mic'],
]

export function autoLinkIcon(url: string): IconName {
	if (/^mailto:/i.test(url)) return 'mail'
	try {
		const host = new URL(url).hostname.toLowerCase()
		for (const [pattern, icon] of AUTO_ICON_HOSTS) if (pattern.test(host)) return icon
	} catch {
		// Not a URL yet; fall through to the generic icon.
	}
	return 'link'
}

export function linkIconName(link: Pick<LinkItem, 'icon' | 'url'>): IconName | null {
	if (link.icon === 'none') return null
	if (link.icon === 'auto') return autoLinkIcon(link.url)
	return link.icon
}
