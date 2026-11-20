import { randomString } from '../../shared/content'
import { daySalt } from './analytics'
import { secretsMatch, sha256Hex } from './auth'

/**
 * Link passwords guard a destination URL that sits next to them in the same
 * database, so a fast salted hash is enough; a slow KDF would only burn the
 * free plan's 10 ms CPU budget on every attempt.
 */
export async function hashLinkPassword(password: string): Promise<string> {
	const salt = randomString(16)
	return `s1$${salt}$${await sha256Hex(`${salt}:${password}`)}`
}

export async function verifyLinkPassword(password: string, stored: string): Promise<boolean> {
	const [version, salt, hash] = stored.split('$')
	if (version !== 's1' || !salt || !hash) return false
	return secretsMatch(await sha256Hex(`${salt}:${password}`), hash)
}

/**
 * The part of an address that is one visitor's: all of an IPv4 address, and the first half of an IPv6 one, whose
 * other half is the visitor's own to choose, eighteen billion billion of them.
 */
export function visitorNetwork(ip: string): string {
	const address = ip.trim().toLowerCase()
	const mapped = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)
	if (mapped) return mapped[1] ?? ''
	if (!address.includes(':')) return address
	const [head = '', tail = ''] = address.split('::')
	const before = head ? head.split(':') : []
	const after = tail ? tail.split(':') : []
	const groups = address.includes('::') ? [...before, ...Array.from({ length: Math.max(0, 8 - before.length - after.length) }, () => '0'), ...after] : before
	return groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ''))
		.join(':')
}

/**
 * Who is trying a link's password, as far as counting their wrong tries needs: four characters that are the same
 * for the same visitor at the same link on the same day. Made from the address with a salt that is random and kept
 * for the day (daySalt), and cut that short on purpose: sixty-five thousand IPv4 addresses share each, so even
 * someone who reads the salt out of D1, as whoever has the Cloudflare account can for a month afterwards, learns
 * from a row that one of that many was here, and not which. Two visitors at one link share a count about once in
 * sixty-five thousand pairs, which costs them tries and nothing else. Nothing here keeps the address itself.
 */
export async function passwordVisitor(env: Env, linkId: string, ip: string, now = Date.now()): Promise<string> {
	const salt = await daySalt(env, new Date(now).toISOString().slice(0, 10), 'tries-salt')
	return (await sha256Hex(`${salt}|${linkId}|${visitorNetwork(ip)}`)).slice(0, 4)
}

