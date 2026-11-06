/**
 * A formatter per time zone, made once and kept. Making one costs far more than using it, every counted visit
 * needs three, and a site has one time zone. A time zone Intl doesn't know still throws, as making one always did.
 */
export function formatterPerZone(make: (timeZone: string) => Intl.DateTimeFormat): (timeZone: string) => Intl.DateTimeFormat {
	const made = new Map<string, Intl.DateTimeFormat>()
	return (timeZone) => {
		let formatter = made.get(timeZone)
		if (!formatter) {
			formatter = make(timeZone)
			// Time zones come from a site's settings, so there are only ever a few. This keeps it that way.
			if (made.size >= 32) made.clear()
			made.set(timeZone, formatter)
		}
		return formatter
	}
}

const dayFormatter = formatterPerZone((timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }))
const hourFormatter = formatterPerZone((timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }))

/** The calendar day ("YYYY-MM-DD") of `at` in the given IANA time zone. */
export function dayIn(timeZone: string, at: number | Date = Date.now()): string {
	try {
		return dayFormatter(timeZone).format(at)
	} catch {
		return new Date(at).toISOString().slice(0, 10)
	}
}

/** The hour (0–23) of `at` in the given IANA time zone. */
export function hourIn(timeZone: string, at: number | Date = Date.now()): number {
	try {
		return Number(hourFormatter(timeZone).format(at)) % 24
	} catch {
		return new Date(at).getUTCHours()
	}
}

/** Calendar arithmetic on "YYYY-MM-DD" strings, immune to DST. */
export function addDays(day: string, delta: number): string {
	const date = new Date(`${day}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + delta)
	return date.toISOString().slice(0, 10)
}

/** Calendar arithmetic on months, "YYYY-MM". */
export function addMonths(month: string, delta: number): string {
	const [year = 0, number = 1] = month.split('-').map(Number)
	const index = year * 12 + (number - 1) + delta
	return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** The last `days` days, oldest first, ending today in `timeZone`. */
export function lastDays(timeZone: string, days: number, at: number = Date.now()): string[] {
	const today = dayIn(timeZone, at)
	return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1))
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone })
		return true
	} catch {
		return false
	}
}
