import { msg } from '../templates/msg'

/**
 * Works out where a visit or click came from, without cookies.
 *
 * Instagram, Threads, Facebook and LINE open links in their in-app browsers
 * and usually send no Referer, so the user agent is checked before the
 * referrer. An explicit `?s=` parameter (for example on a QR code, or one
 * link per platform) wins over both.
 */

const ALIASES: Record<string, string> = {
	ig: 'instagram',
	insta: 'instagram',
	instagram: 'instagram',
	th: 'threads',
	threads: 'threads',
	fb: 'facebook',
	facebook: 'facebook',
	line: 'line',
	x: 'x',
	tw: 'x',
	twitter: 'x',
	yt: 'youtube',
	youtube: 'youtube',
	tt: 'tiktok',
	tiktok: 'tiktok',
	li: 'linkedin',
	linkedin: 'linkedin',
	wechat: 'wechat',
	wx: 'wechat',
	weibo: 'weibo',
	kakao: 'kakaotalk',
	kakaotalk: 'kakaotalk',
	naver: 'naver',
	zalo: 'zalo',
	snap: 'snapchat',
	snapchat: 'snapchat',
	pin: 'pinterest',
	pinterest: 'pinterest',
	reddit: 'reddit',
	tg: 'telegram',
	telegram: 'telegram',
	wa: 'whatsapp',
	whatsapp: 'whatsapp',
	discord: 'discord',
	qr: 'qr',
	email: 'email',
	mail: 'email',
	newsletter: 'email',
}

export function sourceFromParam(value: string | null | undefined): string | null {
	if (!value) return null
	const cleaned = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '')
		.slice(0, 24)
	if (!cleaned) return null
	return ALIASES[cleaned] ?? cleaned
}

export function sourceFromUserAgent(ua: string): string | null {
	// Threads' in-app browser also mentions Instagram, so check it first.
	if (/Barcelona/i.test(ua)) return 'threads'
	if (/Instagram/i.test(ua)) return 'instagram'
	if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return 'facebook'
	if (/\bLine\//i.test(ua)) return 'line'
	if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok'
	if (/Twitter/i.test(ua)) return 'x'
	if (/MicroMessenger/i.test(ua)) return 'wechat'
	if (/Weibo/i.test(ua)) return 'weibo'
	if (/KAKAOTALK/i.test(ua)) return 'kakaotalk'
	if (/NAVER\(inapp/i.test(ua)) return 'naver'
	if (/Zalo/i.test(ua)) return 'zalo'
	if (/Snapchat/i.test(ua)) return 'snapchat'
	if (/Pinterest/i.test(ua)) return 'pinterest'
	if (/LinkedInApp/i.test(ua)) return 'linkedin'
	return null
}

const REFERRER_HOSTS: [RegExp, string][] = [
	[/(^|\.)instagram\.com$/, 'instagram'],
	[/(^|\.)threads\.(net|com)$/, 'threads'],
	[/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
	[/(^|\.)(line\.me|lin\.ee)$/, 'line'],
	[/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x'],
	[/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
	[/(^|\.)tiktok\.com$/, 'tiktok'],
	[/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
	[/(^|\.)reddit\.com$/, 'reddit'],
	[/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, 'pinterest'],
	[/(^|\.)(t\.me|telegram\.org)$/, 'telegram'],
	[/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
	[/(^|\.)discord\.com$/, 'discord'],
	[/(^|\.)snapchat\.com$/, 'snapchat'],
	[/(^|\.)(weibo\.com|weibo\.cn)$/, 'weibo'],
	[/(^|\.)naver\.com$/, 'naver'],
	[/(^|\.)(kakao\.com|kakaocorp\.com)$/, 'kakaotalk'],
	[/(^|\.)zalo\.me$/, 'zalo'],
	[/(^|\.)yahoo\.[a-z.]+$/, 'yahoo'],
	[/(^|\.)baidu\.com$/, 'baidu'],
	[/(^|\.)google\.[a-z.]+$/, 'google'],
	[/(^|\.)bing\.com$/, 'bing'],
	[/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
]

export function sourceFromReferrer(referrer: string | null | undefined, selfHost: string): string | null {
	if (!referrer) return null
	let host: string
	try {
		host = new URL(referrer).hostname.toLowerCase()
	} catch {
		return null
	}
	if (!host || host === selfHost.toLowerCase()) return null
	for (const [pattern, source] of REFERRER_HOSTS) if (pattern.test(host)) return source
	return host.replace(/^www\./, '').slice(0, 64)
}

export function detectSource(input: { param?: string | null; userAgent: string; referrer?: string | null; selfHost: string }): string {
	return (
		sourceFromParam(input.param) ??
		sourceFromUserAgent(input.userAgent) ??
		sourceFromReferrer(input.referrer, input.selfHost) ??
		'direct'
	)
}

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function detectDevice(ua: string): DeviceType {
	if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
	if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile'
	return 'desktop'
}

/** A coarse browser name; in-app browsers are named after their app. */
export function detectBrowser(ua: string): string {
	if (/Barcelona/i.test(ua)) return 'Threads'
	if (/Instagram/i.test(ua)) return 'Instagram'
	if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook'
	if (/\bLine\//i.test(ua)) return 'LINE'
	if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'TikTok'
	if (/Twitter/i.test(ua)) return 'X'
	if (/MicroMessenger/i.test(ua)) return 'WeChat'
	if (/Weibo/i.test(ua)) return 'Weibo'
	if (/KAKAOTALK/i.test(ua)) return 'KakaoTalk'
	if (/NAVER\(inapp/i.test(ua)) return 'NAVER'
	if (/Zalo/i.test(ua)) return 'Zalo'
	if (/Snapchat/i.test(ua)) return 'Snapchat'
	if (/Pinterest/i.test(ua)) return 'Pinterest'
	if (/LinkedInApp/i.test(ua)) return 'LinkedIn'
	if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge'
	if (/SamsungBrowser/.test(ua)) return 'Samsung Internet'
	if (/OPR\/|Opera/.test(ua)) return 'Opera'
	if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox'
	if (/Chrome\/|CriOS/.test(ua)) return 'Chrome'
	if (/Safari\//.test(ua)) return 'Safari'
	return 'Other'
}

export function detectOs(ua: string): string {
	if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
	if (/Android/.test(ua)) return 'Android'
	if (/Windows/.test(ua)) return 'Windows'
	if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
	if (/CrOS/.test(ua)) return 'ChromeOS'
	if (/Linux/.test(ua)) return 'Linux'
	return 'Other'
}

export const SOURCE_LABELS: Record<string, string> = {
	instagram: 'Instagram',
	threads: 'Threads',
	facebook: 'Facebook',
	line: 'LINE',
	x: 'X',
	youtube: 'YouTube',
	tiktok: 'TikTok',
	linkedin: 'LinkedIn',
	wechat: 'WeChat',
	weibo: 'Weibo',
	kakaotalk: 'KakaoTalk',
	naver: 'NAVER',
	zalo: 'Zalo',
	snapchat: 'Snapchat',
	pinterest: 'Pinterest',
	reddit: 'Reddit',
	telegram: 'Telegram',
	whatsapp: 'WhatsApp',
	discord: 'Discord',
	yahoo: 'Yahoo',
	baidu: 'Baidu',
	google: 'Google',
	bing: 'Bing',
	duckduckgo: 'DuckDuckGo',
	qr: 'QR Code',
	email: 'Email',
	direct: msg('直接／其他'),
	// Past the per-day cap on distinct sources (SOURCE_LIMIT in stats.ts).
	other: msg('其他來源'),
}

export const DEVICE_LABELS: Record<DeviceType, string> = {
	mobile: msg('手機'),
	tablet: msg('平板'),
	desktop: msg('電腦'),
}

export function sourceLabel(source: string): string {
	return SOURCE_LABELS[source] ?? source
}
