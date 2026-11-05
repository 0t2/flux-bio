import type { ApiErrorBody } from '../shared/api'
import type { Problem } from '../shared/validate'
import { t, tMessage } from './i18n'

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
