import { z } from 'zod'
import { MEDIA_ID, PageContentInputSchema, SavedThemeSchema, SettingsSchema } from './content'
import { QR_MEDIA_ID } from './qr'

/**
 * The backup file (GET /api/export): every page, short link and saved theme,
 * so an old deploy can move to a new one. Click stats are not included
 * (export those as CSV from 數據).
 *
 * The file 設定 → 下載備份 makes, like those of the v0.2 dashboard, also carries
 * `mediaFiles` (uploaded images as data URLs); agents upload those again before
 * importing.
 */
export const BACKUP_VERSION = 1

const id = z.string().regex(/^[\w-]{4,32}$/)
const time = z.number().int().nonnegative().nullable()
const utm = z.string().max(100).nullable()

export const ShortLinkBackupSchema = z.object({
	id,
	/** Archived bio links keep "~<id>" here. */
	slug: z.string().min(1).max(80),
	url: z.string().max(2048),
	title: z.string().max(80),
	kind: z.enum(['bio', 'solo']),
	pageId: z.string().max(32).nullable(),
	status: z.enum(['active', 'archived']),
	startsAt: time,
	expiresAt: time,
	passwordHash: z.string().max(200).nullable(),
	utm: z.object({ source: utm, medium: utm, campaign: utm, content: utm.optional() }),
	iosUrl: z.string().max(2048).nullable(),
	androidUrl: z.string().max(2048).nullable(),
	lineExternal: z.boolean(),
	inAppPrompt: z.boolean(),
	qr: z.unknown().optional(),
	createdAt: z.number().int().nonnegative(),
})
export type ShortLinkBackup = z.infer<typeof ShortLinkBackupSchema>

export const PageBackupSchema = z.object({
	id: z.string().regex(/^[\w-]{1,32}$/),
	handle: z.string().min(1).max(64),
	position: z.number().int(),
	draft: PageContentInputSchema,
	published: PageContentInputSchema.nullable(),
	publishedAt: time,
	createdAt: z.number().int().nonnegative(),
	// Older backups have none.
	qrLogo: z.string().regex(QR_MEDIA_ID).nullable().optional(),
})
export type PageBackup = z.infer<typeof PageBackupSchema>

export const BackupSchema = z.object({
	app: z.literal('fluxbio'),
	version: z.literal(BACKUP_VERSION),
	exportedAt: z.string().max(40),
	settings: SettingsSchema.pick({ home: true, timezone: true }).extend({
		// Backups from before v0.3 may say "auto" (every language) and have no list of languages.
		locale: z.union([SettingsSchema.shape.locale, z.literal('auto')]),
		languages: SettingsSchema.shape.languages.optional(),
		hostFonts: SettingsSchema.shape.hostFonts.optional(),
		// Older backups have neither: pages could not be switched off yet.
		bio: SettingsSchema.shape.bio.optional(),
		homeUrl: SettingsSchema.shape.homeUrl.optional(),
		qrLogo: SettingsSchema.shape.qrLogo.optional(),
	}),
	// A site with only short links has no pages.
	pages: z.array(PageBackupSchema),
	shortLinks: z.array(ShortLinkBackupSchema),
	themes: z.array(SavedThemeSchema).max(100),
	/** Ids of the uploaded images the pages use. */
	media: z.array(z.string().regex(MEDIA_ID)),
})
export type Backup = z.infer<typeof BackupSchema>

/**
 * A backup with its images inside as `mediaFiles`, as pieces of text to make a
 * file from. In pieces because a site with many images can outgrow the longest
 * string a browser allows.
 */
export function backupFileParts(backup: Backup, images: readonly (readonly [string, string])[]): string[] {
	// Everything but the closing brace, so `mediaFiles` joins the same object.
	const parts = [JSON.stringify(backup, null, '\t').slice(0, -2), ',\n\t"mediaFiles": {']
	images.forEach(([id, dataUrl], index) => {
		parts.push(`${index ? ',' : ''}\n\t\t${JSON.stringify(id)}: `, JSON.stringify(dataUrl))
	})
	parts.push(images.length ? '\n\t}\n}\n' : '}\n}\n')
	return parts
}

/** Every uploaded image a page refers to. */
export function mediaIdsOf(content: z.infer<typeof PageContentInputSchema>): string[] {
	const ids = new Set<string>()
	const add = (value: string | null) => value && ids.add(value)
	add(content.profile.avatar)
	add(content.seo.image)
	add(content.seo.autoImage)
	// Copies from before they existed have no such fields.
	add(content.appearance.coverImage ?? null)
	add(content.appearance.bgImage ?? null)
	for (const item of content.items) {
		if (item.kind === 'gallery') item.images.forEach((image) => add(image.image))
		if (item.kind === 'product') item.products.forEach((product) => add(product.image))
	}
	// Someone's own HTML names its pictures by address.
	if (content.custom?.kind === 'html') for (const match of content.custom.html.matchAll(/\/media\/([\w.-]+)/g)) add(match[1] ?? null)
	return [...ids]
}
