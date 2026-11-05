import { z } from 'zod'
import { LOCALES, SettingsSchema, THEME_IDS } from '../../shared/content'
import { QR_MEDIA_ID, QrStyleSchema } from '../../shared/qr'
import { STARTER_IDS } from '../../shared/starters'

// Request bodies of the JSON API. routes/api.ts validates with them and
// lib/agent.ts describes them in the OpenAPI document, so the two can't drift.

export const LoginInput = z.object({ password: z.string().max(512).optional(), token: z.string().max(512).optional() })

export const NewPageInput = z.object({
	handle: z.string().max(64).describe('The page address, the first path segment. Case-insensitive; letters (Chinese too), digits, - and _'),
	name: z.string().max(60).describe('Shown as the page title'),
	theme: z.enum(THEME_IDS).optional(),
	starter: z.enum(STARTER_IDS).optional().describe('Start from sample content instead of an empty page'),
	locale: z.enum(LOCALES).optional().describe("The language of the starter's text. Defaults to the site's page language"),
	copyFrom: z.string().max(32).optional().describe('Id of a page whose draft to copy'),
})

/** POST /api/pages/:id/preview-link */
export const PreviewLinkInput = z.object({
	minutes: z.number().int().min(1).max(10080).optional().describe('How long the link works, 1 to 10080 minutes (7 days). Default 10'),
	hours: z.number().int().min(1).max(168).optional().describe('The same in hours, for tools written before minutes existed. minutes wins'),
})

/** PUT /api/settings: every field of the settings; leaving out `languages`, `hostFonts`, `bio` or `homeUrl` keeps the current value. */
export const SettingsInput = SettingsSchema.extend({
	home: SettingsSchema.shape.home.optional(),
	timezone: SettingsSchema.shape.timezone.optional(),
	locale: SettingsSchema.shape.locale.optional(),
	domain: SettingsSchema.shape.domain.optional(),
	languages: SettingsSchema.shape.languages.optional(),
	hostFonts: SettingsSchema.shape.hostFonts.optional().describe('Copy fonts to this site instead of loading them from Google. Left out keeps the current value'),
	bio: SettingsSchema.shape.bio.optional().describe('false makes this site only a link shortener: public pages go offline, short links keep working, nothing is deleted, and true brings the pages back. Left out keeps the current value'),
	qrLogo: SettingsSchema.shape.qrLogo.optional().describe('Media id of the picture in QR codes that follow the default and whose page has none; "" removes it. Left out keeps it'),
	homeUrl: SettingsSchema.shape.homeUrl.optional().describe('Where "/" redirects while bio is false: an http or https URL, or "" for a small page saying this address is for short links. Left out keeps the current value'),
})

export const PagePatchInput = z.object({
	handle: z.string().max(64).optional().describe('A new page address'),
	qrLogo: z.string().regex(QR_MEDIA_ID).nullable().optional().describe("Media id of the picture in QR codes of this page's links that follow the default; null removes it, and they use the site's"),
})

export const DomainInput = z.object({ domain: z.string().max(253) })

const time = z.number().int().nonnegative().nullable()
const utmValue = z.string().max(100).nullable().optional()
const UtmInput = z.object({ source: utmValue, medium: utmValue, campaign: utmValue, content: utmValue })

export const NewLinkInput = z.object({
	url: z.string().max(2048).describe('http:// or https:// URL'),
	slug: z.string().max(64).optional().describe('Leave out to generate one'),
	title: z.string().max(80).optional().describe('Only shown in the dashboard'),
	utm: UtmInput.optional(),
	expiresAt: time.optional().describe('Epoch milliseconds'),
})

export const BulkLinksInput = z.object({ links: z.array(NewLinkInput).min(1).max(100) })

export const LinkPatchInput = z.object({
	url: z.string().max(2048).optional(),
	slug: z.string().max(64).optional(),
	title: z.string().max(80).optional(),
	startsAt: time.optional(),
	expiresAt: time.optional(),
	password: z.string().min(1).max(200).nullable().optional().describe('null removes the password'),
	utm: UtmInput.optional(),
	status: z.enum(['active', 'archived']).optional(),
	iosUrl: z.string().max(2048).nullable().optional(),
	androidUrl: z.string().max(2048).nullable().optional(),
	lineExternal: z.boolean().optional(),
	inAppPrompt: z.boolean().optional(),
	qr: QrStyleSchema.nullable().optional(),
})

export const LinkShortInput = z.object({ slug: z.string().max(64).optional().describe('Left out, the link keeps the short link it has, or gets one made from its title') })

export const ThemeFetchInput = z.object({ url: z.string().max(2048) })

export const TOKEN_SCOPES = ['links', 'full'] as const
export const NewTokenInput = z.object({ name: z.string().trim().min(1).max(40), scope: z.enum(TOKEN_SCOPES) })

export const WipeInput = z.object({ confirm: z.literal('DELETE') })
