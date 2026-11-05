import { msg } from '../../templates/msg'
import { deploymentSecret } from './db'
import { adminPassword } from './mode'

const encoder = new TextEncoder()

export const SESSION_COOKIE = 'fluxbio_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

/** Returns why the admin can't be used yet, or null when ADMIN_PASSWORD is fine. */
export function adminPasswordProblem(password: string): string | null {
	if (!password) {
		return msg('還沒設定 ADMIN_PASSWORD（後台密碼）。本機請寫在 .dev.vars；正式環境請設成 Worker 的 secret。')
	}
	if (password.length < 12) return msg('ADMIN_PASSWORD 太短了，至少要 12 個字元。')
	return null
}

function base64url(bytes: ArrayBuffer): string {
	let binary = ''
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string): Uint8Array | null {
	try {
		const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
		return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
	} catch {
		return null
	}
}

function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	])
}

/**
 * The key that signs sessions: ADMIN_PASSWORD mixed with the deployment's
 * own random secret (deploymentSecret in db.ts). Changing the password still
 * signs everyone out, but a cookie from one deployment means nothing on
 * another, and a cookie can't be used to test guesses at the password.
 */
export async function sessionKey(deploymentSecret: string, password: string): Promise<string> {
	return base64url(await crypto.subtle.sign('HMAC', await hmacKey(deploymentSecret), encoder.encode(`session:${password}`)))
}

export const sessionKeyOf = async (env: Env): Promise<string> => sessionKey(await deploymentSecret(env.DB), adminPassword(env))

/**
 * A draft preview link's token is "<page id>.<expiry>.<signature>", signed with
 * sessionKey(), so changing the password ends every link. Nothing is stored.
 */
export async function createPreviewToken(key: string, pageId: string, expiresAt: number): Promise<string> {
	const expiry = Math.floor(expiresAt / 1000)
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(key), encoder.encode(`preview.${pageId}.${expiry}`))
	return `${pageId}.${expiry}.${base64url(signature)}`
}

/** The page and expiry a token was signed for, or null when it is malformed or forged. An expired token still reads. */
export async function readPreviewToken(key: string, token: string): Promise<{ pageId: string; expiresAt: number } | null> {
	const [pageId, expiry, signature, ...rest] = token.split('.')
	if (rest.length || !pageId || !signature || !expiry || !/^\d+$/.test(expiry)) return null
	const bytes = fromBase64url(signature)
	if (!bytes) return null
	const valid = await crypto.subtle.verify('HMAC', await hmacKey(key), bytes, encoder.encode(`preview.${pageId}.${expiry}`))
	return valid ? { pageId, expiresAt: Number(expiry) * 1000 } : null
}

/** API tokens carry this tag; changing ADMIN_PASSWORD changes it, which revokes every token. */
export async function tokenTag(key: string): Promise<string> {
	return (await sha256Hex(`tokens:${key}`)).slice(0, 32)
}

/** The cookie value is "v2.admin.<expiry>.<signature>", signed with sessionKey(). */
export async function createSession(key: string): Promise<string> {
	const payload = `v2.admin.${Math.floor(Date.now() / 1000) + SESSION_MAX_AGE}`
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(key), encoder.encode(payload))
	return `${payload}.${base64url(signature)}`
}

/** Whether the cookie is a current session; false when it is missing, expired or forged. */
export async function verifySession(key: string, value: string | undefined): Promise<boolean> {
	if (!value) return false
	// v0.1's "v1.<expiry>.<signature>" cookies were signed differently; those owners sign in again once.
	const [version, role, expiry, signature, ...rest] = value.split('.')
	if (version !== 'v2' || role !== 'admin' || rest.length || !expiry || !signature) return false
	if (Number(expiry) * 1000 < Date.now()) return false
	const bytes = fromBase64url(signature)
	if (!bytes) return false
	return crypto.subtle.verify('HMAC', await hmacKey(key), bytes, encoder.encode(`v2.admin.${expiry}`))
}

async function sha256(value: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', encoder.encode(value))
}

/** Constant-time comparison of two secrets of any length. */
export async function secretsMatch(a: string, b: string): Promise<boolean> {
	const [hashA, hashB] = await Promise.all([sha256(a), sha256(b)])
	return crypto.subtle.timingSafeEqual(hashA, hashB)
}

export async function sha256Hex(value: string): Promise<string> {
	return [...new Uint8Array(await sha256(value))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** API tokens look like "fbk_" followed by 32 letters and digits. */
export const TOKEN_PATTERN = /^fbk_[0-9A-Za-z]{32}$/
