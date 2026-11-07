import { randomString } from '../../shared/content'
import { fill, msg, type Params } from '../../templates/msg'
import { deploymentSecret } from './db'

/**
 * Custom domain check: this Worker asks https://<domain>/_fluxbio/ping to
 * sign a random nonce and the receiving hostname with the site's secret.
 * A ping relayed to another hostname produces a different signature.
 * Anyone can call the ping, which is why it never signs with
 * ADMIN_PASSWORD: that would let them test guesses at the password offline.
 */

const encoder = new TextEncoder()

export async function pingSignature(env: Env, hostname: string, nonce: string): Promise<string> {
	const secret = await deploymentSecret(env.DB)
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`fluxbio-ping:${hostname.toLowerCase()}:${nonce}`))
	return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface DomainCheck {
	ok: boolean
	/** In zh-TW. */
	message: string
	/** The message as a translation key with its values (see src/templates/msg.ts). */
	key: string
	params: Params
}

const check = (ok: boolean, key: string, params: Params): DomainCheck => ({ ok, message: fill(key, params), key, params })

/**
 * A request on the exact HTTPS origin already reached this site. Local HTTP
 * or requests on a nonstandard port still need the HTTPS check.
 */
export async function verifyDomain(env: Env, domain: string, via?: URL): Promise<DomainCheck> {
	if (via?.origin === `https://${domain}`) return check(true, msg('{domain} 已經接到這個 Worker。'), { domain })
	const nonce = randomString(24)
	let response: Response
	try {
		response = await fetch(`https://${domain}/_fluxbio/ping?n=${nonce}`, {
			redirect: 'manual',
			headers: { 'user-agent': 'FluxBio domain check' },
			signal: AbortSignal.timeout(6000),
		})
	} catch {
		return check(false, msg('連不上 {domain}。請確認已在 Cloudflare 後台把這個網域設為 Worker 的自訂網域，等 DNS 生效後再試一次。'), { domain })
	}
	if (!response.ok) {
		return check(false, msg('{domain} 回應了 {status}，看起來還沒接到這個 Worker。'), { domain, status: response.status })
	}
	const body = (await response.text()).trim()
	if (body !== (await pingSignature(env, domain, nonce))) {
		return check(false, msg('{domain} 有回應，但接到的是另一套 FluxBio。'), { domain })
	}
	return check(true, msg('{domain} 已經接到這個 Worker。'), { domain })
}
