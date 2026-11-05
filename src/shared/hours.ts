import type { Locale, Opening } from './content'
import { textOf } from './fonts'

/**
 * Opening hours: whether a place is open right now and how the week reads.
 * Weeks start on Monday. An opening that closes at or before it opens
 * (e.g. 18:00–02:00) runs past midnight into the next day.
 */

type Week<T> = readonly [T, T, T, T, T, T, T]

/** Monday first, as they head a row of opening hours. */
const DAY_NAMES: Record<Locale, Week<string>> = {
	'zh-TW': ['週一', '週二', '週三', '週四', '週五', '週六', '週日'],
	en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
	'zh-CN': ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
	ja: ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜'],
	ko: ['월', '화', '수', '목', '금', '토', '일'],
	es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
	'pt-BR': ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'],
	fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
	de: ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'],
	id: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
	th: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'],
	vi: ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'],
	ar: ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
}
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const minutes = (clock: string): number => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
const clockOf = (minute: number): string => {
	const m = ((minute % 1440) + 1440) % 1440
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Weekday (0 = Monday) and minute of the day of `at` in `timeZone`. */
export function localTime(timeZone: string, at: number = Date.now()): { day: number; minute: number } {
	let parts: Intl.DateTimeFormatPart[]
	try {
		parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
	} catch {
		parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
	}
	const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
	return { day: Math.max(0, WEEKDAYS_EN.indexOf(get('weekday'))), minute: (Number(get('hour')) % 24) * 60 + Number(get('minute')) }
}

/** Minute ranges of a day's openings, measured from that day's midnight. */
function spans(openings: Opening[]): { start: number; end: number }[] {
	return openings.map(({ open, close }) => {
		const start = minutes(open)
		let end = minutes(close)
		if (end <= start) end += 1440
		return { start, end }
	})
}

export type OpenStatus =
	| { open: true; closesAt: string; closesToday: boolean }
	| { open: false; opensAt: { inDays: number; day: number; time: string } | null }

export function openStatus(week: Opening[][], timeZone: string, at: number = Date.now()): OpenStatus {
	const now = localTime(timeZone, at)
	const today = spans(week[now.day] ?? [])
	const yesterday = spans(week[(now.day + 6) % 7] ?? [])
	const current =
		today.find((span) => span.start <= now.minute && now.minute < span.end) ??
		yesterday.map((span) => ({ start: span.start - 1440, end: span.end - 1440 })).find((span) => span.start <= now.minute && now.minute < span.end)
	if (current) return { open: true, closesAt: clockOf(current.end), closesToday: current.end <= 1440 }

	for (let inDays = 0; inDays < 8; inDays++) {
		const day = (now.day + inDays) % 7
		const next = spans(week[day] ?? [])
			.filter((span) => inDays > 0 || span.start > now.minute)
			.sort((a, b) => a.start - b.start)[0]
		if (next) return { open: false, opensAt: { inDays, day, time: clockOf(next.start) } }
	}
	return { open: false, opensAt: null }
}

interface HoursText {
	open: string
	closed: string
	/** "Closes at 18:00", or tomorrow when the opening runs past midnight. */
	closes: (time: string, today: boolean) => string
	/** "Opens tomorrow at 10:00"; `day` is a name from DAY_NAMES, used two or more days ahead. */
	opens: (inDays: number, day: string, time: string) => string
	dayOff: string
	/** Added after the days of the row that holds today. */
	today: string
	/** Consecutive days with the same hours, e.g. "Tue–Fri". */
	range: (from: string, to: string) => string
	/** Two neighbouring days with the same hours. */
	pair: (a: string, b: string) => string
}

/** Picks the word for today, tomorrow or a later day. */
const dayWord = (inDays: number, today: string, tomorrow: string, later: string) => (inDays === 0 ? today : inDays === 1 ? tomorrow : later)

const TEXT: Record<Locale, HoursText> = {
	'zh-TW': {
		open: '營業中',
		closed: '休息中',
		closes: (time, today) => `${today ? '今天' : '明天'} ${time} 打烊`,
		opens: (inDays, day, time) => `${dayWord(inDays, '今天', '明天', day)} ${time} 開門`,
		dayOff: '公休',
		today: '（今天）',
		range: (from, to) => `${from}至${to}`,
		pair: (a, b) => `${a}、${b}`,
	},
	en: {
		open: 'Open',
		closed: 'Closed',
		closes: (time, today) => `Closes ${today ? '' : 'tomorrow '}at ${time}`,
		opens: (inDays, day, time) => `Opens ${dayWord(inDays, '', 'tomorrow ', `${day} `)}at ${time}`,
		dayOff: 'Closed',
		today: ' (today)',
		range: (from, to) => `${from}–${to}`,
		pair: (a, b) => `${a}, ${b}`,
	},
	'zh-CN': {
		open: '营业中',
		closed: '休息中',
		closes: (time, today) => `${today ? '今天' : '明天'} ${time} 打烊`,
		opens: (inDays, day, time) => `${dayWord(inDays, '今天', '明天', day)} ${time} 开门`,
		dayOff: '休息',
		today: '（今天）',
		range: (from, to) => `${from}至${to}`,
		pair: (a, b) => `${a}、${b}`,
	},
	ja: {
		open: '営業中',
		closed: '営業時間外',
		closes: (time, today) => `${today ? '' : '明日 '}${time}まで`,
		opens: (inDays, day, time) => `${dayWord(inDays, '', '明日 ', `${day}日 `)}${time}に開店`,
		dayOff: '定休日',
		today: '（今日）',
		range: (from, to) => `${from}〜${to}`,
		pair: (a, b) => `${a}・${b}`,
	},
	ko: {
		open: '영업 중',
		closed: '영업 종료',
		closes: (time, today) => `${today ? '' : '내일 '}${time}에 영업 종료`,
		opens: (inDays, day, time) => `${dayWord(inDays, '', '내일 ', `${day}요일 `)}${time}에 영업 시작`,
		dayOff: '휴무',
		today: ' (오늘)',
		range: (from, to) => `${from}~${to}`,
		pair: (a, b) => `${a}, ${b}`,
	},
	es: {
		open: 'Abierto',
		closed: 'Cerrado',
		closes: (time, today) => `Cierra ${today ? '' : 'mañana '}a las ${time}`,
		opens: (inDays, day, time) => `Abre ${dayWord(inDays, '', 'mañana ', `el ${day} `)}a las ${time}`,
		dayOff: 'Cerrado',
		today: ' (hoy)',
		range: (from, to) => `${from} a ${to}`,
		pair: (a, b) => `${a} y ${b}`,
	},
	'pt-BR': {
		open: 'Aberto',
		closed: 'Fechado',
		closes: (time, today) => `Fecha ${today ? '' : 'amanhã '}às ${time}`,
		opens: (inDays, day, time) => `Abre ${dayWord(inDays, '', 'amanhã ', `${day} `)}às ${time}`,
		dayOff: 'Fechado',
		today: ' (hoje)',
		range: (from, to) => `${from} a ${to}`,
		pair: (a, b) => `${a} e ${b}`,
	},
	fr: {
		open: 'Ouvert',
		closed: 'Fermé',
		closes: (time, today) => `Ferme ${today ? '' : 'demain '}à ${time}`,
		opens: (inDays, day, time) => `Ouvre ${dayWord(inDays, '', 'demain ', `${day} `)}à ${time}`,
		dayOff: 'Fermé',
		today: ' (aujourd’hui)',
		range: (from, to) => `du ${from} au ${to}`,
		pair: (a, b) => `${a} et ${b}`,
	},
	de: {
		open: 'Geöffnet',
		closed: 'Geschlossen',
		closes: (time, today) => `Schließt ${today ? '' : 'morgen '}um ${time}`,
		opens: (inDays, day, time) => `Öffnet ${dayWord(inDays, '', 'morgen ', `${day} `)}um ${time}`,
		dayOff: 'Geschlossen',
		today: ' (heute)',
		range: (from, to) => `${from}–${to}`,
		pair: (a, b) => `${a}, ${b}`,
	},
	id: {
		open: 'Buka',
		closed: 'Tutup',
		closes: (time, today) => `Tutup ${today ? '' : 'besok '}pukul ${time}`,
		opens: (inDays, day, time) => `Buka ${dayWord(inDays, '', 'besok ', `${day} `)}pukul ${time}`,
		dayOff: 'Tutup',
		today: ' (hari ini)',
		range: (from, to) => `${from}–${to}`,
		pair: (a, b) => `${a} dan ${b}`,
	},
	th: {
		open: 'เปิดอยู่',
		closed: 'ปิดแล้ว',
		closes: (time, today) => `ปิด${today ? '' : 'พรุ่งนี้'} ${time} น.`,
		opens: (inDays, day, time) => `เปิด${dayWord(inDays, '', 'พรุ่งนี้', `วัน${day}`)} ${time} น.`,
		dayOff: 'ปิด',
		today: ' (วันนี้)',
		range: (from, to) => `${from}–${to}`,
		pair: (a, b) => `${a}และ${b}`,
	},
	vi: {
		open: 'Đang mở cửa',
		closed: 'Đã đóng cửa',
		closes: (time, today) => `Đóng cửa lúc ${time}${today ? '' : ' ngày mai'}`,
		opens: (inDays, day, time) => `Mở cửa lúc ${time}${dayWord(inDays, '', ' ngày mai', ` ${day}`)}`,
		dayOff: 'Đóng cửa',
		today: ' (hôm nay)',
		range: (from, to) => `${from} – ${to}`,
		pair: (a, b) => `${a}, ${b}`,
	},
	ar: {
		open: 'مفتوح',
		closed: 'مغلق',
		closes: (time, today) => `يغلق ${today ? '' : 'غدًا '}الساعة ${time}`,
		opens: (inDays, day, time) => `يفتح ${dayWord(inDays, '', 'غدًا ', `${day} `)}الساعة ${time}`,
		dayOff: 'مغلق',
		today: ' (اليوم)',
		range: (from, to) => `${from}–${to}`,
		pair: (a, b) => `${a}، ${b}`,
	},
}

/** All the opening-hours words in a language, for copying the fonts a page needs. */
export function hoursWords(locale: Locale): string {
	return textOf(TEXT[locale]) + textOf(DAY_NAMES[locale])
}

export function statusText(status: OpenStatus, locale: Locale): { label: string; detail: string } {
	const text = TEXT[locale]
	if (status.open) return { label: text.open, detail: text.closes(status.closesAt, status.closesToday) }
	const next = status.opensAt
	return { label: text.closed, detail: next ? text.opens(next.inDays, DAY_NAMES[locale][next.day] ?? '', next.time) : '' }
}

export interface HoursRow {
	days: string
	hours: string
	/** The row includes today. */
	today: boolean
	closed: boolean
}

/** Groups consecutive days with the same hours: "週二至週五 10:00–18:00". */
export function weekRows(week: Opening[][], locale: Locale, today: number): HoursRow[] {
	const text = TEXT[locale]
	const names = DAY_NAMES[locale]
	const key = (day: number) => (week[day] ?? []).map((o) => `${o.open}-${o.close}`).join(',')
	const rows: HoursRow[] = []
	let start = 0
	for (let day = 1; day <= 7; day++) {
		if (day < 7 && key(day) === key(start)) continue
		const end = day - 1
		const label =
			start === end ? names[start]! : end === start + 1 ? text.pair(names[start]!, names[end]!) : text.range(names[start]!, names[end]!)
		const openings = week[start] ?? []
		const isToday = today >= start && today <= end
		rows.push({
			days: isToday ? `${label}${text.today}` : label,
			hours: openings.length ? openings.map((o) => `${o.open}–${o.close}`).join(', ') : text.dayOff,
			today: isToday,
			closed: !openings.length,
		})
		start = day
	}
	return rows
}
