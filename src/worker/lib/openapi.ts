import { z } from '../../shared/zod'
import { BackupSchema } from '../../shared/backup'
import { PageContentSchema, ThemePresetSchema } from '../../shared/content'
import { FONT_CATEGORIES, FONT_SCRIPTS } from '../../shared/fonts'
import {
	BulkLinksInput,
	DomainInput,
	LinkPatchInput,
	LinkShortInput,
	NewLinkInput,
	NewPageInput,
	NewTokenInput,
	PreviewLinkInput,
	PagePatchInput,
	SettingsInput,
	StatsClearInput,
	ThemeFetchInput,
	WipeInput,
} from './schemas'

// The operations of the JSON API, described for agents and tools. Turning the
// zod schemas into JSON Schema costs more CPU than a free-plan request allows,
// so vite.openapi.ts runs openApiDocument() at build time and the Worker
// serves the result (see openApi() in agent.ts). Keep this file free of
// Worker-only imports: it also runs in Node.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface Operation {
	method: Method
	/** OpenAPI path, e.g. /api/pages/{id}. */
	path: string
	id: string
	tag: string
	summary: string
	/** At most 300 characters (ChatGPT actions cut longer ones). */
	description?: string
	body?: z.ZodType | 'page-content' | 'image'
	query?: { name: string; description: string; enum?: readonly (string | number)[] }[]
	/** Refused for API tokens: the owner does it in the dashboard. Left out of the OpenAPI document. */
	owner?: true
	/** Allowed for "links" tokens. Everything else needs a "full" token. */
	linksToken?: true
	/** Needs no token. */
	open?: true
	produces?: 'html' | 'csv' | 'text' | 'svg'
	/** Says which draft the caller read: If-Match with the page's draftUpdatedAt. */
	draftVersion?: 'required' | 'optional'
}

const DAYS = { name: 'days', description: 'Period length in days (default 30)', enum: [7, 30, 90] }

export const OPERATIONS: Operation[] = [
	{ method: 'get', path: '/api/auth/me', id: 'whoAmI', tag: 'Account', summary: 'Check that the token works', linksToken: true },
	{
		method: 'get',
		path: '/api/guide/{topic}',
		id: 'readGuide',
		tag: 'Account',
		summary: 'Read a part of the guide',
		description: 'Plain text, no token needed. Topics: first-conversation, trying-it, faq, custom-page, look, links, translate, test-site, quota, move, domain, short-links-only, update, remove. /llms.txt says when to read each.',
		open: true,
		produces: 'text',
	},
	{
		method: 'get',
		path: '/api/state',
		id: 'getState',
		tag: 'Account',
		summary: 'Everything at a glance',
		description: 'Version, public origin, settings (home page, time zone, locale, domain, whether pages are on), every page with its link count and 7-day clicks, limits, and testSite: whether this is the owner\'s test site rather than their live one. Start here.',
	},
	{ method: 'get', path: '/api/pages', id: 'listPages', tag: 'Pages', summary: 'List pages' },
	{ method: 'post', path: '/api/pages', id: 'createPage', tag: 'Pages', summary: 'Create a page', description: 'The first page becomes the home page at "/".', body: NewPageInput },
	{
		method: 'get',
		path: '/api/pages/{id}',
		id: 'getPage',
		tag: 'Pages',
		summary: "A page's draft and published content",
		description: 'untranslated lists, per language turned on in settings.languages, the texts in the draft with no translation yet. See saveDraft for how to add them. With If-None-Match set to a draftUpdatedAt you hold, answers 304 while the draft is still that one.',
	},
	{
		method: 'patch',
		path: '/api/pages/{id}',
		id: 'updatePage',
		tag: 'Pages',
		summary: 'Change the page address, or its default QR code picture',
		description: 'A new `handle` takes effect at once. The old address stops working, so links to it in bios, posts and QR codes break. Confirm with the owner first.',
		body: PagePatchInput,
	},
	{
		method: 'delete',
		path: '/api/pages/{id}',
		id: 'deletePage',
		tag: 'Pages',
		summary: 'Delete a page',
		description: 'Permanent. Turns off its short links. Not allowed for the last page. Confirm with the owner first.',
	},
	{
		method: 'put',
		path: '/api/pages/{id}/draft',
		id: 'saveDraft',
		tag: 'Pages',
		summary: 'Replace the draft',
		description: 'Read page.draft, change it, send all of it back with If-Match. 409 draft-changed: read it again. Visitors see nothing until you publish. translations: { "<language>": { "<text as written>": "<translation>" } }.',
		body: 'page-content',
		draftVersion: 'required',
	},
	{
		method: 'post',
		path: '/api/pages/{id}/publish',
		id: 'publishPage',
		tag: 'Pages',
		summary: 'Publish the draft',
		description: 'Makes the draft live for every visitor and fills in empty link slugs. 400 lists problems[]; 409 means a slug is taken. Links that left the page stop redirecting. untranslated lists texts that show as written in the languages turned on. With settings.bio off, nothing shows until it is on.',
		draftVersion: 'optional',
	},
	{
		method: 'put',
		path: '/api/pages/{id}/links/{itemId}/short',
		id: 'setPageLinkShort',
		tag: 'Pages',
		summary: 'Give a link on a page its short link, or a new slug, at once',
		description: 'No publish needed: the short link works straight away, even on a page that is not public yet, and the old slug stops working at once. Also writes the slug into the draft and what is published, and gives the new draft version. 409 means the name is taken.',
		draftVersion: 'optional',
		body: LinkShortInput,
	},
	{
		method: 'get',
		path: '/api/pages/{id}/versions',
		id: 'listPageVersions',
		tag: 'Pages',
		summary: 'The versions of a page published so far',
		description: 'The last 20, newest first: when, by whom (owner, or a token and its name) and which is live now. Restore one to undo a publish.',
	},
	{ method: 'get', path: '/api/pages/{id}/versions/{versionId}', id: 'getPageVersion', tag: 'Pages', summary: 'One published version, with its content' },
	{
		method: 'post',
		path: '/api/pages/{id}/versions/{versionId}/restore',
		id: 'restorePageVersion',
		tag: 'Pages',
		summary: 'Put a published version back in the draft',
		description: 'Replaces the draft, so unpublished changes in it are lost. Visitors see nothing until you publish it.',
		draftVersion: 'required',
	},
	{ method: 'get', path: '/api/pages/{id}/preview', id: 'previewPage', tag: 'Pages', summary: 'The draft rendered as HTML', query: [{ name: 'lang', description: "One of the languages turned on (default: as the request's Accept-Language says)" }], produces: 'html' },
	{
		method: 'post',
		path: '/api/pages/{id}/preview-link',
		id: 'createPreviewLink',
		tag: 'Pages',
		summary: 'A link the owner can open to see the live draft',
		description: 'Returns { url, expiresAt }. Lasts 10 minutes unless minutes says otherwise. The page opens without signing in and updates by itself when the draft changes. Anyone with the link can see the draft until it expires; changing the password ends every link. 409 while settings.bio is off.',
		body: PreviewLinkInput,
	},
	{
		method: 'put',
		path: '/api/settings',
		id: 'updateSettings',
		tag: 'Settings',
		summary: 'Change settings',
		description: 'Send only what changes: anything left out stays as it is. home is a page id or "". locale is the page language; languages adds more for browsers that prefer them, so translate pages too. A new domain must pass verification. bio: false takes public pages offline; warn the owner.',
		body: SettingsInput,
	},
	{ method: 'post', path: '/api/settings/verify-domain', id: 'verifyDomain', tag: 'Settings', summary: 'Check that a custom domain reaches this Worker', body: DomainInput },
	{
		method: 'post',
		path: '/api/media',
		id: 'uploadImage',
		tag: 'Media',
		summary: 'Upload an image',
		description: 'Raw bytes as the body with its content type: png, jpeg, webp, gif or avif, 2 MB at most. Returns { id } to use as profile.avatar, seo.image or a gallery or product image.',
		body: 'image',
	},
	{ method: 'put', path: '/api/media/{id}', id: 'putImage', tag: 'Media', summary: 'Upload an image under a given id (used by imports)', body: 'image' },
	{
		method: 'get',
		path: '/api/media/unused',
		id: 'listUnusedImages',
		tag: 'Media',
		summary: 'Uploaded images nothing uses any more',
		description: 'Ids no draft, published page, kept version, QR code, setting or saved theme refers to. Images uploaded in the last keptDays days are left out. They cost no daily quota, only storage; looking reads a few hundred D1 rows per page and kept version. more: others remain after these are deleted.',
	},
	{
		method: 'delete',
		path: '/api/media/unused',
		id: 'deleteUnusedImages',
		tag: 'Media',
		summary: 'Delete the images nothing uses any more',
		description: 'Permanent: an older backup that used one of them comes back without it. Tell the owner how many (listUnusedImages) and wait for a yes. more: call again.',
	},
	{
		method: 'get',
		path: '/api/links',
		id: 'listLinks',
		tag: 'Short links',
		summary: 'Short links with 7-day clicks, a page at a time',
		description: 'Live links first, then newest first. If nextCursor is not null, there are more: ask again with ?cursor=<nextCursor>.',
		query: [
			{ name: 'limit', description: 'How many, 1000 at most, which is also the default' },
			{ name: 'cursor', description: 'nextCursor from the page before' },
			{ name: 'kind', description: 'Only links on pages, or only standalone ones', enum: ['bio', 'solo'] },
			{ name: 'q', description: 'Part of the slug, the address or the title' },
		],
	},
	{ method: 'get', path: '/api/links/clicked', id: 'listClickedLinks', tag: 'Short links', summary: 'The most clicked short links of the last 7 days, 2000 at most' },
	{
		method: 'post',
		path: '/api/links',
		id: 'createLink',
		tag: 'Short links',
		summary: 'Create a standalone short link',
		description: 'Returns { link, short }. short is the URL to share.',
		body: NewLinkInput,
		linksToken: true,
	},
	{
		method: 'post',
		path: '/api/links/bulk',
		id: 'createLinks',
		tag: 'Short links',
		summary: 'Create up to 100 short links',
		description: 'Returns { created, errors: [{ index, message }] }. Each link is one KV write; the free plan allows 1,000 a day.',
		body: BulkLinksInput,
		linksToken: true,
	},
	{ method: 'get', path: '/api/links/{id}', id: 'getLink', tag: 'Short links', summary: 'One short link' },
	{
		method: 'get',
		path: '/api/links/{id}/qr',
		id: 'getLinkQr',
		tag: 'Short links',
		summary: 'The link as a QR code, as an SVG file',
		description: "In the link's saved style. Scans count under the source qr. 409 for an archived link.",
		query: [{ name: 'size', description: 'Print size, instead of the saved one: 2.5, 5 or 15 cm wide', enum: ['card', 'sticker', 'poster'] }],
		produces: 'svg',
	},
	{
		method: 'patch',
		path: '/api/links/{id}',
		id: 'updateLink',
		tag: 'Short links',
		summary: 'Change a short link',
		description: 'Password, UTM, smart routing and QR style for any link. url, slug, title, schedule and status only for standalone links; bio links change through the page draft. A new slug breaks the old short URL.',
		body: LinkPatchInput,
	},
	{ method: 'get', path: '/api/links/{id}/stats', id: 'getLinkStats', tag: 'Stats', summary: "One link's clicks per day and sources", query: [DAYS] },
	{
		method: 'get',
		path: '/api/stats',
		id: 'getStats',
		tag: 'Stats',
		summary: "A page's views, clicks and sources",
		description: 'Totals, per-day series, top links and blocks, sources and the period before. insights holds Analytics Engine details, or null when unavailable.',
		query: [{ name: 'page', description: 'Page id (default: the home page)' }, DAYS],
	},
	{
		method: 'get',
		path: '/api/stats/export',
		id: 'exportStats',
		tag: 'Stats',
		summary: 'Every view and click count, oldest first, 1000 at a time',
		description:
			'Rows of [day, kind, target, page, slug, title, source, count]. day is "YYYY-MM-DD", or "YYYY-MM" for a month kept as one number. If nextCursor is not null, ask again with ?cursor=<nextCursor>. Read-only.',
		query: [
			{ name: 'cursor', description: 'nextCursor from the page before' },
			{ name: 'before', description: 'Only numbers from before this month, "YYYY-MM"' },
		],
	},
	{
		method: 'post',
		path: '/api/stats/clear',
		id: 'clearStats',
		tag: 'Stats',
		summary: 'Delete the numbers from before a month',
		description: 'Owner only, and only months at least 6 months back. Deletion goes a slice at a time, on dashboard visits, within a daily budget.',
		body: StatsClearInput,
		owner: true,
	},
	{
		method: 'get',
		path: '/api/usage',
		id: 'getUsage',
		tag: 'Account',
		summary: "How close the site is to its plan's limits",
		description: "Database size, today's views and clicks with what they cost, and how old numbers are kept. Estimates: pictures, bots and other Workers on the account aren't counted.",
	},
	{ method: 'get', path: '/api/themes', id: 'listThemes', tag: 'Themes', summary: 'Saved looks' },
	{ method: 'post', path: '/api/themes', id: 'saveTheme', tag: 'Themes', summary: 'Save a look', body: ThemePresetSchema },
	{ method: 'delete', path: '/api/themes/{id}', id: 'deleteTheme', tag: 'Themes', summary: 'Delete a saved look' },
	{ method: 'get', path: '/api/themes/community', id: 'listCommunityThemes', tag: 'Themes', summary: 'The color sets each theme offers' },
	{ method: 'post', path: '/api/themes/fetch', id: 'fetchTheme', tag: 'Themes', summary: 'Read a theme file from a GitHub URL', body: ThemeFetchInput },
	{
		method: 'get',
		path: '/api/fonts',
		id: 'searchFonts',
		tag: 'Themes',
		summary: 'Search Google Fonts families',
		description:
			"Families for appearance.headFont and bodyFont. scripts lists the page languages' writing systems a family covers; other characters use the page font. Publishing copies the fonts to this site, so visitors never load them from Google.",
		query: [
			{ name: 'q', description: 'Part of the family name' },
			{ name: 'category', description: 'Kind of family', enum: FONT_CATEGORIES },
			{ name: 'script', description: 'Only families with these characters', enum: FONT_SCRIPTS },
			{ name: 'limit', description: 'At most this many (default 20, max 100)' },
		],
	},
	{
		method: 'get',
		path: '/api/export',
		id: 'exportData',
		tag: 'Backup',
		summary: 'Every page, short link and theme as one JSON file',
		description: "No stats or images. media lists the image ids the file uses: download each from /media/{id} to keep a complete backup. Do this before changing anything for the owner, and save it on their computer (see the guide at /llms.txt).",
	},
	{
		method: 'post',
		path: '/api/import',
		id: 'importData',
		tag: 'Backup',
		summary: 'Replace everything with an export',
		description: 'Replaces every page, short link and saved theme, and the home page, time zone and locale. Upload the images first (putImage). Export first and confirm with the owner.',
		body: BackupSchema,
	},
	{ method: 'delete', path: '/api/data', id: 'wipeData', tag: 'Backup', summary: 'Delete everything', body: WipeInput, owner: true },
	{ method: 'get', path: '/api/tokens', id: 'listTokens', tag: 'Account', summary: 'API tokens', owner: true },
	{ method: 'post', path: '/api/tokens', id: 'createToken', tag: 'Account', summary: 'Create an API token', body: NewTokenInput, owner: true },
	{ method: 'delete', path: '/api/tokens/{id}', id: 'revokeToken', tag: 'Account', summary: 'Revoke an API token', owner: true },
]

/** Routes the dashboard uses that agents never need. */
export const UNDOCUMENTED_ROUTES = ['POST /api/auth/login', 'POST /api/auth/logout', 'GET /api/auth/info', 'GET /api/openapi.json']

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
	const { $schema: _, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
	return rest
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']

function operationObject(op: Operation): Record<string, unknown> {
	const parameters = [
		...[...op.path.matchAll(/\{(\w+)\}/g)].map((match) => ({ name: match[1], in: 'path', required: true, schema: { type: 'string' } })),
		...(op.query ?? []).map((q) => ({ name: q.name, in: 'query', required: false, description: q.description, schema: q.enum ? { enum: q.enum } : { type: 'string' } })),
		...(op.draftVersion
			? [{ name: 'If-Match', in: 'header', required: op.draftVersion === 'required', description: "The page's draftUpdatedAt from when you read it", schema: { type: 'string' } }]
			: []),
	]
	const body =
		op.body === 'image'
			? { required: true, content: Object.fromEntries(IMAGE_TYPES.map((type) => [type, { schema: { type: 'string', format: 'binary' } }])) }
			: op.body === 'page-content'
				? { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PageContent' } } } }
				: op.body
					? { required: true, content: { 'application/json': { schema: jsonSchema(op.body) } } }
					: undefined
	const ok =
		op.produces === 'html'
			? { 'text/html': { schema: { type: 'string' } } }
			: op.produces === 'text'
				? { 'text/plain': { schema: { type: 'string' } } }
				: op.produces === 'svg'
					? { 'image/svg+xml': { schema: { type: 'string' } } }
				: { 'application/json': { schema: { type: 'object' } }, ...(op.produces === 'csv' ? { 'text/csv': { schema: { type: 'string' } } } : {}) }
	return {
		operationId: op.id,
		tags: [op.tag],
		summary: op.summary,
		...(op.description ? { description: op.description } : {}),
		...(op.open ? { security: [] } : {}),
		...(parameters.length ? { parameters } : {}),
		...(body ? { requestBody: body } : {}),
		responses: {
			'200': { description: 'OK', content: ok },
			default: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
		},
	}
}

/** The parts of the OpenAPI document that don't depend on the deployment. */
export function openApiDocument(): OpenApiParts {
	const paths: Record<string, Record<string, unknown>> = {}
	// Tokens get 403 on owner-only operations, so tools that call the API never see them; the guide still lists them.
	for (const op of OPERATIONS) if (!op.owner) (paths[op.path] ??= {})[op.method] = operationObject(op)
	return {
		paths,
		components: {
			securitySchemes: { token: { type: 'http', scheme: 'bearer', description: 'An API token (fbk_…) made in the dashboard: Settings → API token' } },
			schemas: {
				PageContent: jsonSchema(PageContentSchema),
				Error: {
					type: 'object',
					properties: {
						error: { type: 'string' },
						message: { type: 'string', description: 'In English: put it in the owner\'s language before showing it' },
						key: { type: 'string', description: "The message's translation key, for the dashboard; can be ignored" },
						params: { type: 'object', description: 'Values for the {placeholders} in key' },
						problems: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } },
					},
				},
			},
		},
	}
}

export interface OpenApiParts {
	paths: Record<string, Record<string, unknown>>
	components: Record<string, unknown>
}
