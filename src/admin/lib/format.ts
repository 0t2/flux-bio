import { toCsv } from '../../shared/csv'
import { intlLocale, language, msg, t } from '../i18n'

// Formatters follow the dashboard's language; each one is made once per language and options.
const formatters = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>()

export function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `d:${intlLocale()}:${JSON.stringify(options)}`
	let format = formatters.get(key) as Intl.DateTimeFormat | undefined
	if (!format) formatters.set(key, (format = new Intl.DateTimeFormat(intlLocale(), options)))
	return format
}

export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
	const key = `n:${intlLocale()}:${JSON.stringify(options)}`
	let format = formatters.get(key) as Intl.NumberFormat | undefined
	if (!format) formatters.set(key, (format = new Intl.NumberFormat(intlLocale(), options)))
	return format
}

export const formatDate = (ms: number): string => dateFormat({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
export const formatDateTime = (ms: number): string => dateFormat({ dateStyle: 'medium', timeStyle: 'short' }).format(ms)
export const formatNumber = (n: number): string => numberFormat().format(n)

export function percent(part: number, whole: number): string {
	if (!whole) return '0%'
	return `${Math.round((part / whole) * 100)}%`
}

/** Epoch ms → value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(ms: number | null): string {
	if (!ms) return ''
	const date = new Date(ms)
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function fromLocalInput(value: string): number | null {
	if (!value) return null
	const ms = new Date(value).getTime()
	return Number.isFinite(ms) ? ms : null
}

const displayNames = new Map<string, Intl.DisplayNames>()

function displayName(type: 'region' | 'language', code: string): string {
	const key = `${type}:${intlLocale()}`
	try {
		let names = displayNames.get(key)
		if (!names) displayNames.set(key, (names = new Intl.DisplayNames([intlLocale()], { type })))
		return names.of(code) ?? code
	} catch {
		return code
	}
}

export function regionName(code: string): string {
	if (!code || code === 'XX' || code === 'T1') return t('未知')
	return displayName('region', code)
}

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}

/** "zh-TW" → "中文（台灣）" in the dashboard's language. */
export function languageName(tag: string): string {
	return displayName('language', tag)
}

/** "TW:Taipei" → "Taipei（台灣）". */
export function cityName(value: string): string {
	const [country = '', city = ''] = value.split(':')
	return city ? t('{place}（{country}）', { place: city, country: regionName(country) }) : regionName(country)
}

/** "Asia/Taipei" → "台北時間（UTC+8）"; other zones keep their name. */
export function zoneLabel(timeZone: string, at = Date.now()): string {
	let offset = ''
	try {
		offset =
			new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
				.formatToParts(at)
				.find((part) => part.type === 'timeZoneName')
				?.value.replace('GMT', 'UTC') ?? ''
	} catch {
		offset = ''
	}
	if (offset === 'UTC') offset = 'UTC+0'
	const names: Record<string, string> = { 'Asia/Taipei': msg('台北時間'), 'Asia/Tokyo': msg('東京時間'), 'Asia/Hong_Kong': msg('香港時間'), UTC: msg('世界標準時間') }
	const name = names[timeZone] ? t(names[timeZone]) : timeZone
	return offset ? t('{place}（{country}）', { place: name, country: offset }) : name
}

/** "今天 10:12", "昨天 21:40", or "10/28 09:15". */
export function relativeTime(ms: number, timeZone?: string): string {
	const options = { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const
	const time = dateFormat(options).format(ms)
	const day = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(at)
	if (day(ms) === day(Date.now())) return t('今天 {time}', { time })
	if (day(ms) === day(Date.now() - 86_400_000)) return t('昨天 {time}', { time })
	return `${dateFormat({ timeZone, month: 'numeric', day: 'numeric' }).format(ms)} ${time}`
}

export function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = fileName
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Rows → CSV text, quoting where needed; starts with a BOM so Excel reads non-Latin text correctly. */
export { toCsv }

export function downloadCsv(rows: (string | number)[][], fileName: string): void {
	downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), fileName)
}

/** Taiwan's cities and counties as Cloudflare names them (ISO 3166-2 region names). */
// i18n-ignore-start: place names, shown only to languages that read them (HAN_LANGUAGES)
const TW_REGIONS: Record<string, string> = {
	'Taipei City': '台北市',
	'New Taipei City': '新北市',
	'Taoyuan City': '桃園市',
	'Taichung City': '台中市',
	'Tainan City': '台南市',
	'Kaohsiung City': '高雄市',
	'Keelung City': '基隆市',
	'Hsinchu City': '新竹市',
	'Hsinchu County': '新竹縣',
	'Chiayi City': '嘉義市',
	'Chiayi County': '嘉義縣',
	'Miaoli County': '苗栗縣',
	'Changhua County': '彰化縣',
	'Nantou County': '南投縣',
	'Yunlin County': '雲林縣',
	'Pingtung County': '屏東縣',
	'Yilan County': '宜蘭縣',
	'Hualien County': '花蓮縣',
	'Taitung County': '台東縣',
	'Penghu County': '澎湖縣',
	'Kinmen County': '金門縣',
	'Lienchiang County': '連江縣',
}
// i18n-ignore-end

/** Taiwan's places in Chinese characters for languages that read them; Cloudflare's names otherwise. */
const HAN_LANGUAGES = new Set(['zh-TW', 'zh-CN', 'ja'])

export function regionLabel(country: string, region: string): string {
	if (country === 'TW' && HAN_LANGUAGES.has(language())) return TW_REGIONS[region] ?? (region || t('台灣（未知地區）'))
	return region ? t('{place}（{country}）', { place: region, country: regionName(country) }) : regionName(country)
}

/**
 * Groups clicks by place the way the 數據 page shows them: the top regions of
 * the country most clicks come from, the rest of that country, and 海外.
 */
export function groupPlaces(places: { country: string; region: string; count: number }[], top = 5): { label: string; count: number }[] {
	const byCountry = new Map<string, number>()
	for (const place of places) byCountry.set(place.country, (byCountry.get(place.country) ?? 0) + place.count)
	const home = [...byCountry].sort((a, b) => b[1] - a[1])[0]?.[0]
	if (!home) return []
	const local = places.filter((place) => place.country === home).sort((a, b) => b.count - a.count)
	const rest = local.slice(top).reduce((sum, place) => sum + place.count, 0)
	const abroad = places.filter((place) => place.country !== home).reduce((sum, place) => sum + place.count, 0)
	return [
		...local.slice(0, top).map((place) => ({ label: regionLabel(home, place.region), count: place.count })),
		...(rest ? [{ label: home === 'TW' ? t('其他縣市') : t('{country}其他地區', { country: regionName(home) }), count: rest }] : []),
		...(abroad ? [{ label: home === 'TW' ? t('海外') : t('其他國家'), count: abroad }] : []),
	]
}

const LEGAL_SUFFIX =
	/[\s,]+(?:public\s+company\s+limited|pty\.?\s*(?:ltd\.?|limited)|pte\.?\s*ltd\.?|sdn\.?\s*bhd\.?|co\.?,?\s*ltd\.?|ltd\.?|limited|inc\.?|incorporated|llc|l\.l\.c\.|corp\.?|corporation|co\.|gmbh|ag|s\.a\.u\.|s\.a\.?|plc|b\.v\.|k\.k\.|p?jsc)$/i

/** "Far EasTone Telecommunications Co., Ltd." → "Far EasTone Telecommunications". */
export function networkName(name: string): string {
	let short = name.trim()
	for (let next = short.replace(LEGAL_SUFFIX, ''); next && next !== short; next = short.replace(LEGAL_SUFFIX, '')) short = next
	return short || name
}
