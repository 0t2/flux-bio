import {
	DEFAULT_SETTINGS,
	newId,
	PageContentSchema,
	randomString,
	SavedThemeSchema,
	SettingsSchema,
	storedContent,
	upgradeSettings,
	type PageContent,
	type SavedTheme,
	type Settings,
} from '../../shared/content'
import type { HostedFont } from '../../shared/fonts'
import { parseHostedFonts } from './fonts'

/**
 * The schema is created by the Worker on first use, so a fresh deploy needs
 * no migration step. Append new migrations to the end; never edit old ones.
 */
const MIGRATIONS: string[][] = [
	[
		`CREATE TABLE IF NOT EXISTS pages (
			id TEXT PRIMARY KEY,
			draft TEXT NOT NULL,
			published TEXT,
			draft_updated_at INTEGER NOT NULL,
			published_at INTEGER,
			created_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS links (
			id TEXT PRIMARY KEY,
			slug TEXT NOT NULL UNIQUE,
			url TEXT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL CHECK (kind IN ('bio', 'solo')),
			status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
			starts_at INTEGER,
			expires_at INTEGER,
			password_hash TEXT,
			utm_source TEXT,
			utm_medium TEXT,
			utm_campaign TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS stats (
			day TEXT NOT NULL,
			target TEXT NOT NULL,
			kind TEXT NOT NULL,
			dim TEXT NOT NULL,
			value TEXT NOT NULL,
			count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (day, target, kind, dim, value)
		) WITHOUT ROWID`,
		'CREATE INDEX IF NOT EXISTS stats_target_day ON stats (target, day)',
	],
	// v0.1.1: countries and devices moved to Analytics Engine; D1 keeps sources only.
	["DELETE FROM stats WHERE dim != 'source'"],
	// v0.2: several pages, content blocks, smarter short links and API tokens.
	[
		'ALTER TABLE pages ADD COLUMN handle TEXT',
		'ALTER TABLE pages ADD COLUMN position INTEGER NOT NULL DEFAULT 0',
		// v0.1 kept the one page's handle in the settings.
		`UPDATE pages SET handle = COALESCE((SELECT json_extract(value, '$.handle') FROM _meta WHERE key = 'settings'), 'me')
			WHERE handle IS NULL`,
		'CREATE UNIQUE INDEX IF NOT EXISTS pages_handle ON pages (handle)',
		'ALTER TABLE links ADD COLUMN page_id TEXT',
		"UPDATE links SET page_id = 'main' WHERE kind = 'bio'",
		'ALTER TABLE links ADD COLUMN ios_url TEXT',
		'ALTER TABLE links ADD COLUMN android_url TEXT',
		'ALTER TABLE links ADD COLUMN line_external INTEGER NOT NULL DEFAULT 0',
		'ALTER TABLE links ADD COLUMN inapp_prompt INTEGER NOT NULL DEFAULT 0',
		'ALTER TABLE links ADD COLUMN qr TEXT',
		// Page views were counted under "page"; now each page counts under its own id.
		"UPDATE stats SET target = 'main' WHERE target = 'page'",
		`CREATE TABLE IF NOT EXISTS api_tokens (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			scope TEXT NOT NULL CHECK (scope IN ('links', 'full')),
			hash TEXT NOT NULL UNIQUE,
			hint TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			last_used_at INTEGER
		)`,
	],
	[
		// Changing ADMIN_PASSWORD revokes every API token (see tokenTag in auth.ts).
		"ALTER TABLE api_tokens ADD COLUMN password_tag TEXT NOT NULL DEFAULT ''",
	],
	// v0.3: the fourth UTM tag, which tells apart places on one platform (bio, story, post).
	['ALTER TABLE links ADD COLUMN utm_content TEXT'],
	// v0.3: the fonts each published page loads from this Worker (src/worker/lib/fonts.ts).
	['ALTER TABLE pages ADD COLUMN fonts TEXT'],
	// The picture in the QR codes of a page's links that follow the default (shared/qr.ts).
	['ALTER TABLE pages ADD COLUMN qr_logo TEXT'],
	// What each page looked like when published, so a publish can be undone.
	[
		`CREATE TABLE IF NOT EXISTS page_versions (
			id TEXT PRIMARY KEY,
			page_id TEXT NOT NULL,
			content TEXT NOT NULL,
			published_at INTEGER NOT NULL,
			published_by TEXT
		)`,
		'CREATE INDEX IF NOT EXISTS page_versions_by_page ON page_versions (page_id, published_at)',
	],
]

/** How many migrations a database has run once it is up to date. */
export const SCHEMA_VERSION = MIGRATIONS.length

let ready: Promise<void> | null = null

export function ensureSchema(db: D1Database): Promise<void> {
	ready ??= migrate(db).catch((error: unknown) => {
		ready = null
		throw error
	})
	return ready
}

/** Brings the database up to date. Exported for tests; the Worker calls ensureSchema(). */
export async function migrate(db: D1Database): Promise<void> {
	await db.prepare('CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run()
	const row = await db.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").first<{ value: string }>()
	for (let version = row ? Number(row.value) : 0; version < MIGRATIONS.length; version++) {
		const statements = (MIGRATIONS[version] ?? []).map((sql) => db.prepare(sql))
		statements.push(
			db
				.prepare(
					"INSERT INTO _meta (key, value) VALUES ('schema_version', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
				)
				.bind(String(version + 1)),
		)
		await db.batch(statements)
	}
}

/** The id v0.1 gave its single page. */
export const LEGACY_PAGE_ID = 'main'

// ---------------------------------------------------------------- pages

export interface PageRow {
	id: string
	handle: string
	position: number
	draft: PageContent
	published: PageContent | null
	draftUpdatedAt: number
	publishedAt: number | null
	createdAt: number
	/** Fonts of the published content copied to KV; null loads them from Google. */
	fonts: HostedFont[] | null
	/** Media id of the picture in QR codes of this page's links that follow the default. */
	qrLogo: string | null
}

type PageRecordRow = {
	id: string
	handle: string | null
	position: number
	draft: string
	published: string | null
	draft_updated_at: number
	published_at: number | null
	created_at: number
	/** Missing until the v0.3 migration has run. */
	fonts?: string | null
	qr_logo?: string | null
}

export function parseContent(json: string | null): PageContent | null {
	if (!json) return null
	try {
		const parsed = PageContentSchema.safeParse(storedContent(JSON.parse(json)))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

function toPageRow(row: PageRecordRow): PageRow | null {
	const draft = parseContent(row.draft)
	if (!draft || !row.handle) return null
	return {
		id: row.id,
		handle: row.handle,
		position: row.position,
		draft,
		published: parseContent(row.published),
		draftUpdatedAt: row.draft_updated_at,
		publishedAt: row.published_at,
		createdAt: row.created_at,
		fonts: parseHostedFonts(row.fonts ?? null),
		qrLogo: row.qr_logo ?? null,
	}
}

export async function listPages(db: D1Database): Promise<PageRow[]> {
	const { results } = await db.prepare('SELECT * FROM pages ORDER BY position, created_at').all<PageRecordRow>()
	return results.map(toPageRow).filter((row): row is PageRow => row !== null)
}

/** Ids and handles only, for name checks. */
export async function listHandles(db: D1Database): Promise<{ id: string; handle: string; position: number }[]> {
	const { results } = await db
		.prepare('SELECT id, handle, position FROM pages WHERE handle IS NOT NULL ORDER BY position, created_at')
		.all<{ id: string; handle: string; position: number }>()
	return results
}

/** What the sitemap needs, without parsing every draft. */
export async function listPublished(db: D1Database): Promise<{ id: string; handle: string; published: string; publishedAt: number | null }[]> {
	const { results } = await db
		.prepare('SELECT id, handle, published, published_at AS publishedAt FROM pages WHERE published IS NOT NULL AND handle IS NOT NULL ORDER BY position, created_at')
		.all<{ id: string; handle: string; published: string; publishedAt: number | null }>()
	return results
}

export async function getPage(db: D1Database, id: string): Promise<PageRow | null> {
	const row = await db.prepare('SELECT * FROM pages WHERE id = ?1').bind(id).first<PageRecordRow>()
	return row ? toPageRow(row) : null
}

export async function getPageByHandle(db: D1Database, handle: string): Promise<PageRow | null> {
	const row = await db.prepare('SELECT * FROM pages WHERE handle = ?1').bind(handle).first<PageRecordRow>()
	return row ? toPageRow(row) : null
}

export function insertPageStatement(
	db: D1Database,
	page: Omit<PageRow, 'draftUpdatedAt' | 'fonts' | 'qrLogo'> & { draftUpdatedAt?: number; qrLogo?: string | null },
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO pages (id, handle, position, draft, published, draft_updated_at, published_at, created_at, qr_logo)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
		)
		.bind(
			page.id,
			page.handle,
			page.position,
			JSON.stringify(page.draft),
			page.published ? JSON.stringify(page.published) : null,
			page.draftUpdatedAt ?? page.createdAt,
			page.publishedAt,
			page.createdAt,
			page.qrLogo ?? null,
		)
}

/** Returns the new draft time, or null when the page doesn't exist. */
/**
 * Replaces a draft, if it is still the one `seen` names, and returns its new version, which is
 * always higher. Null means no such page, or someone else got there first.
 */
export async function saveDraft(db: D1Database, id: string, draft: PageContent, seen: number): Promise<number | null> {
	const row = await db
		.prepare('UPDATE pages SET draft = ?1, draft_updated_at = MAX(?2, draft_updated_at + 1) WHERE id = ?3 AND draft_updated_at = ?4 RETURNING draft_updated_at')
		.bind(JSON.stringify(draft), Date.now(), id, seen)
		.first<{ draft_updated_at: number }>()
	return row?.draft_updated_at ?? null
}

// ---------------------------------------------------------------- published versions

export interface PageVersionRow {
	id: string
	publishedAt: number
	/** "owner", "token:<its name>", or null for a version from before these were recorded. */
	publishedBy: string | null
}

type PageVersionRecord = { id: string; published_at: number; published_by: string | null }

const toVersionRow = (row: PageVersionRecord): PageVersionRow => ({ id: row.id, publishedAt: row.published_at, publishedBy: row.published_by })

/** Newest first. */
export async function listPageVersions(db: D1Database, pageId: string): Promise<PageVersionRow[]> {
	const { results } = await db
		.prepare('SELECT id, published_at, published_by FROM page_versions WHERE page_id = ?1 ORDER BY published_at DESC, rowid DESC')
		.bind(pageId)
		.all<PageVersionRecord>()
	return results.map(toVersionRow)
}

export async function getPageVersion(db: D1Database, pageId: string, id: string): Promise<(PageVersionRow & { content: PageContent }) | null> {
	const row = await db
		.prepare('SELECT id, published_at, published_by, content FROM page_versions WHERE page_id = ?1 AND id = ?2')
		.bind(pageId, id)
		.first<PageVersionRecord & { content: string }>()
	const content = row ? parseContent(row.content) : null
	return row && content ? { ...toVersionRow(row), content } : null
}

/** Records a publish. Run before the page itself changes, because the first one also saves what is live now. */
export function pageVersionStatements(db: D1Database, pageId: string, content: PageContent, publishedAt: number, by: string | null, keep: number): D1PreparedStatement[] {
	return [
		// A page published before versions were kept, or restored from a backup, can still go back one.
		db
			.prepare(
				`INSERT INTO page_versions (id, page_id, content, published_at, published_by)
				SELECT ?1, id, published, published_at, NULL FROM pages
				WHERE id = ?2 AND published IS NOT NULL AND published_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM page_versions WHERE page_id = ?2)`,
			)
			.bind(newId(), pageId),
		db
			.prepare('INSERT INTO page_versions (id, page_id, content, published_at, published_by) VALUES (?1, ?2, ?3, ?4, ?5)')
			.bind(newId(), pageId, JSON.stringify(content), publishedAt, by),
		db
			.prepare('DELETE FROM page_versions WHERE page_id = ?1 AND id NOT IN (SELECT id FROM page_versions WHERE page_id = ?1 ORDER BY published_at DESC, rowid DESC LIMIT ?2)')
			.bind(pageId, keep),
	]
}

// ---------------------------------------------------------------- settings, themes, secret

async function readMeta(db: D1Database, key: string): Promise<unknown> {
	const row = await db.prepare('SELECT value FROM _meta WHERE key = ?1').bind(key).first<{ value: string }>()
	if (!row) return undefined
	try {
		return JSON.parse(row.value)
	} catch {
		return undefined
	}
}

function writeMetaStatement(db: D1Database, key: string, value: unknown): D1PreparedStatement {
	return db
		.prepare('INSERT INTO _meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
		.bind(key, JSON.stringify(value))
}

export async function loadSettings(db: D1Database): Promise<Settings> {
	const parsed = SettingsSchema.safeParse(upgradeSettings(await readMeta(db, 'settings'), LEGACY_PAGE_ID))
	return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS }
}

export const saveSettingsStatement = (db: D1Database, settings: Settings) => writeMetaStatement(db, 'settings', settings)

export async function loadThemes(db: D1Database): Promise<SavedTheme[]> {
	const raw = await readMeta(db, 'themes')
	if (!Array.isArray(raw)) return []
	return raw.flatMap((entry) => {
		const parsed = SavedThemeSchema.safeParse(entry)
		return parsed.success ? [parsed.data] : []
	})
}

export const saveThemesStatement = (db: D1Database, themes: SavedTheme[]) => writeMetaStatement(db, 'themes', themes)

let secret: Promise<string> | null = null

/**
 * A random secret for this deployment, made on first use and never shown or
 * exported. Sessions and the custom domain check are keyed with it, so
 * nothing a visitor can get hold of is signed with ADMIN_PASSWORD itself.
 * Wiping the data (clearAllData in backup.ts) keeps it.
 */
export function deploymentSecret(db: D1Database): Promise<string> {
	secret ??= (async () => {
		await ensureSchema(db)
		const existing = await readMeta(db, 'secret')
		if (typeof existing === 'string') return existing
		await db.prepare("INSERT OR IGNORE INTO _meta (key, value) VALUES ('secret', ?1)").bind(JSON.stringify(randomString(43))).run()
		const stored = await readMeta(db, 'secret')
		if (typeof stored !== 'string') throw new Error('Could not create the deployment secret')
		return stored
	})().catch((error: unknown) => {
		secret = null
		throw error
	})
	return secret
}

// ---------------------------------------------------------------- short links

export interface LinkRow {
	id: string
	slug: string
	url: string
	title: string
	kind: 'bio' | 'solo'
	/** The page a bio link belongs to; null for standalone links. */
	pageId: string | null
	status: 'active' | 'archived'
	startsAt: number | null
	expiresAt: number | null
	passwordHash: string | null
	utmSource: string | null
	utmMedium: string | null
	utmCampaign: string | null
	utmContent: string | null
	/** Send iPhone/iPad and Android visitors somewhere else, e.g. an app store. */
	iosUrl: string | null
	androidUrl: string | null
	/** In LINE, add openExternalBrowser=1 so the link opens in the phone's browser. */
	lineExternal: boolean
	/** In Instagram, Threads and Facebook, first show how to leave the in-app browser. */
	inAppPrompt: boolean
	/** QR code style as JSON (see shared/qr.ts), or null for the default. */
	qr: unknown
	createdAt: number
	updatedAt: number
}

type LinkRecordRow = {
	id: string
	slug: string
	url: string
	title: string
	kind: 'bio' | 'solo'
	page_id: string | null
	status: 'active' | 'archived'
	starts_at: number | null
	expires_at: number | null
	password_hash: string | null
	utm_source: string | null
	utm_medium: string | null
	utm_campaign: string | null
	utm_content: string | null
	ios_url: string | null
	android_url: string | null
	line_external: number
	inapp_prompt: number
	qr: string | null
	created_at: number
	updated_at: number
}

function toLinkRow(row: LinkRecordRow): LinkRow {
	let qr: unknown = null
	try {
		qr = row.qr ? JSON.parse(row.qr) : null
	} catch {
		qr = null
	}
	return {
		id: row.id,
		slug: row.slug,
		url: row.url,
		title: row.title,
		kind: row.kind,
		pageId: row.page_id,
		status: row.status,
		startsAt: row.starts_at,
		expiresAt: row.expires_at,
		passwordHash: row.password_hash,
		utmSource: row.utm_source,
		utmMedium: row.utm_medium,
		utmCampaign: row.utm_campaign,
		utmContent: row.utm_content ?? null,
		iosUrl: row.ios_url,
		androidUrl: row.android_url,
		lineExternal: Boolean(row.line_external),
		inAppPrompt: Boolean(row.inapp_prompt),
		qr,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

export async function listLinks(db: D1Database): Promise<LinkRow[]> {
	const { results } = await db.prepare('SELECT * FROM links ORDER BY created_at DESC').all<LinkRecordRow>()
	return results.map(toLinkRow)
}

export async function listPageLinks(db: D1Database, pageId: string): Promise<LinkRow[]> {
	const { results } = await db.prepare("SELECT * FROM links WHERE page_id = ?1 AND status = 'active'").bind(pageId).all<LinkRecordRow>()
	return results.map(toLinkRow)
}

export async function getLink(db: D1Database, id: string): Promise<LinkRow | null> {
	const row = await db.prepare('SELECT * FROM links WHERE id = ?1').bind(id).first<LinkRecordRow>()
	return row ? toLinkRow(row) : null
}

export async function getLinkBySlug(db: D1Database, slug: string): Promise<LinkRow | null> {
	const row = await db.prepare('SELECT * FROM links WHERE slug = ?1').bind(slug).first<LinkRecordRow>()
	return row ? toLinkRow(row) : null
}

export async function countLinks(db: D1Database): Promise<number> {
	const row = await db.prepare('SELECT COUNT(*) AS n FROM links').first<{ n: number }>()
	return row?.n ?? 0
}

export function upsertLinkStatement(db: D1Database, link: LinkRow): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO links (id, slug, url, title, kind, page_id, status, starts_at, expires_at, password_hash,
				utm_source, utm_medium, utm_campaign, ios_url, android_url, line_external, inapp_prompt, qr, created_at, updated_at,
				utm_content)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
			ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, url = excluded.url, title = excluded.title, kind = excluded.kind,
				page_id = excluded.page_id, status = excluded.status, starts_at = excluded.starts_at, expires_at = excluded.expires_at,
				password_hash = excluded.password_hash, utm_source = excluded.utm_source, utm_medium = excluded.utm_medium,
				utm_campaign = excluded.utm_campaign, utm_content = excluded.utm_content, ios_url = excluded.ios_url, android_url = excluded.android_url,
				line_external = excluded.line_external, inapp_prompt = excluded.inapp_prompt, qr = excluded.qr,
				updated_at = excluded.updated_at`,
		)
		.bind(
			link.id,
			link.slug,
			link.url,
			link.title,
			link.kind,
			link.pageId,
			link.status,
			link.startsAt,
			link.expiresAt,
			link.passwordHash,
			link.utmSource,
			link.utmMedium,
			link.utmCampaign,
			link.iosUrl,
			link.androidUrl,
			link.lineExternal ? 1 : 0,
			link.inAppPrompt ? 1 : 0,
			link.qr == null ? null : JSON.stringify(link.qr),
			link.createdAt,
			link.updatedAt,
			link.utmContent,
		)
}

// ---------------------------------------------------------------- API tokens

export type TokenScope = 'links' | 'full'

export interface TokenRow {
	id: string
	name: string
	scope: TokenScope
	/** The last four characters, to tell tokens apart. */
	hint: string
	createdAt: number
	lastUsedAt: number | null
}

type TokenRecordRow = { id: string; name: string; scope: TokenScope; hint: string; created_at: number; last_used_at: number | null }

const toTokenRow = (row: TokenRecordRow): TokenRow => ({
	id: row.id,
	name: row.name,
	scope: row.scope,
	hint: row.hint,
	createdAt: row.created_at,
	lastUsedAt: row.last_used_at,
})

/** The tokens that still work. `tag` is the current tokenTag(); tokens made under an older password are deleted. */
export async function listTokens(db: D1Database, tag: string): Promise<TokenRow[]> {
	const [, { results }] = await db.batch<TokenRecordRow>([
		db.prepare('DELETE FROM api_tokens WHERE password_tag != ?1').bind(tag),
		db.prepare('SELECT id, name, scope, hint, created_at, last_used_at FROM api_tokens ORDER BY created_at DESC'),
	])
	return results.map(toTokenRow)
}

export async function insertToken(db: D1Database, token: TokenRow & { hash: string; tag: string }): Promise<void> {
	await db
		.prepare(
			'INSERT INTO api_tokens (id, name, scope, hash, hint, created_at, last_used_at, password_tag) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)',
		)
		.bind(token.id, token.name, token.scope, token.hash, token.hint, token.createdAt, token.tag)
		.run()
}

export async function findTokenByHash(db: D1Database, hash: string, tag: string): Promise<TokenRow | null> {
	const row = await db
		.prepare('SELECT id, name, scope, hint, created_at, last_used_at FROM api_tokens WHERE hash = ?1 AND password_tag = ?2')
		.bind(hash, tag)
		.first<TokenRecordRow>()
	return row ? toTokenRow(row) : null
}

export async function touchToken(db: D1Database, id: string, at: number): Promise<void> {
	await db.prepare('UPDATE api_tokens SET last_used_at = ?1 WHERE id = ?2').bind(at, id).run()
}

export async function deleteToken(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare('DELETE FROM api_tokens WHERE id = ?1').bind(id).run()
	return Boolean(result.meta.changes)
}
