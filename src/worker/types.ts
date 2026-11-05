import type { Context } from 'hono'
import type { ApiErrorBody } from '../shared/api'
import type { Problem } from '../shared/validate'
import { fill, type Message, type Params } from '../templates/msg'

/** Who is calling the admin API. */
export type Auth =
	| { role: 'admin' }
	| { role: 'token'; tokenId: string; scope: 'links' | 'full'; name: string }

export type AppEnv = { Bindings: Env; Variables: { auth: Auth } }
export type AppContext = Context<AppEnv>

/**
 * An error the API reports to the client as `{ error, message, key?, params?, problems? }`.
 * The message is zh-TW text marked with msg(), or a key with values
 * (`{ key: msg('最多 {count} 個頁面'), params: { count } }`): then `message`
 * is the filled-in text, and `key` and `params` let the dashboard translate it.
 */
export class ApiError extends Error {
	readonly key: string
	readonly params?: Params

	constructor(
		readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 428 | 429 | 503,
		readonly code: string,
		message: string | Message,
		readonly problems?: Problem[],
	) {
		const text: Message = typeof message === 'string' ? { key: message } : message
		super(fill(text.key, text.params))
		this.key = text.key
		this.params = text.params
	}

	/** `message`, plus `key` and `params` when the message was built from a key. */
	text(): Pick<ApiErrorBody, 'message' | 'key' | 'params'> {
		return { message: this.message, key: this.key, ...(this.params ? { params: this.params } : {}) }
	}
}
