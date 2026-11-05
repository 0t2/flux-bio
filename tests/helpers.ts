import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import app from '../src/worker/index'

export const PASSWORD = 'test-admin-token-0123'
export const ORIGIN = 'https://bio.example'
export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
export const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
export const INSTAGRAM = `${IPHONE} Instagram 350.0.0`
export const LINE = `${IPHONE} Line/14.5.0`

/** Calls the Worker and waits for background work such as stats writes. */
export async function call(path: string, init: RequestInit = {}): Promise<Response> {
	const ctx = createExecutionContext()
	const response = await app.fetch(new Request(`${ORIGIN}${path}`, { redirect: 'manual', ...init }), env, ctx)
	await waitOnExecutionContext(ctx)
	return response
}

export async function api(path: string, init: RequestInit & { json?: unknown; bearer?: string } = {}): Promise<Response> {
	const { json, bearer, ...rest } = init
	const headers: Record<string, string> = { authorization: `Bearer ${bearer ?? PASSWORD}`, 'content-type': 'application/json' }
	// Saving a draft takes the version that was read. A test about something else reads it first, as an
	// agent would; tests/agent-safety.test.ts is where that rule itself is tested, with call().
	if (rest.method === 'PUT' && /^\/pages\/[^/]+\/draft$/.test(path)) {
		const page = await call(`/api${path.replace(/\/draft$/, '')}`, { headers })
		if (page.ok) headers['if-match'] = String(((await page.json()) as { page: { draftUpdatedAt: number } }).page.draftUpdatedAt)
	}
	return call(`/api${path}`, {
		...rest,
		headers: { ...headers, ...rest.headers },
		body: json === undefined ? rest.body : JSON.stringify(json),
	})
}

export async function apiJson<T>(path: string, init: RequestInit & { json?: unknown; bearer?: string } = {}): Promise<T> {
	const response = await api(path, init)
	if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`)
	return (await response.json()) as T
}

export function visit(path: string, userAgent = IPHONE, init: RequestInit = {}): Promise<Response> {
	return call(path, { ...init, headers: { 'user-agent': userAgent, ...init.headers } })
}
