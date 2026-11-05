import { randomString } from '../../shared/content'
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
