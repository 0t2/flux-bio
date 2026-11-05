// Text the dashboard shows in its own language. Its dictionaries are keyed by
// the Traditional Chinese text, so code outside the dashboard writes that text
// inside msg() or fill(), where scripts/i18n.mjs finds the keys. Outside the
// dashboard the Worker sends English (see setWords), and keeps the key next to it.
//
// Text the Worker builds with values in it (API errors, publish problems,
// stats labels) travels as a Message next to the filled-in text, so the
// dashboard can translate the key and fill in the same values.

/**
 * Values for a key's {placeholders}. Strings and numbers go in as they are
 * (names, slugs, counts); a Message is translated before it goes in.
 */
export type Params = { [name: string]: string | number | Message }

/** A translatable text: its key and the values for its placeholders. */
export interface Message {
	key: string
	params?: Params
}

/**
 * A key may start with a context in brackets when the same Chinese words mean
 * different things, e.g. msg('[theme]編輯') (the Editorial theme) next to
 * t('編輯') (Edit). The context is part of the key, never of the text.
 */
const CONTEXT = /^\[[\w-]+\]/

/** The zh-TW text of a key: the key without its context. */
export function plain(key: string): string {
	return key.replace(CONTEXT, '')
}

/** Marks text as a dashboard translation key and returns it unchanged. */
export function msg<T extends string>(key: T): T {
	return key
}

let words: Record<string, string> | undefined

/** The language fill() writes in, as a dictionary keyed like the dashboard's. Without one it writes the key's zh-TW text. */
export function setWords(dictionary: Record<string, string>): void {
	words = dictionary
}

/** The text of a key, with its {placeholders} filled in. */
export function fill(key: string, params?: Params): string {
	const text = words?.[key] ?? plain(key)
	if (!params) return text
	return text.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = params[name]
		if (value === undefined) return match
		return typeof value === 'object' ? fill(value.key, value.params) : String(value)
	})
}
