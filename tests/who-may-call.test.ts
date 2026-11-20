import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateTokenResponse } from '../src/shared/api'
import { OPERATIONS } from '../src/worker/lib/openapi'
import { apiJson, call } from './helpers'

// OPERATIONS says who may call each route (`open`, `linksToken`, `owner`, else a full token), and the guide, the
// OpenAPI document and tests/api-surface.json all repeat it. What a route really allows is decided elsewhere, in
// the middleware and in each handler: this calls every route as each kind of caller, so the two can't drift apart.
// A route that an owner-only check was added to, or taken from, without the flag changing would otherwise be
// described wrongly everywhere, and the list would see no line go.

const tokens = { links: '', full: '' }
beforeAll(async () => {
	tokens.links = (await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'A shortcut', scope: 'links' } })).token
	tokens.full = (await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'An AI', scope: 'full' } })).token
})

/** The route with something in place of each id: no such page or link, which is far enough to be let in or refused. */
const address = (path: string) => path.replace(/\{\w+\}/g, 'nope1234')
const status = async (op: (typeof OPERATIONS)[number], bearer?: string) =>
	(await call(address(op.path), { method: op.method.toUpperCase(), headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })).status

describe('who may call each route is what OPERATIONS says', () => {
	for (const op of OPERATIONS) {
		const name = `${op.method.toUpperCase()} ${op.path}`
		it(`${name}: ${op.open ? 'anyone' : op.owner ? 'the owner only' : op.linksToken ? 'a links token' : 'a full token'}`, async () => {
			// Nobody: refused, unless the route is open.
			const nobody = await status(op)
			if (op.open) expect(nobody, 'with no token').not.toBe(401)
			else expect(nobody, 'with no token').toBe(401)

			// A links token: only what it is for.
			const links = await status(op, tokens.links)
			if (op.linksToken || op.open) expect(links, 'with a links token').not.toBe(403)
			else expect(links, 'with a links token').toBe(403)

			// A full token: everything but what is the owner's alone. Whatever else it answers (no such page, no body),
			// it is not a refusal.
			const full = await status(op, tokens.full)
			if (op.owner) expect(full, 'with a full token').toBe(403)
			else expect([401, 403], 'with a full token').not.toContain(full)
		})
	}

	it('covers every route there is', () => {
		expect(OPERATIONS.length).toBeGreaterThan(45)
	})
})
