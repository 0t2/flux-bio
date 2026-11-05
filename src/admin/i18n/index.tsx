import { intlTag, textDirection } from '../../shared/locale'
import { Fragment, useSyncExternalStore, type ReactNode } from 'react'
import type { Message } from '../../templates/msg'
import { plain } from '../../templates/msg'
import { LANGUAGES, type Language } from './languages'

// Dashboard translations. The Traditional Chinese text in the code is the key:
// t('發布') looks it up in locales/<language>.json and falls back to the key.
// Placeholders are {name}: t('已刪除「{name}」', { name }). When the same words mean
// different things, a context in brackets makes them separate keys:
// t('[state]關閉') (Off) and t('關閉') (Close); the context is never shown.
//
// Call t() while rendering, never at module scope: the language can change at
// run time (the app re-mounts), and a module-level t() would keep the old one.
// Module-level text uses msg('…'), which only marks it for the key list, and is
// passed through t() where it is shown.

export { LANGUAGES, type Language }

const SOURCE: Language = 'zh-TW'
const STORAGE_KEY = 'fluxbio.language'

// Each language is its own chunk, loaded only when chosen.
const loaders = import.meta.glob<{ default: Record<string, string> }>('./locales/*.json')

let current: Language = SOURCE
let dictionary: Record<string, string> = {}
const listeners = new Set<() => void>()

/** Marks text for translation without translating it, for module-level constants. */
export function msg<T extends string>(key: T): T {
	return key
}

/** The text in the dashboard's language, with {placeholders} filled in. */
export function t(key: string, vars?: Record<string, string | number>): string {
	const text = dictionary[key] ?? plain(key)
	return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text
}

/**
 * Text the API sent as a key with values (see src/templates/msg.ts), e.g. an
 * error. Values that are messages themselves are translated too.
 */
export function tMessage({ key, params }: Message): string {
	const vars: Record<string, string | number> = {}
	for (const [name, value] of Object.entries(params ?? {})) vars[name] = typeof value === 'object' ? tMessage(value) : value
	return t(key, vars)
}

/**
 * Like t(), for a sentence with an element inside, e.g.
 * tr('請到 {link} 修改', { link: <Link href="/">{t('[nav]頁面')}</Link> }).
 * Returns the parts to render in order; the translation decides where the element goes.
 */
export function tr(key: string, parts: Record<string, ReactNode>): ReactNode[] {
	return (dictionary[key] ?? plain(key)).split(/(\{\w+\})/).map((piece, index) => {
		const name = /^\{(\w+)\}$/.exec(piece)?.[1]
		return name && name in parts ? <Fragment key={index}>{parts[name]}</Fragment> : piece
	})
}

export function language(): Language {
	return current
}

/** For Intl formatters. */
export function intlLocale(): string {
	return intlTag(current)
}

/** The best supported language for a list of BCP 47 tags, e.g. navigator.languages. */
export function matchLanguage(tags: readonly string[]): Language | null {
	const codes = LANGUAGES.map((entry) => entry.code as string)
	for (const raw of tags) {
		const tag = raw.toLowerCase()
		const exact = codes.find((code) => code.toLowerCase() === tag)
		if (exact) return exact as Language
		if (/^zh-(tw|hk|mo)|^zh-hant/.test(tag)) return 'zh-TW'
		if (tag === 'zh' || /^zh-(cn|sg)|^zh-hans/.test(tag)) return 'zh-CN'
		if (tag.startsWith('pt')) return 'pt-BR'
		const primary = codes.find((code) => code.split('-')[0] === tag.split('-')[0])
		if (primary) return primary as Language
	}
	return null
}

function stored(): Language | null {
	try {
		const value = localStorage.getItem(STORAGE_KEY)
		return LANGUAGES.some((entry) => entry.code === value) ? (value as Language) : null
	} catch {
		return null
	}
}

/** Loads a language and makes it current. An unknown one becomes English. */
export async function setLanguage(next: Language, remember = true): Promise<void> {
	let words: Record<string, string> = {}
	if (next !== SOURCE) {
		const load = loaders[`./locales/${next}.json`]
		if (load) words = (await load()).default
		else return setLanguage('en', remember)
	}
	dictionary = words
	current = next
	document.documentElement.lang = next
	document.documentElement.dir = textDirection(next)
	if (remember) {
		try {
			localStorage.setItem(STORAGE_KEY, next)
		} catch {
			// Private mode: the choice lasts for this visit only.
		}
	}
	for (const listener of listeners) listener()
}

/** Picks the saved language, else the browser's, else English. Call before the first render. */
export async function initLanguage(): Promise<void> {
	const choice = stored() ?? matchLanguage(navigator.languages ?? [navigator.language]) ?? 'en'
	// A language that won't load falls back to English, and only then to the source, which needs no loading.
	await setLanguage(choice, false)
		.catch(() => setLanguage('en', false))
		.catch(() => setLanguage(SOURCE, false))
}

/** The current language; components that use it re-render when it changes. */
export function useLanguage(): Language {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		() => current,
	)
}
