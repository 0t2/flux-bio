import type { IconName } from '../templates/icons'
import { msg } from '../templates/msg'
import type { Locale } from './content'

/**
 * Other services whose own panel opens over a page when a visitor taps an `embed` card or the floating `embedButton`:
 * Ko-fi's tip panel, Calendly's booking calendar. Until the tap nothing on the page comes from the service. The card and
 * the button are links to the account's own page, which is where a tap goes without JavaScript, in a new tab or from a
 * preview, and SHEET_SCRIPT (src/templates/render.ts) gives the panel's frame its address only on the tap.
 *
 * A service is one entry in EMBEDS, and a test (AGENTS.md, "Add a block"). It belongs here only if:
 * - its panel works in the sheet's sandbox (SHEET_SANDBOX: scripts, its own origin, forms and popups, never this page)
 *   at phone width: it sends no X-Frame-Options or frame-ancestors that refuse other sites, and needs no script on our page;
 * - its own page is the same thing without a frame, so the link works when the sheet doesn't;
 * - an account can be read with a strict pattern out of what owners paste, so the frame only ever gets an address on
 *   `origins`, which the page's CSP frame-src lists for the services on that page and no others.
 *
 * An id is also the part a tap is filed under: "<item id>.<provider>" for a card's button and "<page id>.<provider>" for
 * the floating one, as LINE's is "<page id>.line", so a count keeps its service's name when a card changes service. No id
 * may be the name of another part (tests/embeds.test.ts).
 */
export const EMBED_PROVIDERS = ['kofi', 'calendly'] as const
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number]

/** What a service's buttons ask a visitor to do. Each has its words in every language in EMBED_ACTIONS. */
export type EmbedAction = 'tip' | 'book'

export interface EmbedService {
	/** The service's name, the same in every language. */
	name: string
	/** Our own drawing in ICONS (src/templates/icons.ts), never the service's mark. */
	icon: IconName
	action: EmbedAction
	/** What its panel is for and where the account is in its addresses, in English for the API and the guide. */
	about: string
	/** The service's address, for the dashboard's "<site>/yourname". */
	site: string
	/** The account in what the owner typed or pasted: the account, its address, or the service's embed code. Null when there is none. */
	account: (input: string) => string | null
	/** The account's own page. */
	page: (account: string) => string
	/** The panel made for a frame. The frame gets it only when a visitor taps. */
	panel: (account: string) => string
	/** Where the panel loads from, for frame-src. */
	origins: readonly string[]
	/** What the frame may use (its `allow` attribute): a card form needs `payment`. */
	allow: string
	/** The panel's own background, which the sheet around it takes. */
	paper: string
}

/**
 * What follows "<host>/" in the first address on that host in the text, with or without https:// and www., up to a
 * query or anything that can't be in a path. Another host that ends in it, such as storage.ko-fi.com, doesn't count.
 */
function pathOn(host: string, text: string): string | null {
	const found = new RegExp(String.raw`(?:^|[^\w.-])(?:https?://)?(?:www\.)?${host.replaceAll('.', String.raw`\.`)}/([\w/-]*)`, 'i').exec(text)
	return found ? found[1]!.replace(/\/+$/, '') : null
}

/** Ko-fi's own addresses, which are nobody's page: ko-fi.com/s/… is a shop item, ko-fi.com/post/… a post. */
const KOFI_PATHS = new Set(['s', 'i', 'c', 'e', 'post', 'album', 'home', 'manage', 'explore', 'account', 'settings', 'login', 'signup', 'gold', 'search', 'feed', 'summary', 'cdn'])

/** Calendly's own addresses. calendly.com/d/<code>/<event> is a one-off link and is fine. */
const CALENDLY_PATHS = new Set(['app', 'login', 'signup', 'pages', 'blog', 'resources', 'integrations', 'pricing', 'about', 'careers', 'help', 'legal', 'privacy', 'terms', 'features', 'enterprise', 'solutions', 'api', 'assets', 'cancellations', 'reschedulings', 'invitees', 'event_types'])

export const EMBEDS: Record<EmbedProvider, EmbedService> = {
	kofi: {
		name: 'Ko-fi',
		icon: 'cup',
		action: 'tip',
		about: 'tips: ko-fi.com/<account>',
		site: 'ko-fi.com',
		account(input) {
			const text = input.trim()
			// Ko-fi's floating widget code names the page in its draw() call.
			const name = pathOn('ko-fi.com', text)?.split('/')[0] ?? /kofiWidgetOverlay\.draw\(\s*['"]([\w-]+)['"]/.exec(text)?.[1] ?? text.replace(/^@/, '')
			return /^[\w-]{1,60}$/.test(name) && !KOFI_PATHS.has(name.toLowerCase()) ? name : null
		},
		page: (account) => `https://ko-fi.com/${account}`,
		// What the embed code on Ko-fi's Widgets page loads.
		panel: (account) => `https://ko-fi.com/${account}/?hidefeed=true&widget=true&embed=true&preview=true`,
		origins: ['https://ko-fi.com'],
		allow: 'payment',
		paper: '#f9f9f9',
	},
	calendly: {
		name: 'Calendly',
		icon: 'calendar',
		action: 'book',
		about: 'bookings: calendly.com/<account>, a name or <name>/<event>',
		site: 'calendly.com',
		account(input) {
			const text = input.trim()
			// The inline widget's code names the page in data-url, the popup's in its url.
			const path = pathOn('calendly.com', text) ?? text.replace(/^@/, '').replace(/\/+$/, '')
			const [first = '', ...rest] = path.split('/')
			const fits = /^[\w-]{1,80}(?:\/[\w-]{1,120}){0,2}$/.test(path) && !CALENDLY_PATHS.has(first.toLowerCase()) && (first !== 'd' || rest.length === 2)
			return fits ? path : null
		},
		page: (account) => `https://calendly.com/${account}`,
		// What Calendly's inline widget loads. Its cookie notice stays: hiding it (hide_gdpr_banner) would leave asking for
		// consent to the owner, and a page here has no way to.
		panel: (account) => `https://calendly.com/${account}?embed_domain=1&embed_type=Inline`,
		origins: ['https://calendly.com'],
		allow: 'payment',
		paper: '#ffffff',
	},
}

export const isEmbedProvider = (value: string): value is EmbedProvider => Object.hasOwn(EMBEDS, value)

/** The account an embed card or button names, or null: everything that shows or follows one goes by this. */
export const embedAccount = (embed: { provider: string; account: string }): string | null =>
	isEmbedProvider(embed.provider) ? EMBEDS[embed.provider].account(embed.account) : null

interface ActionWords {
	/** The card's button. {name} is the service's. */
	button: string
	/** The floating button: a word or two. */
	float: string
}

/**
 * Per action: a new card's title (a dashboard key, see newItem), and what its buttons say on public pages in every
 * language. A service with an action that is already here needs no new words.
 */
export const EMBED_ACTIONS: Record<EmbedAction, { title: string; words: Record<Locale, ActionWords> }> = {
	tip: {
		title: msg('請我喝杯咖啡'),
		words: {
			'zh-TW': { button: '到 {name} 贊助我', float: '贊助我' },
			en: { button: 'Support me on {name}', float: 'Support me' },
			'zh-CN': { button: '到 {name} 赞助我', float: '赞助我' },
			ja: { button: '{name} で応援する', float: '応援する' },
			ko: { button: '{name}에서 후원하기', float: '후원하기' },
			es: { button: 'Apóyame en {name}', float: 'Apóyame' },
			'pt-BR': { button: 'Me apoie no {name}', float: 'Me apoie' },
			fr: { button: 'Me soutenir sur {name}', float: 'Me soutenir' },
			de: { button: 'Auf {name} unterstützen', float: 'Unterstützen' },
			id: { button: 'Dukung saya di {name}', float: 'Dukung saya' },
			th: { button: 'สนับสนุนฉันบน {name}', float: 'สนับสนุนฉัน' },
			vi: { button: 'Ủng hộ tôi trên {name}', float: 'Ủng hộ tôi' },
			ar: { button: 'ادعمني على {name}', float: 'ادعمني' },
		},
	},
	book: {
		title: msg('和我約個時間'),
		words: {
			'zh-TW': { button: '選一個時段', float: '預約' },
			en: { button: 'Pick a time', float: 'Book' },
			'zh-CN': { button: '选一个时段', float: '预约' },
			ja: { button: '日時を選ぶ', float: '予約する' },
			ko: { button: '시간 고르기', float: '예약하기' },
			es: { button: 'Elegir un horario', float: 'Reservar' },
			'pt-BR': { button: 'Escolher um horário', float: 'Agendar' },
			fr: { button: 'Choisir un créneau', float: 'Réserver' },
			de: { button: 'Termin wählen', float: 'Termin buchen' },
			id: { button: 'Pilih waktu', float: 'Pesan' },
			th: { button: 'เลือกเวลา', float: 'จอง' },
			vi: { button: 'Chọn thời gian', float: 'Đặt lịch' },
			ar: { button: 'اختر موعدًا', float: 'احجز' },
		},
	},
}

/** What a service's buttons say in a language. */
export function embedWords(provider: EmbedProvider, locale: Locale): ActionWords {
	const service = EMBEDS[provider]
	const words = EMBED_ACTIONS[service.action].words[locale]
	return { button: words.button.replace('{name}', service.name), float: words.float }
}
