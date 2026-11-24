import type { Hono } from 'hono'
import type {
	CreateTokenResponse,
	ExportResponse,
	ImportResponse,
	OkResponse,
	SettingsResponse,
	TokensResponse,
	VerifyDomainResponse,
	WipeResponse,
} from '../../../shared/api'
import { BackupSchema } from '../../../shared/backup'
import { newId, randomString } from '../../../shared/content'
import { msg } from '../../../templates/msg'
import { ApiError, type AppEnv } from '../../types'
import { sessionKeyOf, sha256Hex, tokenTag } from '../../lib/auth'
import { clearAllData, exportData, importData } from '../../lib/backup'
import { deleteToken, insertToken, listTokens, loadSettings } from '../../lib/db'
import { verifyDomain } from '../../lib/domain'
import { normalizeDomain, updateSettings } from '../../lib/ops'
import { DomainInput, NewTokenInput, SettingsInput, WipeInput } from '../../lib/schemas'
import { readBody, requireOwner } from './helpers'

export function registerAdminRoutes(api: Hono<AppEnv>): void {
	api.put('/settings', async (c) => {
		const input = await readBody(c, SettingsInput)
		let patch = input
		if (input.domain !== undefined) {
			const current = await loadSettings(c.env.DB)
			const domain = normalizeDomain(input.domain)
			if (domain !== current.domain && domain) {
				const check = await verifyDomain(c.env, domain, new URL(c.req.url))
				if (!check.ok) throw new ApiError(400, 'domain', { key: check.key, params: check.params })
			}
			patch = { ...input, domain }
		}
		// Only what was asked for is handed on. What it leaves out is read again when it is saved, not taken from the
		// settings read above: checking a domain can take seconds, and someone else may have saved in that time.
		const { settings, copiesLeft } = await updateSettings(c.env, patch)
		return c.json<SettingsResponse>({ settings, ...(copiesLeft ? { copiesLeft } : {}) })
	})

	api.post('/settings/verify-domain', async (c) => {
		const { domain } = await readBody(c, DomainInput)
		const host = normalizeDomain(domain)
		if (!host) throw new ApiError(400, 'invalid', msg('請輸入網域'))
		return c.json<VerifyDomainResponse>({ domain: host, ...(await verifyDomain(c.env, host, new URL(c.req.url))) })
	})

	// ---------------------------------------------------------------- API tokens

	api.get('/tokens', async (c) => {
		requireOwner(c.get('auth'), msg('管理 token'))
		return c.json<TokensResponse>({ tokens: await listTokens(c.env.DB, await tokenTag(await sessionKeyOf(c.env))) })
	})

	api.post('/tokens', async (c) => {
		requireOwner(c.get('auth'), msg('管理 token'))
		const { name, scope } = await readBody(c, NewTokenInput)
		const tag = await tokenTag(await sessionKeyOf(c.env))
		if ((await listTokens(c.env.DB, tag)).length >= 50) throw new ApiError(409, 'limit', msg('最多 50 個 token'))
		const token = `fbk_${randomString(32)}`
		const info = { id: newId(), name, scope, hint: token.slice(-4), createdAt: Date.now(), lastUsedAt: null }
		await insertToken(c.env.DB, { ...info, hash: await sha256Hex(token), tag })
		const body: CreateTokenResponse = { token, info }
		return c.json(body, 201)
	})

	api.delete('/tokens/:id', async (c) => {
		requireOwner(c.get('auth'), msg('管理 token'))
		if (!(await deleteToken(c.env.DB, c.req.param('id')))) throw new ApiError(404, 'not-found', msg('找不到這個 token'))
		return c.json<OkResponse>({ ok: true })
	})

	// ---------------------------------------------------------------- backup and reset

	api.get('/export', async (c) => c.json<ExportResponse>(await exportData(c.env)))

	// Agents restore and move deployments, so full tokens may import; "links" tokens never get this far.
	api.post('/import', async (c) => c.json<ImportResponse>(await importData(c.env, await readBody(c, BackupSchema))))

	api.delete('/data', async (c) => {
		requireOwner(c.get('auth'), msg('清除資料'))
		await readBody(c, WipeInput)
		const body: WipeResponse = await clearAllData(c.env)
		return c.json(body)
	})
}
