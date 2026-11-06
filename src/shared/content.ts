import { z } from './zod'
import { msg } from '../templates/msg'
import { CSS_LIMIT, cssProblem } from './css'
import { EMBED_ACTIONS, EMBED_PROVIDERS, EMBEDS, type EmbedProvider } from './embeds'
import { findFont } from './fonts'

export const THEME_IDS = ['liquid', 'editorial', 'brutal', 'jelly', 'minimal', 'aurora', 'notebook', 'boutique', 'sunset', 'sky', 'pop', 'portrait', 'sheet', 'rail', 'duo', 'relief', 'bento', 'dots', 'pastel', 'letter', 'obsidian', 'moon', 'chips', 'tracks'] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const FONT_IDS = ['auto', 'sans', 'serif', 'kai', 'mono'] as const
export type FontId = (typeof FONT_IDS)[number]

export const BUTTON_IDS = ['auto', 'pill', 'rounded', 'square', 'shadow'] as const
export type ButtonId = (typeof BUTTON_IDS)[number]

export const SOCIAL_PLATFORMS = [
	'youtube',
	'instagram',
	'threads',
	'line',
	'facebook',
	'x',
	'tiktok',
	'github',
	'email',
	'website',
] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const LINK_ICONS = [
	'auto',
	'none',
	'link',
	'video',
	'play',
	'doc',
	'briefcase',
	'chat',
	'camera',
	'mail',
	'shop',
	'music',
	'calendar',
	'gift',
	'heart',
	'star',
	'globe',
	'book',
	'mic',
] as const
export type LinkIcon = (typeof LINK_ICONS)[number]

/** Languages of the built-in text on public pages. Traditional Chinese is the source. */
export const LOCALES = ['zh-TW', 'en', 'zh-CN', 'ja', 'ko', 'es', 'pt-BR', 'fr', 'de', 'id', 'th', 'vi', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

export const ITEM_KINDS = ['link', 'heading', 'video', 'gallery', 'product', 'hours', 'embed'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export const ITEM_LIMIT = 100
export const GALLERY_LIMIT = 10
export const PRODUCT_LIMIT = 8

const itemId = z.string().regex(/^[\w-]{4,32}$/)
// Uploaded media is referenced by its id, e.g. "a1b2c3d4e5f6.webp".
export const MEDIA_ID = /^[\w.-]{1,80}$/
const mediaId = z.string().regex(MEDIA_ID)
const mediaRef = mediaId.nullable()
const time = z.number().int().nonnegative().nullable()
const url = z.string().max(2048)
// "09:00"; "24:00" means midnight at the end of the day.
const clock = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/)

export const LinkItemSchema = z.object({
	id: itemId,
	kind: z.literal('link'),
	title: z.string().max(80),
	subtitle: z.string().max(120),
	url,
	slug: z.string().max(64),
	icon: z.enum(LINK_ICONS),
	featured: z.boolean(),
	hidden: z.boolean(),
	/** Left out or false: the button on the page shows the real address, and the browser reports the click. */
	hideUrl: z.boolean().optional().describe("Send this link's button through its short link, so the address isn't on the page, e.g. an affiliate link. Every click then counts, in every browser"),
	/** The link shows on the page, and its short link works, from `startsAt` until `endsAt`. */
	startsAt: time,
	endsAt: time,
})
export type LinkItem = z.infer<typeof LinkItemSchema>

/** A label that groups the items below it, e.g. "合作" or "免費資源". */
export const HeadingItemSchema = z.object({
	id: itemId,
	kind: z.literal('heading'),
	title: z.string().max(80),
	hidden: z.boolean(),
})
export type HeadingItem = z.infer<typeof HeadingItemSchema>

/** A YouTube or Vimeo video, played on the page. */
export const VideoItemSchema = z.object({
	id: itemId,
	kind: z.literal('video'),
	title: z.string().max(80),
	url,
	hidden: z.boolean(),
})
export type VideoItem = z.infer<typeof VideoItemSchema>

export const GalleryImageSchema = z.object({
	id: itemId,
	image: mediaId,
	alt: z.string().max(120),
	/** Optional link opened when the image is tapped. */
	url,
})
export type GalleryImage = z.infer<typeof GalleryImageSchema>

export const GalleryItemSchema = z.object({
	id: itemId,
	kind: z.literal('gallery'),
	title: z.string().max(80),
	images: z.array(GalleryImageSchema).max(GALLERY_LIMIT),
	hidden: z.boolean(),
})
export type GalleryItem = z.infer<typeof GalleryItemSchema>

export const ProductSchema = z.object({
	id: itemId,
	name: z.string().max(60),
	/** Free text, e.g. "NT$ 160". */
	price: z.string().max(30),
	image: mediaRef,
	url,
})
export type Product = z.infer<typeof ProductSchema>

export const ProductItemSchema = z.object({
	id: itemId,
	kind: z.literal('product'),
	title: z.string().max(80),
	products: z.array(ProductSchema).max(PRODUCT_LIMIT),
	/** "看全部商品" link under the cards; empty hides it. */
	moreUrl: url,
	hidden: z.boolean(),
})
export type ProductItem = z.infer<typeof ProductItemSchema>

export const OpeningSchema = z.object({ open: clock, close: clock })
export type Opening = z.infer<typeof OpeningSchema>

export const HoursItemSchema = z.object({
	id: itemId,
	kind: z.literal('hours'),
	title: z.string().max(60),
	/** Monday first. Up to two openings a day; none means closed. Times are in the site's time zone. */
	week: z.array(z.array(OpeningSchema).max(2)).length(7),
	note: z.string().max(120),
	address: z.string().max(200),
	phone: z.string().max(40),
	/** Show a map; it loads from Google Maps only after the visitor taps it. */
	showMap: z.boolean(),
	hidden: z.boolean(),
})
export type HoursItem = z.infer<typeof HoursItemSchema>

/**
 * A card for the owner's account on another service (EMBEDS in src/shared/embeds.ts): a link to it that, on a live page,
 * opens the service's own panel over the page. Nothing loads from the service until a visitor taps.
 */
export const EmbedItemSchema = z.object({
	id: itemId,
	kind: z.literal('embed'),
	provider: z.enum(EMBED_PROVIDERS).describe(`The service, whose panel opens over the page on a tap: ${EMBED_PROVIDERS.map((id) => `${id} (${EMBEDS[id].about})`).join(', ')}`),
	account: z.string().max(2048).describe("The owner's account on that service. Its address, or the service's own embed code, works too"),
	title: z.string().max(80),
	note: z.string().max(120).describe('One line under the title, e.g. what tips pay for; "" for none'),
	hidden: z.boolean(),
})
export type EmbedItem = z.infer<typeof EmbedItemSchema>

export const ItemSchema = z.discriminatedUnion('kind', [
	LinkItemSchema,
	HeadingItemSchema,
	VideoItemSchema,
	GalleryItemSchema,
	ProductItemSchema,
	HoursItemSchema,
	EmbedItemSchema,
])
export type Item = z.infer<typeof ItemSchema>
export type BlockItem = Exclude<Item, LinkItem | HeadingItem>

export const SocialSchema = z.object({
	id: itemId,
	platform: z.enum(SOCIAL_PLATFORMS),
	url,
})
export type Social = z.infer<typeof SocialSchema>

/** A #rrggbb color, or "" for the theme's own. */
const color = z.string().regex(/^(#[0-9a-fA-F]{6})?$/)

/** A family from Google Fonts (src/shared/fonts.ts), or "" for the font chosen in `font`. */
export const FontFamilySchema = z
	.string()
	.max(60)
	.refine((name) => name === '' || findFont(name) !== null, { message: msg('Google Fonts 沒有這個字型') })

/**
 * Refuses CSS that cssProblem() (src/shared/css.ts) refuses, where it comes in: a draft saved, a backup imported, a
 * look saved, and again when a page is published (publishProblems). Not where it is read back from D1, which happens
 * for many pages and looks at once and must stay cheap: what is stored has been through this.
 */
export function refuseBadCss<T>(cssOf: (value: T) => string | undefined, path: PropertyKey[]) {
	return (value: T, ctx: z.RefinementCtx): void => {
		const css = cssOf(value)
		const problem = css && cssProblem(css)
		if (problem) ctx.addIssue({ code: 'custom', path, message: problem.key, params: problem.params })
	}
}

/**
 * A page's look. The fields with a default may be left out, and get the theme's own: an AI building a look through
 * the API can send the theme and only the colors, fonts or pictures it means to set.
 */
export const AppearanceSchema = z.object({
	theme: z.enum(THEME_IDS),
	/** Empty string means "use the theme's own accent". */
	accent: color,
	/** The theme's second color (bands, panels, rules), "" for the theme's own. */
	accent2: color.default(''),
	/**
	 * The page background, "" for the theme's own. Dark themes keep a dark
	 * background and light themes a light one: other colors are darkened or
	 * lightened to fit (fitBackground in src/templates/themes.ts).
	 */
	bg: color.default(''),
	/** The text color, "" for the theme's own. Ignored when it reads below 4.5:1 on the background. */
	fg: color.default(''),
	font: z.enum(FONT_IDS),
	/** Headings and the name; "" follows `bodyFont`, or the theme's heading font when that is "" too. */
	headFont: FontFamilySchema.default(''),
	/** Everything else. Characters the family lacks (say, Chinese in a Latin font) use `font`. */
	bodyFont: FontFamilySchema.default(''),
	button: z.enum(BUTTON_IDS),
	showSocial: z.boolean(),
	/** A large picture at the top of the page. Each theme places it its own way. */
	coverImage: mediaRef.default(null),
	/** A picture behind the whole page, under a layer of the background color. */
	bgImage: mediaRef.default(null),
	/** How much of that layer covers the picture: enough for the page's text to stay readable on it. */
	bgDim: z.number().min(0.4).max(0.95).default(0.75),
	/**
	 * 0: the picture covers the screen, one copy cropped to fit. Otherwise it repeats, each copy this many CSS pixels wide
	 * (its height follows), so a pattern looks the same on a phone and a wide screen.
	 */
	bgTile: z.number().int().min(0).max(2000).default(0),
	/**
	 * The page's own CSS, after the theme's, so it can change anything the theme draws. It is written against the
	 * page's markup (the guide topic "customize"), and may load nothing but this site's pictures: url(/media/<id>).
	 */
	css: z.string().max(CSS_LIMIT).default('').describe("The page's own CSS, applied after its theme's: written against the markup in /api/guide/customize. No \"<\", no @import or @font-face, and url() only for this site's pictures, as url(/media/<id>)"),
})
export type Appearance = z.infer<typeof AppearanceSchema>

export const SeoSchema = z.object({
	title: z.string().max(80),
	description: z.string().max(200),
	/** "auto" uses a card drawn from the theme; "upload" uses `image`. */
	imageMode: z.enum(['auto', 'upload']),
	image: mediaRef,
	/** The line under the name on the auto card. */
	tagline: z.string().max(80),
	/** The auto card, drawn by the dashboard when publishing. */
	autoImage: mediaRef,
	/** What `autoImage` was drawn from, so it is redrawn only when that changes. */
	autoImageKey: z.string().max(64),
})
export type Seo = z.infer<typeof SeoSchema>

/**
 * The owner's text in other languages: per language, each text exactly as it is
 * written on the page → its translation (see shared/translations.ts). A
 * translation may be far longer than its source, as German is next to Chinese.
 */
export const TranslationsSchema = z.partialRecord(
	z.enum(LOCALES),
	z.record(z.string().max(280), z.string().max(1000)).refine((words) => Object.keys(words).length <= 2000),
)
export type Translations = z.infer<typeof TranslationsSchema>

/**
 * Everything shown on a bio page. Drafts are saved in this shape while
 * editing, so fields may be incomplete; see `publishProblems` for the
 * stricter checks that run before publishing.
 */
/**
 * The most HTML a page can hold. A character can take 3 bytes, and the draft and the published copy share a D1 row
 * of at most 2 MB, with the rest of the page.
 */
export const CUSTOM_HTML_LIMIT = 250_000

/** What a page is when it isn't a page of links. */
export const CustomPageSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('html'), html: z.string().max(CUSTOM_HTML_LIMIT).describe('A complete HTML document, served as it is in a sandbox: scripts run, without cookies, storage or this site\'s API') }),
	z.object({ kind: z.literal('redirect'), url: z.string().max(2048).describe('Where this page\'s address sends visitors: an http or https URL') }),
])
export type CustomPage = z.infer<typeof CustomPageSchema>

export const PageContentSchema = z.object({
	profile: z.object({
		name: z.string().max(60),
		bio: z.string().max(280),
		avatar: mediaRef,
	}),
	appearance: AppearanceSchema,
	socials: z.array(SocialSchema).max(12),
	items: z.array(ItemSchema).max(ITEM_LIMIT),
	seo: SeoSchema,
	showBadge: z.boolean(),
	/** Left out until something is translated. */
	translations: TranslationsSchema.optional(),
	/** Left out for a page of links. The rest of the content stays, so taking this away brings that page back. */
	custom: CustomPageSchema.optional(),
	/** Left out or false: nobody hears about a tap on a social icon. */
	/** Left out, there is no LINE button floating at the bottom right. */
	lineButton: z.string().max(2048).optional().describe("Where the LINE button floating at the bottom right of the page goes: an address like https://lin.ee/… or an official account's @id. Left out or empty, there is no button"),
	/** Left out, there is no button floating at the bottom right for another service. */
	embedButton: z
		.object({ provider: z.enum(EMBED_PROVIDERS), account: z.string().max(2048) })
		.optional()
		.describe("A button floating at the bottom right, above the LINE button when there is one, that opens a service's panel over the page as an `embed` card's button does: `provider` and `account` as there. Left out, or with no account, there is none"),
	countSocials: z.boolean().optional().describe("Count clicks on this page's social icons, at one Worker request and one KV read per click. Email icons are never counted"),
})
export type PageContent = z.infer<typeof PageContentSchema>

/** PageContentSchema for content coming in, a draft or a backup: its CSS is checked too. */
export const PageContentInputSchema = PageContentSchema.superRefine(refuseBadCss((content) => content.appearance.css, ['appearance', 'css']))

/**
 * Stored content with fonts no longer on the list dropped: a page saved with a
 * family that a newer list leaves out still opens, in its theme's font,
 * instead of failing to parse.
 */
export function storedContent(value: unknown): unknown {
	if (!value || typeof value !== 'object' || !('appearance' in value)) return value
	const appearance = value.appearance as Record<string, unknown> | null
	if (!appearance || typeof appearance !== 'object') return value
	const known = (name: unknown) => (typeof name === 'string' && findFont(name) ? name : '')
	return { ...value, appearance: { ...appearance, headFont: known(appearance.headFont), bodyFont: known(appearance.bodyFont) } }
}

export const SettingsSchema = z.object({
	/** Id of the page shown at "/", or "" to show nothing there. */
	home: z.string().max(32),
	/** IANA time zone for stats days and opening hours. */
	timezone: z.string().min(1).max(64),
	/** Language of the built-in text on public pages (buttons, notices, opening hours, the 404 page). */
	locale: z.enum(LOCALES),
	/**
	 * More languages visitors may get instead, by their browser's preference.
	 * [] (the default) shows everyone `locale`.
	 */
	languages: z.array(z.enum(LOCALES)).max(LOCALES.length),
	/** Host used for links and QR codes, e.g. "links.example.com"; "" uses the address the dashboard is opened at. */
	domain: z.string().max(253),
	/**
	 * Copy the fonts public pages use to this Worker when publishing, so visitors never connect
	 * to Google (src/worker/lib/fonts.ts). Off, the default, loads them from Google Fonts, which
	 * costs no quota.
	 */
	hostFonts: z.boolean(),
	/**
	 * Bio pages are public. Off, the deployment is only a link shortener: pages, drafts and stats
	 * stay in D1, but nothing shows them to visitors until it is on again. Short links keep working.
	 */
	bio: z.boolean(),
	/** Where "/" redirects while `bio` is off, an http(s) URL; "" shows a small system page instead. */
	homeUrl: z.string().max(2048),
	/** Media id of the picture in QR codes that follow the default and whose page has none of its own; "" for none. */
	qrLogo: z.string().regex(/^[\w.-]{0,80}$/),
	/**
	 * The owner's Cloudflare plan, which the Worker can't see for itself: "free" (Workers Free) or "paid" (Workers Paid).
	 * It sets the database size reminders are measured against, and whether daily quotas are worth a reminder at all.
	 */
	plan: z.enum(['free', 'paid']),
})
export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = { home: '', timezone: 'UTC', locale: 'en', languages: [], domain: '', hostFonts: false, bio: true, homeUrl: '', qrLogo: '', plan: 'free' }

/** A saved look: a base theme plus the colors, font and button chosen on top. */
export const ThemePresetSchema = z.object({
	name: z.string().trim().min(1).max(40),
	base: z.enum(THEME_IDS),
	accent: color,
	/** The second color; left out (or "") keeps the base theme's. */
	accent2: color.optional(),
	/** Background and text colors; left out (or "") keeps the base theme's. */
	bg: color.optional(),
	fg: color.optional(),
	font: z.enum(FONT_IDS),
	/** Google Fonts families; left out keeps the font above. A family this version doesn't know is dropped. */
	headFont: FontFamilySchema.optional().catch(undefined),
	bodyFont: FontFamilySchema.optional().catch(undefined),
	button: z.enum(BUTTON_IDS),
	author: z.string().max(40).optional(),
	/** Pictures uploaded to this deployment; left out, the look has none. */
	coverImage: mediaId.optional(),
	bgImage: mediaId.optional(),
	bgDim: z.number().min(0.4).max(0.95).optional(),
	bgTile: z.number().int().min(0).max(2000).optional(),
	/** The look's own CSS (appearance.css); left out, it has none. */
	css: z.string().max(CSS_LIMIT).optional(),
})
export type ThemePreset = z.infer<typeof ThemePresetSchema>
/** A look coming in, from the API or a theme file: its CSS is checked. */
export const ThemePresetInputSchema = ThemePresetSchema.superRefine(refuseBadCss((preset) => preset.css, ['css']))

export const SavedThemeSchema = ThemePresetSchema.extend({ id: itemId, createdAt: z.number().int() })
export type SavedTheme = z.infer<typeof SavedThemeSchema>
export const SavedThemeInputSchema = SavedThemeSchema.superRefine(refuseBadCss((theme) => theme.css, ['css']))

export function presetFromAppearance(name: string, appearance: Appearance): ThemePreset {
	return {
		name,
		base: appearance.theme,
		accent: appearance.accent,
		...(appearance.accent2 && { accent2: appearance.accent2 }),
		...(appearance.bg && { bg: appearance.bg }),
		...(appearance.fg && { fg: appearance.fg }),
		font: appearance.font,
		...(appearance.headFont && { headFont: appearance.headFont }),
		...(appearance.bodyFont && { bodyFont: appearance.bodyFont }),
		button: appearance.button,
		...(appearance.coverImage && { coverImage: appearance.coverImage }),
		...(appearance.bgImage && { bgImage: appearance.bgImage, bgDim: appearance.bgDim, ...(appearance.bgTile && { bgTile: appearance.bgTile }) }),
		...(appearance.css && { css: appearance.css }),
	}
}

export function appearanceFromPreset(preset: ThemePreset, current: Appearance): Appearance {
	return {
		...current,
		theme: preset.base,
		accent: preset.accent,
		accent2: preset.accent2 ?? '',
		bg: preset.bg ?? '',
		fg: preset.fg ?? '',
		font: preset.font,
		headFont: preset.headFont ?? '',
		bodyFont: preset.bodyFont ?? '',
		button: preset.button,
		// The cover is the page's own picture: a look without one leaves it alone.
		coverImage: preset.coverImage ?? current.coverImage ?? null,
		bgImage: preset.bgImage ?? null,
		bgDim: preset.bgDim ?? 0.75,
		bgTile: preset.bgTile ?? 0,
		css: preset.css ?? '',
	}
}

const sameColor = (a: string | undefined, b: string | undefined) => (a ?? '').toUpperCase() === (b ?? '').toUpperCase()

export function samePreset(
	a: Pick<ThemePreset, 'base' | 'accent' | 'accent2' | 'bg' | 'fg' | 'font' | 'headFont' | 'bodyFont' | 'button' | 'coverImage' | 'bgImage' | 'bgTile' | 'css'>,
	appearance: Appearance,
): boolean {
	return (
		a.base === appearance.theme &&
		sameColor(a.accent, appearance.accent) &&
		sameColor(a.accent2, appearance.accent2) &&
		sameColor(a.bg, appearance.bg) &&
		sameColor(a.fg, appearance.fg) &&
		(a.headFont ?? '') === appearance.headFont &&
		(a.bodyFont ?? '') === appearance.bodyFont &&
		a.font === appearance.font &&
		a.button === appearance.button &&
		(!a.coverImage || a.coverImage === appearance.coverImage) &&
		(a.bgImage ?? null) === appearance.bgImage &&
		// How a background repeats only matters when there is one.
		(!a.bgImage || (a.bgTile ?? 0) === appearance.bgTile) &&
		(a.css ?? '') === appearance.css
	)
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function randomString(length: number, alphabet = ID_ALPHABET): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length))
	let out = ''
	for (const byte of bytes) out += alphabet[byte % alphabet.length]
	return out
}

export const newId = (): string => randomString(10)

export function defaultAppearance(): Appearance {
	return { theme: 'liquid', accent: '', accent2: '', bg: '', fg: '', font: 'auto', headFont: '', bodyFont: '', button: 'auto', showSocial: true, coverImage: null, bgImage: null, bgDim: 0.75, bgTile: 0, css: '' }
}

export function emptyLink(): LinkItem {
	return {
		id: newId(),
		kind: 'link',
		title: '',
		subtitle: '',
		url: '',
		slug: '',
		icon: 'auto',
		featured: false,
		hidden: false,
		startsAt: null,
		endsAt: null,
	}
}

/** Tuesday to Sunday 10:00–18:00, closed on Monday. */
export function defaultWeek(): Opening[][] {
	return [[], ...Array.from({ length: 6 }, () => [{ open: '10:00', close: '18:00' }])]
}

export function newProduct(): Product {
	return { id: newId(), name: '', price: '', image: null, url: '' }
}

/** A fresh item with zh-TW default text; the dashboard translates `title` when it adds one. */
export function newItem<K extends ItemKind>(kind: K): Extract<Item, { kind: K }> {
	return makeItem(kind) as Extract<Item, { kind: K }>
}

function makeItem(kind: ItemKind): Item {
	const id = newId()
	switch (kind) {
		case 'link':
			return { ...emptyLink(), id }
		case 'heading':
			return { id, kind, title: msg('分類標題'), hidden: false }
		case 'video':
			return { id, kind, title: '', url: '', hidden: false }
		case 'gallery':
			return { id, kind, title: '', images: [], hidden: false }
		case 'product':
			return { id, kind, title: '', products: [newProduct()], moreUrl: '', hidden: false }
		case 'hours':
			return { id, kind, title: msg('營業時間'), week: defaultWeek(), note: '', address: '', phone: '', showMap: true, hidden: false }
		case 'embed':
			return newEmbed('kofi', id)
	}
}

/** A fresh card for a service, titled for what its button does (in zh-TW, like newItem). */
export function newEmbed(provider: EmbedProvider, id = newId()): EmbedItem {
	return { id, kind: 'embed', provider, account: '', title: EMBED_ACTIONS[EMBEDS[provider].action].title, note: '', hidden: false }
}

export function defaultSeo(): Seo {
	return { title: '', description: '', imageMode: 'auto', image: null, tagline: '', autoImage: null, autoImageKey: '' }
}

export function emptyContent(name = ''): PageContent {
	return {
		profile: { name, bio: '', avatar: null },
		appearance: defaultAppearance(),
		socials: [],
		items: [],
		seo: defaultSeo(),
		showBadge: true,
	}
}

export function defaultContent(): PageContent {
	return {
		...emptyContent(),
		profile: { name: '我的名字', bio: '一句話介紹你自己', avatar: null },
		items: [
			{
				...emptyLink(),
				title: 'FluxBio',
				subtitle: '這一頁是用 FluxBio 做的',
				url: 'https://github.com/0t2/flux-bio',
				featured: true,
			},
		],
	}
}

export const linkItems = (content: Pick<PageContent, 'items'>): LinkItem[] =>
	content.items.filter((item): item is LinkItem => item.kind === 'link')

/** True while `at` falls inside the item's schedule. */
export function isScheduledNow(item: Pick<LinkItem, 'startsAt' | 'endsAt'>, at = Date.now()): boolean {
	return (!item.startsAt || at >= item.startsAt) && (!item.endsAt || at < item.endsAt)
}

/** How a page's address is shown, e.g. "links.example.com" for the home page or "links.example.com/mei". */
export function pageDisplayUrl(host: string, page: { handle: string; home: boolean }): string {
	return page.home ? host : `${host}/${page.handle}`
}

export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

/** What a tap on a counted social icon is filed under: "<social id>.social", next to a block's "<item id>.<part>". */
export const SOCIAL_PART = 'social'
/** The part of a link item in /_c: a tap on its button, filed under the link's own id, like a click on its short link. */
export const LINK_PART = 'link'
/** The page's floating LINE button in /_c, filed under "<page id>.line". */
export const LINE_PART = 'line'
// An embed's button is filed under "<item id>.<provider>", the floating one under "<page id>.<provider>" (EMBED_PROVIDERS).

/** Turns what someone typed for a social icon into a usable href, or null. */
export function socialHref(platform: SocialPlatform, value: string): string | null {
	const input = value.trim()
	if (!input) return null
	if (platform === 'email') {
		const address = input.replace(/^mailto:/i, '')
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? `mailto:${address}` : null
	}
	if (isHttpUrl(input)) return input
	// An official account's id is what people have to hand.
	if (platform === 'line' && /^@[\w.-]+$/.test(input)) return `https://line.me/R/ti/p/${input}`
	// Accept "instagram.com/me" without the scheme.
	if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(input)) return `https://${input}`
	return null
}

export interface VideoEmbed {
	provider: 'youtube' | 'vimeo'
	id: string
	/** Player URL that starts playing when loaded. */
	embed: string
	thumbnail: string | null
}

/** The YouTube or Vimeo player for a video URL, or null when it isn't one. */
export function videoEmbed(value: string): VideoEmbed | null {
	let url: URL
	try {
		url = new URL(value.trim())
	} catch {
		return null
	}
	const host = url.hostname.replace(/^(www|m|music)\./, '')
	let id: string | null = null
	if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
	else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
		id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/)?.[1] ?? null
	}
	if (id && /^[\w-]{6,20}$/.test(id)) {
		return {
			provider: 'youtube',
			id,
			embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
			thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
		}
	}
	if (host === 'vimeo.com' || host === 'player.vimeo.com') {
		const vimeo = url.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/)?.[1]
		if (vimeo) return { provider: 'vimeo', id: vimeo, embed: `https://player.vimeo.com/video/${vimeo}?autoplay=1&dnt=1`, thumbnail: null }
	}
	return null
}

/** Google Maps search for an address. */
export function mapsUrl(address: string): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
}

/** Google Maps embed for an address; works without an API key. */
export function mapsEmbedUrl(address: string): string {
	return `https://maps.google.com/maps?q=${encodeURIComponent(address.trim())}&output=embed`
}

/** "02-1234 5678" → "tel:0212345678"; null when it doesn't look like a phone number. */
export function telHref(phone: string): string | null {
	const digits = phone.replace(/[\s().-]/g, '')
	return /^\+?\d{5,20}$/.test(digits) ? `tel:${digits}` : null
}
