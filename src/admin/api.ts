import type { ApiErrorBody, SettingsResponse } from '../shared/api'
import type { Settings } from '../shared/content'
import type { Problem } from '../shared/validate'
import { msg, t, tMessage } from './i18n'

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly problems: Problem[] = [],
	) {
		super(message)
	}
}

/** A message from the API in the dashboard's language. Without a key, its zh-TW text is the key. */
const translated = (text: Pick<ApiErrorBody, 'message' | 'key' | 'params'>): string => tMessage({ key: text.key ?? text.message, params: text.params })

let onUnauthorized: () => void = () => {}

/** Called when the session has expired, so the app can show the login page. */
export function setUnauthorizedHandler(handler: () => void): void {
	onUnauthorized = handler
}

export async function request<T>(path: string, options: { method?: string; json?: unknown; body?: Blob; headers?: Record<string, string> } = {}): Promise<T> {
	const headers: Record<string, string> = { ...options.headers }
	let body: BodyInit | undefined
	if (options.body) {
		body = options.body
		headers['content-type'] = options.body.type
	} else if (options.json !== undefined) {
		body = JSON.stringify(options.json)
		headers['content-type'] = 'application/json'
	}

	let response: Response
	try {
		response = await fetch(`/api${path}`, {
			method: options.method ?? (body ? 'POST' : 'GET'),
			headers,
			body,
			credentials: 'same-origin',
		})
	} catch {
		throw new ApiError(0, 'network', t('連不上伺服器，請檢查網路連線'))
	}

	// Only requestIfNewer asks in a way that can be answered like this.
	if (response.status === 304) return null as T
	const isJson = response.headers.get('content-type')?.includes('application/json')
	const data: unknown = isJson ? await response.json() : null
	if (!response.ok) {
		const error = (data ?? {}) as Partial<ApiErrorBody>
		if (response.status === 401 && error.error === 'unauthorized') onUnauthorized()
		const message = typeof error.message === 'string' ? translated({ ...error, message: error.message }) : t('發生錯誤（{status}）', { status: response.status })
		const problems = error.problems?.map((problem) => ({ ...problem, message: translated(problem) }))
		throw new ApiError(response.status, error.error ?? 'error', message, problems)
	}
	return data as T
}

/** Reads something the caller already holds a version of; null when that is still the one, which costs the Worker next to nothing. */
export function requestIfNewer<T>(path: string, version: number): Promise<T | null> {
	return request<T | null>(path, { headers: { 'if-none-match': `"${version}"` } })
}

/** How many more times a save goes on by itself: each takes a large site's next few hundred pages. */
const MORE_SAVES = 30

/**
 * Saves settings, and goes on while the site says there is more to tell KV than one request may (`copiesLeft`): a
 * site with many pages has their copies dropped a few hundred a request, and until then some show the old settings,
 * or stay public after pages were switched off. `unfinished` says it still isn't done, as on a day whose KV writes
 * are used up: the change itself is saved either way, and the site goes on when settings are next saved.
 */
export async function saveSettings(json: object): Promise<{ settings: Settings; unfinished: boolean }> {
	let answer = await request<SettingsResponse>('/settings', { method: 'PUT', json })
	for (let more = 0; answer.copiesLeft && more < MORE_SAVES; more++) {
		try {
			answer = await request<SettingsResponse>('/settings', { method: 'PUT', json: {} })
		} catch {
			return { settings: answer.settings, unfinished: true }
		}
	}
	return { settings: answer.settings, unfinished: Boolean(answer.copiesLeft) }
}

/** What to say when a save is `unfinished`. */
export const UNFINISHED = msg('已經儲存。網站的頁面很多，還有一些沒更新完，請稍後再儲存一次。')
/** And when it was pages being switched off: the ones not reached yet are still public, which is not "not up to date". */
export const UNFINISHED_OFF = msg('已經儲存。網站的頁面很多，還有一些頁面還沒下線，重新整理這一頁會繼續。')
