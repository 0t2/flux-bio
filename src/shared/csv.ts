/**
 * One CSV field. Text that starts like a formula (=, +, -, @, a tab or a
 * carriage return) gets a leading apostrophe, so a spreadsheet shows it
 * instead of running it: referrers and UTM tags in stats come from strangers.
 */
export function csvField(value: string | number): string {
	if (typeof value === 'number') return String(value)
	const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Rows as CSV text, with a byte order mark so Excel reads Chinese correctly. */
export function toCsv(rows: (string | number)[][]): string {
	return `﻿${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}
