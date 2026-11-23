import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AuthInfo, AuthResponse, OkResponse } from '../../shared/api'
import { msg } from '../../templates/msg'
import { guideNames, guideSite, openApi, workerNameOf } from '../lib/agent'
import { guideTopic } from '../lib/agentTopics'
import {
	adminPasswordProblem,
	createSession,
	secretsMatch,
	SESSION_COOKIE,
	SESSION_MAX_AGE,
	sessionKeyOf,
	sha256Hex,
	TOKEN_PATTERN,
	tokenTag,
	verifySession,
} from '../lib/auth'
import { ensureSchema, findTokenByHash, passwordLocked, returnPasswordTry, takePasswordTry, touchToken } from '../lib/db'
import { adminPassword, isTestSite } from '../lib/mode'
import { passwordVisitor } from '../lib/password'
import { LoginInput } from '../lib/schemas'
import { ApiError, type AppEnv, type Auth } from '../types'
import { registerAdminRoutes } from './api/admin'
import { ADMIN_TRIES, deny, readBody, readCappedText, tooManyTries } from './api/helpers'
import { registerLinkRoutes } from './api/links'
import { registerMediaRoutes } from './api/media'
import { registerPageRoutes } from './api/pages'
import { registerStatsRoutes } from './api/stats'
import { registerThemeRoutes } from './api/themes'

export { readCappedText }

export const api = new Hono<AppEnv>()

// Browsers send Origin on cross-site requests; reject those for anything that writes.
api.use('*', async (c, next) => {
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		const origin = c.req.header('origin')
		if (origin && origin !== new URL(c.req.url).origin) throw new ApiError(403, 'forbidden', msg('不接受跨站請求'))
	}
	await next()
})

api.get('/auth/info', (c) => {
	const body: AuthInfo = { setup: adminPasswordProblem(adminPassword(c.env)), testSite: isTestSite(c.env) }
	return c.json(body)
})

api.post('/auth/login', async (c) => {
	const secret = adminPassword(c.env)
	const problem = adminPasswordProblem(secret)
	if (problem) throw new ApiError(503, 'setup', problem)
	const { password } = await readBody(c, LoginInput)
	await ensureSchema(c.env.DB)
	const visitor = await passwordVisitor(c.env, ADMIN_TRIES, c.req.header('cf-connecting-ip') ?? '')
	if (await passwordLocked(c.env.DB, ADMIN_TRIES, visitor)) throw tooManyTries()
	const tried = await takePasswordTry(c.env.DB, ADMIN_TRIES, visitor)
	const giveBack = () => c.executionCtx.waitUntil(returnPasswordTry(c.env.DB, ADMIN_TRIES, visitor, tried.since).catch(() => {}))
	if (!tried.ok) {
		giveBack()
		throw tooManyTries()
	}
	if (!(await secretsMatch(password, secret))) {
		// Slows down guessing without spending CPU time.
		await scheduler.wait(800)
		throw new ApiError(401, 'wrong-password', msg('密碼不正確'))
	}
	giveBack()
	setCookie(c, SESSION_COOKIE, await createSession(await sessionKeyOf(c.env)), {
		httpOnly: true,
		secure: new URL(c.req.url).protocol === 'https:',
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_MAX_AGE,
	})
	return c.json({ ok: true, role: 'admin' })
})

api.post('/auth/logout', (c) => {
	deleteCookie(c, SESSION_COOKIE, { path: '/' })
	return c.json<OkResponse>({ ok: true })
})

// The API described for agents and tools; public, like the code it describes.
api.get('/openapi.json', (c) => c.json(openApi(new URL(c.req.url).origin), 200, { 'cache-control': 'public, max-age=300' }))

// The parts of the guide an agent reads when it needs them. Public, like /llms.txt.
api.get('/guide/:topic', (c) => {
	const text = guideTopic(c.req.param('topic'), guideNames(new URL(c.req.url).origin, workerNameOf(c.env), guideSite(c.env)))
	if (!text) throw new ApiError(404, 'not-found', msg('找不到'))
	return c.text(text, 200, { 'cache-control': 'public, max-age=300' })
})

// Everything below needs the session cookie, `Authorization: Bearer <ADMIN_PASSWORD>`,
// or `Authorization: Bearer fbk_…` (an API token).
api.use('*', async (c, next) => {
	const secret = adminPassword(c.env)
	const problem = adminPasswordProblem(secret)
	if (problem) throw new ApiError(503, 'setup', problem)
	const bearer = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
	let auth: Auth | null = null
	if (bearer && TOKEN_PATTERN.test(bearer)) {
		// sessionKeyOf waits for the schema check too, with the secret read alongside it.
		const token = await findTokenByHash(c.env.DB, await sha256Hex(bearer), await tokenTag(await sessionKeyOf(c.env)))
		if (token) {
			auth = { role: 'token', tokenId: token.id, scope: token.scope, name: token.name }
			const now = Date.now()
			// "Last used" only needs minute precision; skip the write otherwise.
			if (!token.lastUsedAt || now - token.lastUsedAt > 60_000) c.executionCtx.waitUntil(touchToken(c.env.DB, token.id, now).catch(() => {}))
		}
	} else if (bearer) {
		await ensureSchema(c.env.DB)
		const visitor = await passwordVisitor(c.env, ADMIN_TRIES, c.req.header('cf-connecting-ip') ?? '')
		if (await passwordLocked(c.env.DB, ADMIN_TRIES, visitor)) throw tooManyTries()
		if (await secretsMatch(bearer, secret)) auth = { role: 'admin' }
		// A wrong password counts and waits here as it does at the sign-in form, or this would be the quicker place to guess at.
		else {
			const tried = await takePasswordTry(c.env.DB, ADMIN_TRIES, visitor)
			if (!tried.ok) {
				c.executionCtx.waitUntil(returnPasswordTry(c.env.DB, ADMIN_TRIES, visitor, tried.since).catch(() => {}))
				throw tooManyTries()
			}
			await scheduler.wait(800)
		}
	} else {
		if (await verifySession(await sessionKeyOf(c.env), getCookie(c, SESSION_COOKIE))) auth = { role: 'admin' }
	}
	if (!auth) throw new ApiError(401, 'unauthorized', msg('請先登入'))
	if (auth.role === 'token' && auth.scope === 'links') {
		const path = c.req.path.replace(/\/+$/, '')
		const allowed = (c.req.method === 'POST' && (path === '/api/links' || path === '/api/links/bulk')) || path === '/api/auth/me'
		if (!allowed) throw deny(msg('這個 token 只能建立短網址'))
	}
	c.set('auth', auth)
	await ensureSchema(c.env.DB)
	await next()
})

api.get('/auth/me', (c) => c.json<AuthResponse>({ ok: true, role: c.get('auth').role }))

registerStatsRoutes(api)
registerPageRoutes(api)
registerMediaRoutes(api)
registerLinkRoutes(api)
registerThemeRoutes(api)
registerAdminRoutes(api)
