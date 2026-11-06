import {
	isScheduledNow,
	mapsEmbedUrl,
	mapsUrl,
	isHttpUrl,
	LINE_PART,
	LINK_PART,
	SOCIAL_PART,
	socialHref,
	telHref,
	videoEmbed,
	type GalleryItem,
	type EmbedItem,
	type HoursItem,
	type Item,
	type LinkItem,
	type Locale,
	type PageContent,
	type ProductItem,
	type VideoItem,
} from '../shared/content'
import { EMBED_ACTIONS, embedAccount, EMBEDS, embedWords, type EmbedProvider } from '../shared/embeds'
import { CHINESE_FONT_CHARACTER, findFont, FONT_FAMILY, FONT_FILE, fontFileUrl, GOOGLE_TEXT_LIMIT, isSlicedFont, textOf, type HostedFont } from '../shared/fonts'
import { hoursWords, localTime, openStatus, statusText, weekRows } from '../shared/hours'
import { dirAttribute } from '../shared/locale'
import { localizedContent } from '../shared/translations'
import { esc } from './html'
import { iconSvg, linkIconName, SOCIAL_META } from './icons'
import { THEME_CSS } from './compositions'
import { googleFontsHref, resolveAppearance, uiFontStack, type ResolvedAppearance } from './themes'

export interface RenderOptions {
	/** "live" links go through short links; "preview" links open the destination in a new tab. */
	mode: 'live' | 'preview'
	canonicalUrl?: string
	/** The same page in other languages, for search engines. */
	alternates?: readonly { hreflang: string; href: string }[]
	locale?: Locale
	mediaUrl: (ref: string) => string
	/** A link's short link in live mode, e.g. "/lens?s=instagram". */
	linkHref?: (link: LinkItem) => string
	/** Where a tap on part of a page is counted in live mode, e.g. "/_c/mei/<item>/<part>". */
	blockHref?: (item: { id: string }, part: string) => string
	/** Links whose button has to use the short link, because something there needs the Worker: a password, device routing, UTM tags. */
	viaShortLink?: readonly string[]
	badgeHref?: string
	/** Fonts this Worker serves for the page; left out, they come from Google. See headHtml(). */
	fonts?: readonly HostedFont[]
	/**
	 * A preview whose text stays as it is, such as a sample page made into a file: its fonts are then asked for by
	 * what it shows, as a live page's are (fontLinks). The dashboard's preview leaves this out.
	 */
	settled?: boolean
	/** Time zone for opening hours. */
	timeZone?: string
	now?: number
	/** A draft preview link: says so, and reloads when `versionUrl` reports a new `version`. */
	draft?: { nonce: string; versionUrl: string; version: number }
}

interface BioStrings {
	/** BCP 47 tag for the page's `lang` attribute. */
	lang: string
	badge: string
	/** On a link in a preview that has no address yet. */
	linkTodo: string
	/** The bar on a draft preview link. */
	draftNote: string
	socials: string
	/** Labels for the social icons that aren't brand names. */
	website: string
	email: string
	video: string
	play: string
	gallery: string
	/** Under a gallery of `n` (two or more) images. */
	swipe: (n: number) => string
	products: string
	more: string
	navigate: string
	call: string
	map: string
	loadMap: string
	/** Closes the panel an embed card or button opens. */
	close: string
	/** Joins a label to what it names, e.g. "Play video: <title>". */
	colon: string
}

const STRINGS: Record<Locale, BioStrings> = {
	'zh-TW': {
		lang: 'zh-Hant-TW',
		draftNote: '草稿預覽，還沒發布',
		linkTodo: '還沒填網址',
		badge: '用 ♥️ 和 FluxBio 打造',
		socials: '社群連結',
		website: '網站',
		email: 'Email',
		video: '影片',
		play: '播放影片',
		gallery: '圖片',
		swipe: (n) => `${n} 張・左右滑動`,
		products: '商品',
		more: '看全部商品',
		navigate: 'Google 地圖導航',
		call: '打電話',
		map: '地圖',
		loadMap: '點一下載入地圖',
		close: '關閉',
		colon: '：',
	},
	en: {
		lang: 'en',
		draftNote: 'Draft preview, not published yet',
		linkTodo: 'No URL yet',
		badge: 'Made with ♥️ and FluxBio',
		socials: 'Social links',
		website: 'Website',
		email: 'Email',
		video: 'Video',
		play: 'Play video',
		gallery: 'Photos',
		swipe: (n) => `${n} photos · swipe`,
		products: 'Products',
		more: 'See all products',
		navigate: 'Directions',
		call: 'Call',
		map: 'Map',
		loadMap: 'Tap to load the map',
		close: 'Close',
		colon: ': ',
	},
	'zh-CN': {
		lang: 'zh-Hans-CN',
		draftNote: '草稿预览，还没发布',
		linkTodo: '还没填网址',
		badge: '用 ♥️ 和 FluxBio 打造',
		socials: '社交链接',
		website: '网站',
		email: '邮箱',
		video: '视频',
		play: '播放视频',
		gallery: '图片',
		swipe: (n) => `${n} 张 · 左右滑动`,
		products: '商品',
		more: '查看全部商品',
		navigate: 'Google 地图导航',
		call: '打电话',
		map: '地图',
		loadMap: '点击加载地图',
		close: '关闭',
		colon: '：',
	},
	ja: {
		lang: 'ja',
		draftNote: '下書きのプレビュー（未公開）',
		linkTodo: 'URL 未入力',
		badge: '♥️ と FluxBio で作りました',
		socials: 'SNSリンク',
		website: 'ウェブサイト',
		email: 'メール',
		video: '動画',
		play: '動画を再生',
		gallery: '画像',
		swipe: (n) => `${n}枚・左右にスワイプ`,
		products: '商品',
		more: 'すべての商品を見る',
		navigate: '経路案内',
		call: '電話する',
		map: '地図',
		loadMap: 'タップして地図を表示',
		close: '閉じる',
		colon: '：',
	},
	ko: {
		lang: 'ko',
		draftNote: '초안 미리보기, 아직 게시 전이에요',
		linkTodo: 'URL 미입력',
		badge: '♥️와 FluxBio로 만들었어요',
		socials: '소셜 링크',
		website: '웹사이트',
		email: '이메일',
		video: '동영상',
		play: '동영상 재생',
		gallery: '사진',
		swipe: (n) => `${n}장 · 옆으로 넘기기`,
		products: '상품',
		more: '전체 상품 보기',
		navigate: '길찾기',
		call: '전화하기',
		map: '지도',
		loadMap: '탭해서 지도 불러오기',
		close: '닫기',
		colon: ': ',
	},
	es: {
		lang: 'es',
		draftNote: 'Vista previa del borrador, aún sin publicar',
		linkTodo: 'Falta la URL',
		badge: 'Hecho con ♥️ y FluxBio',
		socials: 'Redes sociales',
		website: 'Sitio web',
		email: 'Correo',
		video: 'Video',
		play: 'Reproducir video',
		gallery: 'Fotos',
		swipe: (n) => `${n} fotos · desliza`,
		products: 'Productos',
		more: 'Ver todos los productos',
		navigate: 'Cómo llegar',
		call: 'Llamar',
		map: 'Mapa',
		loadMap: 'Toca para cargar el mapa',
		close: 'Cerrar',
		colon: ': ',
	},
	'pt-BR': {
		lang: 'pt-BR',
		draftNote: 'Prévia do rascunho, ainda não publicada',
		linkTodo: 'Falta a URL',
		badge: 'Feito com ♥️ e FluxBio',
		socials: 'Redes sociais',
		website: 'Site',
		email: 'E-mail',
		video: 'Vídeo',
		play: 'Reproduzir vídeo',
		gallery: 'Fotos',
		swipe: (n) => `${n} fotos · deslize`,
		products: 'Produtos',
		more: 'Ver todos os produtos',
		navigate: 'Como chegar',
		call: 'Ligar',
		map: 'Mapa',
		loadMap: 'Toque para carregar o mapa',
		close: 'Fechar',
		colon: ': ',
	},
	fr: {
		lang: 'fr',
		draftNote: 'Aperçu du brouillon, pas encore publié',
		linkTodo: 'URL manquante',
		badge: 'Fait avec ♥️ et FluxBio',
		socials: 'Réseaux sociaux',
		website: 'Site web',
		email: 'E-mail',
		video: 'Vidéo',
		play: 'Lire la vidéo',
		gallery: 'Photos',
		swipe: (n) => `${n} photos · faites glisser`,
		products: 'Produits',
		more: 'Voir tous les produits',
		navigate: 'Itinéraire',
		call: 'Appeler',
		map: 'Carte',
		loadMap: 'Touchez pour charger la carte',
		close: 'Fermer',
		colon: '\u00a0: ',
	},
	de: {
		lang: 'de',
		draftNote: 'Entwurfsvorschau, noch nicht veröffentlicht',
		linkTodo: 'Noch keine URL',
		badge: 'Mit ♥️ und FluxBio gemacht',
		socials: 'Social-Media-Links',
		website: 'Website',
		email: 'E-Mail',
		video: 'Video',
		play: 'Video abspielen',
		gallery: 'Fotos',
		swipe: (n) => `${n} Fotos · zum Blättern wischen`,
		products: 'Produkte',
		more: 'Alle Produkte ansehen',
		navigate: 'Route',
		call: 'Anrufen',
		map: 'Karte',
		loadMap: 'Tippen, um die Karte zu laden',
		close: 'Schließen',
		colon: ': ',
	},
	id: {
		lang: 'id',
		draftNote: 'Pratinjau draf, belum diterbitkan',
		linkTodo: 'URL belum diisi',
		badge: 'Dibuat dengan ♥️ dan FluxBio',
		socials: 'Media sosial',
		website: 'Situs web',
		email: 'Email',
		video: 'Video',
		play: 'Putar video',
		gallery: 'Foto',
		swipe: (n) => `${n} foto · geser`,
		products: 'Produk',
		more: 'Lihat semua produk',
		navigate: 'Rute',
		call: 'Telepon',
		map: 'Peta',
		loadMap: 'Ketuk untuk memuat peta',
		close: 'Tutup',
		colon: ': ',
	},
	th: {
		lang: 'th',
		draftNote: 'ตัวอย่างฉบับร่าง ยังไม่ได้เผยแพร่',
		linkTodo: 'ยังไม่ได้ใส่ URL',
		badge: 'สร้างด้วย ♥️ และ FluxBio',
		socials: 'โซเชียลมีเดีย',
		website: 'เว็บไซต์',
		email: 'อีเมล',
		video: 'วิดีโอ',
		play: 'เล่นวิดีโอ',
		gallery: 'รูปภาพ',
		swipe: (n) => `${n} รูป · ปัดเพื่อดู`,
		products: 'สินค้า',
		more: 'ดูสินค้าทั้งหมด',
		navigate: 'นำทาง',
		call: 'โทร',
		map: 'แผนที่',
		loadMap: 'แตะเพื่อโหลดแผนที่',
		close: 'ปิด',
		colon: ': ',
	},
	vi: {
		lang: 'vi',
		draftNote: 'Bản xem trước bản nháp, chưa xuất bản',
		linkTodo: 'Chưa nhập URL',
		badge: 'Làm bằng ♥️ và FluxBio',
		socials: 'Mạng xã hội',
		website: 'Trang web',
		email: 'Email',
		video: 'Video',
		play: 'Phát video',
		gallery: 'Hình ảnh',
		swipe: (n) => `${n} ảnh · vuốt để xem`,
		products: 'Sản phẩm',
		more: 'Xem tất cả sản phẩm',
		navigate: 'Chỉ đường',
		call: 'Gọi điện',
		map: 'Bản đồ',
		loadMap: 'Chạm để tải bản đồ',
		close: 'Đóng',
		colon: ': ',
	},
	ar: {
		lang: 'ar',
		draftNote: 'معاينة مسودة، لم تُنشر بعد',
		linkTodo: 'لا يوجد رابط بعد',
		badge: 'صُنع بـ ♥️ و FluxBio',
		socials: 'روابط التواصل الاجتماعي',
		website: 'الموقع الإلكتروني',
		email: 'البريد الإلكتروني',
		video: 'فيديو',
		play: 'تشغيل الفيديو',
		gallery: 'الصور',
		swipe: (n) => `الصور: ${n} · اسحب`,
		products: 'المنتجات',
		more: 'عرض كل المنتجات',
		navigate: 'الاتجاهات',
		call: 'اتصال',
		map: 'الخريطة',
		loadMap: 'اضغط لتحميل الخريطة',
		close: 'إغلاق',
		colon: ': ',
	},
}

/** "a1b" → "a1b", "Jane Doe" → "JD", "Mei" → "M", "王小明" → "王". */
export function initials(name: string): string {
	const trimmed = name.trim()
	if (!trimmed) return ''
	if (/^[\x20-\x7e]+$/.test(trimmed)) {
		const words = trimmed.split(/\s+/)
		if (words.length > 1) return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
		return trimmed.length <= 3 ? trimmed : trimmed[0]!.toUpperCase()
	}
	return [...trimmed][0] ?? ''
}

export function pageVars(look: ResolvedAppearance): string {
	return `:root{${Object.entries(look.vars)
		.map(([key, value]) => `${key}:${value}`)
		.join(';')}}`
}

export const BASE_CSS = `*{box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;isolation:isolate;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--fg);font-family:var(--body-font);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--fg);outline-offset:3px}
.page-bg{position:fixed;inset:0;pointer-events:none}
.page-bg img{width:100%;height:100%;object-fit:cover;display:block}
.page-bg.tile{background-position:center;background-repeat:repeat}
.page-bg::after{content:"";position:absolute;inset:0;background:var(--bg);opacity:var(--dim)}
.head{width:100%;display:flex;flex-direction:column;align-items:center}
.head h1,.head .bio{max-width:none;text-align:center}
.cover{width:100%;margin:20px 0 0;aspect-ratio:16/9;overflow:hidden;background:var(--ph);border-radius:min(var(--radius),22px)}
.cover img{width:100%;height:100%;object-fit:cover;display:block}
main{--pad-x:20px;--pad-t:40px;position:relative;max-width:480px;min-height:100vh;min-height:100dvh;margin:0 auto;padding:var(--pad-t) var(--pad-x) 22px;display:flex;flex-direction:column;align-items:center}
.avatar{width:92px;height:92px;flex:0 0 auto;border-radius:var(--avatar-radius);background:var(--accent);color:var(--ink);border:var(--avatar-border);box-shadow:var(--avatar-shadow);display:flex;align-items:center;justify-content:center;overflow:hidden;font-family:var(--head-font);font-weight:700;font-size:28px;letter-spacing:-.02em}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
h1{margin:14px 0 0;font-family:var(--head-font);font-size:28px;font-weight:700;font-synthesis:var(--head-synthesis,weight style);line-height:1.2;letter-spacing:-.01em;text-align:center;overflow-wrap:anywhere}
.bio{margin:6px 0 0;text-align:center;font-size:15px;line-height:1.6;color:var(--muted);white-space:pre-line;overflow-wrap:anywhere}
.socials{margin-top:16px;display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.socials a{width:44px;height:44px;display:flex;text-decoration:none;align-items:center;justify-content:center;color:var(--fg);background:var(--card-bg);border:var(--card-border);border-radius:var(--icon-radius);box-shadow:var(--card-shadow);}
.items{margin-top:22px;width:100%;display:flex;flex-direction:column;gap:12px}
.link{display:flex;align-items:center;gap:14px;min-height:60px;padding:10px 18px;text-decoration:none;color:var(--fg);background:var(--card-bg);border:var(--card-border);border-radius:var(--radius);box-shadow:var(--card-shadow);transition:transform .15s ease}
.link:hover{transform:translateY(-1px)}
.link svg{flex:0 0 auto}
.link .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.link .t b{font-size:15px;font-weight:600;line-height:1.35;word-break:keep-all;overflow-wrap:anywhere;text-wrap:balance}
.link .t small{font-size:13px;font-weight:500;line-height:1.4;opacity:.75;overflow-wrap:anywhere}
.link .go{display:flex;opacity:.6}
[dir=rtl] .link .go svg,[dir=rtl] .more svg{transform:scaleX(-1)}
[dir=rtl] *{letter-spacing:0!important}
.link.feat{min-height:76px;padding:12px 18px;color:var(--ink);background:var(--accent);border:var(--feat-border);box-shadow:var(--feat-shadow);}
.link.feat .t b{font-size:16px;font-weight:700;line-height:1.3}
.link.feat .t small,.link.feat .go{opacity:1}
.sep{margin:12px 0 0;font-family:var(--head-font);font-size:14px;font-weight:700;font-synthesis:var(--head-synthesis,weight style);line-height:1.4;color:var(--muted)}
.panel{padding:18px;display:flex;flex-direction:column;gap:12px;background:var(--panel);border:var(--card-border);border-radius:min(var(--radius),20px);box-shadow:var(--card-shadow)}
.panel h2,.block-title{margin:0;font-family:var(--head-font);font-size:17px;font-weight:700;font-synthesis:var(--head-synthesis,weight style);line-height:1.35}
.panel p{margin:0}
.frame{position:relative;aspect-ratio:16/9;overflow:hidden;background:#000;border:var(--card-border);border-radius:min(var(--radius),18px);box-shadow:var(--card-shadow)}
.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.cap{margin:8px 2px 0;font-size:14px;font-weight:600;line-height:1.4}
.gallery{display:flex;flex-direction:column;gap:8px}
.track{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 calc(-1*var(--pad-x));padding:0 var(--pad-x);scroll-padding:0 var(--pad-x);scrollbar-width:none}
.track::-webkit-scrollbar{display:none}
.slide{flex:0 0 80%;aspect-ratio:7/5;scroll-snap-align:start;overflow:hidden;display:block;background:var(--ph);border:var(--card-border);border-radius:min(var(--radius),18px)}
.gallery.single .slide{flex-basis:100%}
.slide img{width:100%;height:100%;object-fit:cover;display:block}
.hint-line{margin:0;font-size:12px;color:var(--muted);text-align:center}
.products{display:flex;flex-direction:column;gap:10px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.product{display:flex;flex-direction:column;overflow:hidden;text-decoration:none;color:var(--fg);background:var(--panel);border:var(--card-border);border-radius:min(var(--radius),18px);box-shadow:var(--card-shadow)}
.product .ph{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--ph)}
.product .ph:not(:has(img)){display:none}
.product .ph img{width:100%;height:100%;object-fit:cover;display:block}
.product .info{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px}
.product b{font-size:15px;line-height:1.35;overflow-wrap:anywhere}
.price{font-size:14px;font-variant-numeric:tabular-nums}
.grid.one{grid-template-columns:1fr}
.grid.one .product{flex-direction:row;align-items:center}
.grid.one .ph{flex:0 0 38%}
.more{align-self:flex-end;display:inline-flex;align-items:center;gap:6px;min-height:40px;font-size:14px;font-weight:700;color:var(--fg)}
.open-pill{margin:14px 0 0;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700}
.open-pill i{width:8px;height:8px;border-radius:999px;background:var(--ok)}
.open-pill b{color:var(--ok)}
.open-pill.closed i{background:var(--muted)}
.open-pill.closed b{color:var(--fg)}
.open-pill span{color:var(--muted);font-weight:500}
.hours dl{margin:0;display:flex;flex-direction:column;font-size:14px}
.hours dl div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}
.hours dl div:last-child{border-bottom:0}
.hours dt{color:var(--muted)}
.hours dd{margin:0;text-align:end;font-variant-numeric:tabular-nums}
.hours .off dd{color:var(--muted)}
.hours .today dt,.hours .today dd{color:var(--fg);font-weight:700}
.note,.addr{font-size:14px;line-height:1.6;color:var(--muted)}
.map{position:relative;height:160px;overflow:hidden;background:var(--ph);border:var(--card-border);border-radius:min(var(--radius),14px)}
.map iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.acts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.acts.one{grid-template-columns:1fr}
.act{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 12px;font-size:14px;font-weight:700;text-align:center;text-decoration:none;color:var(--fg);border:var(--card-border);border-radius:min(var(--radius),14px)}
.act.main{color:var(--ink);background:var(--accent);border:var(--feat-border);box-shadow:var(--feat-shadow)}
footer{margin-top:auto;padding-top:32px;display:flex;flex-direction:column;align-items:center;gap:4px}
.badge{display:inline-flex;align-items:center;min-height:32px;font-size:12px;color:var(--muted);text-decoration:none}
@media (prefers-reduced-motion:reduce){.link{transition:none}}`

/**
 * `hosted` are the fonts this Worker serves for the page (see src/worker/lib/fonts.ts):
 * given, nothing is loaded from Google, and [] means the visitor's own fonts.
 * Left out (the dashboard preview, pages published before fonts were hosted),
 * the fonts come from Google. `shown` is what a visitor's page shows, see fontsHtml().
 */
export function headHtml(look: ResolvedAppearance, title: string, hosted?: readonly HostedFont[], shown?: string): string {
	return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="theme-color" content="${look.theme.bg}">${fontsHtml(look, hosted, shown)}`
}

/** Everything a keyboard types, which a page's markup is made of too. */
const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index))

/**
 * The stylesheets a page links at Google. A Chinese, Japanese or Korean font comes cut into a hundred files or so,
 * and its stylesheet is the list of them: about 35 KB that hold up the first paint, before the dozens of files a page
 * of Chinese then pulls from it. Given `shown`, what the page shows this visitor, such a font is asked for with
 * exactly the characters it has to draw there (`&text=`), which is one small rule and one file:
 *
 * - where it is the page's own font (a page in Traditional Chinese, or a font of that kind the owner picked), every
 *   character shown;
 * - where it only draws what the fonts before it can't (look.fallbackFonts: the built-in Chinese font on a page in
 *   English, say), the Chinese characters shown, and nothing at all when there are none.
 *
 * Google cuts a font to GOOGLE_TEXT_LIMIT characters at most, so a page that shows more links the whole font. Other
 * families are linked whole, as ever: their stylesheets are small and their files are kept for a year, where a cut
 * one is kept for a day. So is everything when `shown` is left out: a preview's text changes with every key.
 */
function fontLinks(look: ResolvedAppearance, shown?: string): string[] {
	if (shown === undefined) return look.fontsHref ? [look.fontsHref] : []
	const fallback = look.webFonts.filter((font) => look.fallbackFonts.includes(font.family))
	const own = look.webFonts.filter((font) => !fallback.includes(font) && isSliced(font.family))
	if (!fallback.length && !own.length) return look.fontsHref ? [look.fontsHref] : []
	const cut = (fonts: typeof look.webFonts, characters: string[]) => {
		if (!fonts.length || !characters.length) return ''
		const whole = googleFontsHref(fonts)
		return characters.length > GOOGLE_TEXT_LIMIT ? whole : `${whole}&text=${inAddress(characters.sort().join(''))}`
	}
	const beyond = beyondAscii(shown)
	return [
		googleFontsHref(look.webFonts.filter((font) => !fallback.includes(font) && !own.includes(font))),
		cut(fallback, beyond.filter((character) => CHINESE_FONT_CHARACTER.test(character))),
		cut(own, [...ASCII, ...beyond]),
	].filter(Boolean)
}

/**
 * The characters of `text` past ASCII, each once, in the order they first appear. This reads a whole page on every
 * view, and a page is mostly markup, so ASCII is stepped over without being looked at twice: collecting every
 * character first was a quarter of what a view cost, and most of it on a long page.
 */
function beyondAscii(text: string): string[] {
	const seen = new Set<string>()
	for (let at = 0; at < text.length; at++) {
		if (text.charCodeAt(at) <= 0x7e) continue
		const point = text.codePointAt(at)!
		// A character outside the basic plane is two code units, and one character.
		if (point > 0xffff) at++
		seen.add(String.fromCodePoint(point))
	}
	return [...seen]
}

/** Text as part of an address, with nothing left in it that HTML would write another way: encodeURIComponent keeps ' ( ) * ! as they are. */
const inAddress = (text: string): string => encodeURIComponent(text).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)

const isSliced = (family: string): boolean => {
	const font = findFont(family)
	return Boolean(font && isSlicedFont(font))
}

const FACE_WEIGHT = /^\d{3}(?: \d{3})?$/

function fontsHtml(look: ResolvedAppearance, hosted?: readonly HostedFont[], shown?: string): string {
	if (hosted) {
		// Names and files were checked when stored; checked again, as they go into CSS.
		const faces = hosted.flatMap((font) =>
			FONT_FAMILY.test(font.family)
				? font.faces
						.filter((face) => FONT_FILE.test(face.file) && FACE_WEIGHT.test(face.weight))
						.map(
							(face) =>
								`@font-face{font-family:'${font.family}';font-style:normal;font-weight:${face.weight};font-display:swap;src:url(${fontFileUrl(face.file)}) format('woff2')}`,
						)
				: [],
		)
		return faces.length ? `\n<style>${faces.join('\n')}</style>` : ''
	}
	const links = fontLinks(look, shown)
	if (!links.length) return ''
	return `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${links.map((href) => `\n<link rel="stylesheet" href="${esc(href)}">`).join('')}`
}

/** Every built-in word a page can show in a language, for copying the fonts it needs. */
export function builtInWords(locale: Locale): string {
	return textOf(STRINGS[locale]) + textOf(Object.values(EMBED_ACTIONS).map((action) => action.words[locale])) + hoursWords(locale)
}

function absoluteUrl(path: string, base?: string): string | null {
	if (!base) return null
	try {
		return new URL(path, base).href
	} catch {
		return null
	}
}

/** The items a visitor sees right now: not hidden, inside their schedule, and filled in enough to show. */
const TODO_CSS = '.link.todo,.act.todo{opacity:.62;border-style:dashed;border-width:1.5px}'

const LINE_BUTTON_CSS = `.has-line main{padding-bottom:88px}
.line-button{position:fixed;inset-inline-end:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:6;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;background:#06C755;box-shadow:0 4px 14px rgba(0,0,0,.28);text-decoration:none}`

/** An embed card, and the floating embed button, which sits above the LINE button when there is one. */
const EMBED_CSS = `.embed-head{display:flex;align-items:center;gap:14px}
.embed-icon{flex:0 0 auto;width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:min(var(--radius),14px);color:var(--accent-text);background:color-mix(in srgb,var(--accent) 16%,transparent)}
.embed-text{min-width:0;display:flex;flex-direction:column;gap:2px}
.has-embed main{padding-bottom:84px}
.has-embed.has-line main{padding-bottom:148px}
.embed-button{position:fixed;inset-inline-end:16px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:6;min-height:48px;padding-inline:14px 18px;display:flex;align-items:center;gap:8px;border-radius:999px;color:var(--ink);background:var(--accent);font:700 15px/1.2 var(--body-font);text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.28)}
.has-line .embed-button{bottom:calc(84px + env(safe-area-inset-bottom))}`

/**
 * The sheet a tap on an embed opens over a live page: a bottom sheet on phones, centred on wider screens. It holds the
 * service's own panel, which keeps its own colors whatever the theme, so the sheet takes the panel's (`--paper`).
 */
const SHEET_CSS = `.sheet{width:100%;max-width:440px;max-height:100%;margin:auto auto 0;padding:0 0 env(safe-area-inset-bottom);border:0;border-radius:20px 20px 0 0;color:#131416;background:var(--paper,#fff);box-shadow:0 -8px 40px rgba(0,0,0,.3);overflow:hidden}
.sheet::backdrop{background:rgba(0,0,0,.5)}
.sheet-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:6px 0;padding-inline:20px 6px}
.sheet-bar b{font:700 15px/1.3 var(--body-font)}
.sheet-bar form{margin:0}
.sheet:focus{outline:0}
.sheet-close{width:40px;height:40px;margin:2px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;color:inherit;background:rgba(0,0,0,.06);cursor:pointer}
.sheet-close:focus-visible{outline:2px solid currentColor;outline-offset:-4px}
.sheet iframe{display:block;width:100%;height:min(712px,calc(100dvh - 110px));border:0}
body:has(.sheet[open]){overflow:hidden}
@media (min-width:600px){.sheet{margin:auto;border-radius:20px;padding:0}}`

const DRAFT_CSS = '.draft-note{position:sticky;top:0;z-index:5;margin:0;padding:6px 12px;background:#131416;color:#fff;font:500 13px/1.4 system-ui,sans-serif;text-align:center}'

/**
 * Checks for a newer draft every few seconds while the page is on screen. It
 * stops after 15 quiet minutes, so a forgotten tab doesn't use up the Worker's
 * daily requests, and starts again when the tab comes back.
 */
function draftScript(draft: NonNullable<RenderOptions['draft']>): string {
	const url = JSON.stringify(draft.versionUrl).replace(/</g, '\\u003c')
	return `<script nonce="${esc(draft.nonce)}">(function(){var u=${url},v=${Number(draft.version)},n=0,t=0;function stop(){clearInterval(t);t=0}function poll(){if(document.hidden)return;if(++n>225)return stop();fetch(u,{cache:'no-store'}).then(function(r){if(r.status===410)location.reload();if(r.status!==200){stop();return null}return r.json()}).then(function(j){if(j&&j.version!==v)location.reload()}).catch(function(){})}function go(){stop();n=0;t=setInterval(poll,4000)}document.addEventListener('visibilitychange',function(){if(!document.hidden&&!t)go()});go()})()</script>`
}

/** What a page shows. `unfinished` adds links that have a title but no address yet; previews use it, visitors never get it. */
export function visibleItems(content: PageContent, now = Date.now(), { unfinished = false } = {}): Item[] {
	return content.items.filter((item) => {
		if (item.hidden) return false
		switch (item.kind) {
			case 'link':
				return Boolean(item.title.trim() && (item.url.trim() || unfinished)) && isScheduledNow(item, now)
			case 'heading':
				return Boolean(item.title.trim())
			case 'video':
				return Boolean(videoEmbed(item.url))
			case 'gallery':
				return item.images.length > 0
			case 'product':
				return item.products.some((product) => product.name.trim())
			case 'hours':
				return item.week.some((day) => day.length > 0) || Boolean(item.address.trim())
			case 'embed':
				return Boolean(embedAccount(item)) || (unfinished && Boolean(item.title.trim()))
			// A kind this version doesn't know, e.g. in a page published by another version, isn't shown.
			default:
				return false
		}
	})
}

interface Context {
	options: RenderOptions
	text: BioStrings
	look: ResolvedAppearance
	live: boolean
	newTab: string
	now: number
	timeZone: string
	locale: Locale
	/** The panels a live page's embeds open, filled in as they are drawn: one sheet per address. */
	sheets: Sheet[]
}

interface Sheet {
	id: string
	provider: EmbedProvider
	url: string
}

/** A document for an iframe: shows a picture and loads the real thing only when tapped. */
function facade(ctx: Context, link: { href: string; label: string }, inner: string, css: string): string {
	const newTab = ctx.live ? '' : ' target="_blank" rel="noopener noreferrer"'
	return `<!doctype html><html lang="${ctx.text.lang}"${dirAttribute(ctx.text.lang)}><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}a{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-decoration:none}${css}</style><a href="${esc(link.href)}" aria-label="${esc(link.label)}"${newTab}>${inner}</a></html>`
}

/**
 * The one script on a page of links, for a tap on a link that goes straight to its address. A browser reports those by itself
 * through `ping`, but Firefox doesn't by default and ad blockers stop it, so this takes the attribute over and reports the tap
 * itself. Without JavaScript the attribute is still there. Taking it off first means a tap is never counted twice.
 */
export const TAP_SCRIPT = `document.querySelectorAll('a[ping]').forEach(function(a){var u=a.getAttribute('ping');a.removeAttribute('ping');function t(){fetch(u,{method:'POST',keepalive:true,credentials:'omit'}).catch(function(){})}a.addEventListener('click',t);a.addEventListener('auxclick',function(e){e.button===1&&t()})})`
/** The CSP allows exactly that text; tests/link-buttons.test.ts fails if the two part ways. */
export const TAP_SCRIPT_HASH = 'sha256-ll32O/+80PlnpGmojgn8eAezy4q1giUtfmTb5/iYkwU='

/**
 * The other script, on a page with an embed: a tap on a link with `data-sheet` opens that sheet over the page instead of
 * leaving it, and gives its frame the panel's address (`data-src`) the first time. Until then the frame has none, so
 * nothing loads from the service before a tap. TAP_SCRIPT still counts the tap. Without JavaScript, in a browser without
 * <dialog>, or for a tap meant for a new tab, the link goes to the account's page as any link would. The close button
 * needs no script: it is a dialog form.
 */
export const SHEET_SCRIPT = `(function(){document.querySelectorAll('a[data-sheet]').forEach(function(a){var d=document.getElementById(a.getAttribute('data-sheet')),f=d&&d.querySelector('iframe');if(!f||!d.showModal)return;a.addEventListener('click',function(e){if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();if(!f.getAttribute('src'))f.setAttribute('src',f.getAttribute('data-src'));d.showModal()})});document.querySelectorAll('dialog.sheet').forEach(function(d){d.addEventListener('click',function(e){if(e.target===d)d.close()})})})()`
/** Allowed by the CSP like TAP_SCRIPT, on pages with an embed; tests/embeds.test.ts fails if the two part ways. */
export const SHEET_SCRIPT_HASH = 'sha256-M2g4mFphpgGNn8+aEuyEKed58F0ekQKPZvgEDoMrUeo='

/**
 * What a panel may do in its frame, whichever service it is: run, keep its own origin (the service's, never this site's:
 * the frame only ever gets an address the service's entry in EMBEDS built from a checked account), send its forms, and
 * open PayPal or a card form in a window of their own. Never navigate this page. A service that needs more isn't one.
 */
export const SHEET_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox'

function sheetHtml(text: BioStrings, sheet: Sheet): string {
	const service = EMBEDS[sheet.provider]
	const name = esc(service.name)
	// autofocus: opening it focuses the sheet itself, not its close button, which a tap would then show ringed.
	return `<dialog class="sheet" id="${sheet.id}" aria-label="${name}" style="--paper:${service.paper}" autofocus><div class="sheet-bar"><b>${name}</b><form method="dialog"><button class="sheet-close" aria-label="${esc(text.close)}">${iconSvg('close', 22, 2)}</button></form></div><iframe title="${name}" sandbox="${SHEET_SANDBOX}" allow="${esc(service.allow)}" data-src="${esc(sheet.url)}"></iframe></dialog>`
}

/** The sheet for an embed's panel on a live page, made the first time a button opens it. */
function sheetFor(ctx: Context, provider: EmbedProvider, account: string): Sheet {
	const url = EMBEDS[provider].panel(account)
	let sheet = ctx.sheets.find((entry) => entry.url === url)
	if (!sheet) ctx.sheets.push((sheet = { id: `sheet-${ctx.sheets.length + 1}`, provider, url }))
	return sheet
}

/** The services whose panels a live page opens, which its CSP lets it frame: the same ones renderBioPage draws. */
export function pageEmbeds(content: PageContent, now = Date.now()): EmbedProvider[] {
	const providers = new Set<EmbedProvider>()
	for (const item of visibleItems(content, now)) if (item.kind === 'embed') providers.add(item.provider)
	if (content.embedButton && embedAccount(content.embedButton)) providers.add(content.embedButton.provider)
	return [...providers]
}

/** A link to an address the visitor can see before tapping, which reports the tap in live mode. */
function counted(ctx: Context, item: { id: string }, part: string, url: string): string {
	const route = ctx.live ? ctx.options.blockHref?.(item, part) : undefined
	if (!route) return `href="${esc(url)}"`
	return isHttpUrl(url) ? `href="${esc(url)}" ping="${esc(route)}"` : `href="${esc(route)}"`
}

function linkAttributes(ctx: Context, link: LinkItem): string {
	const url = link.url.trim()
	const short = ctx.live ? ctx.options.linkHref?.(link) : undefined
	if (!short) return `href="${esc(link.url)}"`
	return link.hideUrl || ctx.options.viaShortLink?.includes(link.id) || !isHttpUrl(url) ? `href="${esc(short)}"` : counted(ctx, link, LINK_PART, url)
}

function linkHtml(ctx: Context, link: LinkItem): string {
	// A chain on every row says nothing: only an icon that names the place, or one the owner chose, is drawn.
	const named = linkIconName(link)
	const icon = link.icon === 'auto' && named === 'link' && !ctx.look.theme.rowIcons ? null : named
	const big = link.featured
	// Only previews get this far with no address: it can't be followed, and it says why.
	if (!link.url.trim()) {
		return `<div class="link${big ? ' feat' : ''} todo">${icon ? iconSvg(icon, big ? 22 : 20) : ''}<span class="t"><b>${esc(link.title)}</b><small>${esc(ctx.text.linkTodo)}</small></span></div>`
	}
	const subtitle = link.subtitle.trim() ? `<small>${esc(link.subtitle)}</small>` : ''
	return `<a class="link${big ? ' feat' : ''}" ${linkAttributes(ctx, link)}${ctx.newTab}>${icon ? iconSvg(icon, big ? 22 : 20) : ''}<span class="t"><b>${esc(link.title)}</b>${subtitle}</span><span class="go">${iconSvg('arrowUpRight', big ? 18 : 16, 2)}</span></a>`
}

function videoHtml(ctx: Context, item: VideoItem): string {
	const video = videoEmbed(item.url)!
	const title = item.title.trim() || ctx.text.video
	// In the dashboard preview the frame can't run the player, so the video opens in a new tab.
	// The player opens inside its frame, so this one still goes through the Worker to be counted.
	const target = ctx.live ? (ctx.options.blockHref?.(item, 'play') ?? video.embed) : item.url
	const thumb = video.thumbnail ? `<img src="${esc(video.thumbnail)}" alt="">` : ''
	const doc = facade(
		ctx,
		{ href: target, label: `${ctx.text.play}${ctx.text.colon}${title}` },
		`${thumb}<span><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="${ctx.look.ink}"/></svg></span>`,
		`body{background:#111}img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}span{position:relative;width:64px;height:64px;border-radius:999px;background:${ctx.look.accent};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,.4)}`,
	)
	const caption = item.title.trim() ? `<p class="cap">${esc(item.title)}</p>` : ''
	return `<section aria-label="${esc(title)}"><div class="frame"><iframe title="${esc(title)}" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" srcdoc="${esc(doc)}"></iframe></div>${caption}</section>`
}

function galleryHtml(ctx: Context, item: GalleryItem): string {
	const slides = item.images
		.map((image) => {
			const img = `<img src="${esc(ctx.options.mediaUrl(image.image))}" alt="${esc(image.alt)}" loading="lazy">`
			return image.url.trim()
				? `<a class="slide" ${counted(ctx, item, image.id, image.url.trim())}${ctx.newTab}>${img}</a>`
				: `<span class="slide">${img}</span>`
		})
		.join('')
	const label = item.title.trim() || ctx.text.gallery
	const title = item.title.trim() ? `<h2 class="block-title">${esc(item.title)}</h2>` : ''
	const single = item.images.length === 1
	const hint = single ? '' : `<p class="hint-line" aria-hidden="true">${esc(ctx.text.swipe(item.images.length))}</p>`
	return `<section class="gallery${single ? ' single' : ''}" aria-label="${esc(label)}">${title}<div class="track">${slides}</div>${hint}</section>`
}

function productHtml(ctx: Context, item: ProductItem): string {
	const products = item.products.filter((product) => product.name.trim())
	const cards = products
		.map((product) => {
			const image = product.image
				? `<img src="${esc(ctx.options.mediaUrl(product.image))}" alt="" loading="lazy">`
				: iconSvg('bag', 28, 1.6)
			const body = `<span class="ph">${image}</span><span class="info"><b>${esc(product.name)}</b>${product.price.trim() ? `<span class="price">${esc(product.price)}</span>` : ''}</span>`
			return product.url.trim()
				? `<a class="product" ${counted(ctx, item, product.id, product.url.trim())}${ctx.newTab}>${body}</a>`
				: `<div class="product">${body}</div>`
		})
		.join('')
	const title = item.title.trim() ? `<h2 class="block-title">${esc(item.title)}</h2>` : ''
	const more = item.moreUrl.trim()
		? `<a class="more" ${counted(ctx, item, 'more', item.moreUrl.trim())}${ctx.newTab}>${esc(ctx.text.more)}${iconSvg('arrowRight', 16, 2)}</a>`
		: ''
	return `<section class="products" aria-label="${esc(item.title.trim() || ctx.text.products)}">${title}<div class="grid${products.length === 1 ? ' one' : ''}">${cards}</div>${more}</section>`
}

function hoursHtml(ctx: Context, item: HoursItem): string {
	const today = localTime(ctx.timeZone, ctx.now).day
	const rows = item.week.some((day) => day.length)
		? `<dl>${weekRows(item.week, ctx.locale, today)
				.map((row) => `<div class="${[row.today && 'today', row.closed && 'off'].filter(Boolean).join(' ')}"><dt>${esc(row.days)}</dt><dd>${esc(row.hours)}</dd></div>`)
				.join('')}</dl>`
		: ''
	const address = item.address.trim()
	const mapDoc =
		item.showMap && address
			? facade(
					ctx,
					{ href: ctx.live ? mapsEmbedUrl(address) : mapsUrl(address), label: `${ctx.text.loadMap}${ctx.text.colon}${address}` },
					`<span>${`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.2"/></svg>`}${esc(ctx.text.loadMap)}</span>`,
					`a{background:${ctx.look.theme.placeholder};background-image:linear-gradient(90deg,transparent 44%,${ctx.look.theme.bg} 44%,${ctx.look.theme.bg} 47%,transparent 47%),linear-gradient(0deg,transparent 58%,${ctx.look.theme.bg} 58%,${ctx.look.theme.bg} 63%,transparent 63%),linear-gradient(90deg,transparent 78%,${ctx.look.theme.bg} 78%,${ctx.look.theme.bg} 80%,transparent 80%)}span{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;background:${ctx.look.theme.bg};color:${ctx.look.theme.fg};font:600 13px/1.3 ${uiFontStack(ctx.locale)};box-shadow:0 2px 12px rgba(0,0,0,.18)}`,
				)
			: ''
	const map = mapDoc
		? `<div class="map"><iframe title="${esc(ctx.text.map)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" srcdoc="${esc(mapDoc)}"></iframe></div>`
		: ''
	const tel = telHref(item.phone)
	const actions = [
		address && `<a class="act main" ${counted(ctx, item, 'map', mapsUrl(address))}${ctx.newTab}>${iconSvg('map', 18, 2)}${esc(ctx.text.navigate)}</a>`,
		tel && `<a class="act" href="${esc(tel)}">${iconSvg('phone', 18, 2)}${esc(ctx.text.call)}</a>`,
	].filter(Boolean)
	const id = `h-${item.id}`
	return `<section class="panel hours" aria-labelledby="${esc(id)}"><h2 id="${esc(id)}">${esc(item.title.trim() || ctx.text.map)}</h2>${rows}${item.note.trim() ? `<p class="note">${esc(item.note)}</p>` : ''}${map}${address ? `<p class="addr">${esc(address)}</p>` : ''}${actions.length ? `<div class="acts${actions.length === 1 ? ' one' : ''}">${actions.join('')}</div>` : ''}</section>`
}

/** A link to an account's page on a service. On a live page a tap opens the service's panel in a sheet instead (SHEET_SCRIPT). */
function embedLink(ctx: Context, item: { id: string }, provider: EmbedProvider, account: string): string {
	const sheet = ctx.live ? ` data-sheet="${sheetFor(ctx, provider, account).id}"` : ''
	return `${counted(ctx, item, provider, EMBEDS[provider].page(account))}${sheet}${ctx.newTab}`
}

function embedHtml(ctx: Context, item: EmbedItem): string {
	const service = EMBEDS[item.provider]
	const account = embedAccount(item)
	const id = `e-${item.id}`
	const title = item.title.trim()
	const label = esc(embedWords(item.provider, ctx.locale).button)
	// Only previews get this far without an account: the button shows, and goes nowhere.
	const button = account ? `<a class="act main" ${embedLink(ctx, item, item.provider, account)}>${label}</a>` : `<span class="act main todo">${label}</span>`
	const heading = title ? `<h2 id="${esc(id)}">${esc(item.title)}</h2>` : ''
	const note = item.note.trim() ? `<p class="note">${esc(item.note)}</p>` : ''
	return `<section class="panel embed" ${title ? `aria-labelledby="${esc(id)}"` : `aria-label="${esc(service.name)}"`}><div class="embed-head"><span class="embed-icon" aria-hidden="true">${iconSvg(service.icon, 28, 1.8)}</span><div class="embed-text">${heading}${note}</div></div>${button}</section>`
}

function itemHtml(ctx: Context, item: Item): string {
	switch (item.kind) {
		case 'link':
			return linkHtml(ctx, item)
		case 'heading':
			return `<h2 class="sep">${esc(item.title)}</h2>`
		case 'video':
			return videoHtml(ctx, item)
		case 'gallery':
			return galleryHtml(ctx, item)
		case 'product':
			return productHtml(ctx, item)
		case 'hours':
			return hoursHtml(ctx, item)
		case 'embed':
			return embedHtml(ctx, item)
	}
}

/** Renders a public bio page as a complete HTML document, with no JavaScript but TAP_SCRIPT, when something on it reports a tap. */
export function renderBioPage(source: PageContent, options: RenderOptions): string {
	// A locale this version doesn't know (e.g. in a snapshot written by a newer one) falls back to the source language.
	const locale: Locale = options.locale && Object.hasOwn(STRINGS, options.locale) ? options.locale : 'zh-TW'
	const text = STRINGS[locale]
	const content = localizedContent(source, locale)
	const look = resolveAppearance(content.appearance, locale)
	const live = options.mode === 'live'
	const now = options.now ?? Date.now()
	const ctx: Context = {
		options,
		text,
		look,
		live,
		newTab: live ? '' : ' target="_blank" rel="noopener noreferrer"',
		now,
		timeZone: options.timeZone ?? 'UTC',
		locale,
		sheets: [],
	}

	const name = content.profile.name.trim()
	const bio = content.profile.bio.trim()
	const title = content.seo.title.trim() || name || 'FluxBio'
	const description = content.seo.description.trim() || bio.replace(/\s+/g, ' ').slice(0, 160)
	const shareImage = (content.seo.imageMode === 'upload' ? content.seo.image : content.seo.autoImage) ?? content.profile.avatar
	const shareImageUrl = shareImage ? absoluteUrl(options.mediaUrl(shareImage), options.canonicalUrl) : null
	const largeImage = shareImage && shareImage !== content.profile.avatar

	const meta = [
		description && `<meta name="description" content="${esc(description)}">`,
		options.canonicalUrl && `<link rel="canonical" href="${esc(options.canonicalUrl)}">`,
		...(options.alternates ?? []).map(({ hreflang, href }) => `<link rel="alternate" hreflang="${esc(hreflang)}" href="${esc(href)}">`),
		'<meta property="og:type" content="profile">',
		`<meta property="og:title" content="${esc(title)}">`,
		description && `<meta property="og:description" content="${esc(description)}">`,
		options.canonicalUrl && `<meta property="og:url" content="${esc(options.canonicalUrl)}">`,
		shareImageUrl && `<meta property="og:image" content="${esc(shareImageUrl)}">`,
		largeImage && '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
		`<meta name="twitter:card" content="${largeImage ? 'summary_large_image' : 'summary'}">`,
		content.profile.avatar && `<link rel="icon" href="${esc(options.mediaUrl(content.profile.avatar))}">`,
	]
		.filter(Boolean)
		.join('\n')

	// Pictures an AI gave the page.
	const { coverImage, bgImage, bgDim, bgTile } = content.appearance
	const cover = coverImage ? `<figure class="cover"><img src="${esc(options.mediaUrl(coverImage))}" alt=""></figure>` : ''
	// A pattern repeats at the size the owner chose; anything else is one picture covering the screen. Media ids are
	// letters, digits, dots and dashes, so the address needs no escaping inside url('…') beyond what esc() does.
	const tile = Math.trunc(Number(bgTile))
	const backdrop = !bgImage
		? ''
		: tile > 0
			? `<div class="page-bg tile" style="--dim:${Number(bgDim)};background-image:url('${esc(options.mediaUrl(bgImage))}');background-size:${tile}px auto" aria-hidden="true"></div>`
			: `<div class="page-bg" style="--dim:${Number(bgDim)}" aria-hidden="true"><img src="${esc(options.mediaUrl(bgImage))}" alt=""></div>`

	const avatar = content.profile.avatar
		? `<img src="${esc(options.mediaUrl(content.profile.avatar))}" alt="">`
		: esc(initials(name))

	const socials = content.appearance.showSocial
		? content.socials.flatMap((social) => {
				const socialUrl = socialHref(social.platform, social.url)
				if (!socialUrl) return []
				const meta = SOCIAL_META[social.platform]
				// Brand names stay as they are; the generic ones are in the page's language.
				const label = social.platform === 'website' ? text.website : social.platform === 'email' ? text.email : meta.label
				const ping = live && content.countSocials && options.blockHref && isHttpUrl(socialUrl) ? ` ping="${esc(options.blockHref(social, SOCIAL_PART))}"` : ''
				return `<a href="${esc(socialUrl)}" aria-label="${esc(label)}" rel="me${live ? '' : ' noopener noreferrer'}"${live ? '' : ' target="_blank"'}${ping}>${iconSvg(meta.icon, 20)}</a>`
			})
		: []

	const items = visibleItems(content, now, { unfinished: options.mode === 'preview' })
	const hours = items.find((item): item is HoursItem => item.kind === 'hours' && item.week.some((day) => day.length > 0))
	let openPill = ''
	if (hours) {
		const status = openStatus(hours.week, ctx.timeZone, now)
		const { label, detail } = statusText(status, locale)
		openPill = `<p class="open-pill${status.open ? '' : ' closed'}"><i aria-hidden="true"></i><b>${esc(label)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}</p>`
	}

	const footer = content.showBadge
		? `<footer><a class="badge" href="${esc(options.badgeHref ?? 'https://fluxbio.link')}"${ctx.newTab}>${esc(text.badge)}</a></footer>`
		: ''

	const itemsHtml = items.map((item) => itemHtml(ctx, item)).join('\n')
	const lineUrl = content.lineButton?.trim() ? socialHref('line', content.lineButton) : null
	const lineButton = lineUrl
		? `<a class="line-button" ${counted(ctx, { id: 'page' }, LINE_PART, lineUrl)} aria-label="LINE"${ctx.newTab}>${iconSvg('line', 30)}</a>`
		: ''
	const floating = content.embedButton
	const floatingAccount = floating ? embedAccount(floating) : null
	const floatingWords = floating && floatingAccount ? embedWords(floating.provider, locale) : null
	const embedButton =
		floating && floatingAccount && floatingWords
			? `<a class="embed-button" ${embedLink(ctx, { id: 'page' }, floating.provider, floatingAccount)} aria-label="${esc(floatingWords.button)}">${iconSvg(EMBEDS[floating.provider].icon, 22, 2)}<span>${esc(floatingWords.float)}</span></a>`
			: ''
	// The owner's own text can't match: esc() turns its quotes into entities.
	const reportsTaps = / ping="/.test(itemsHtml + socials.join('') + lineButton + embedButton)
	const showsEmbed = Boolean(embedButton) || items.some((item) => item.kind === 'embed')

	const body = `${options.draft ? `<p class="draft-note" role="status">${esc(text.draftNote)}</p>` : ''}
${backdrop}
<main>
<header class="head">
<div class="avatar" aria-hidden="true">${avatar}</div>
<h1>${esc(name)}</h1>
${bio ? `<p class="bio">${esc(bio)}</p>` : ''}
${openPill}
${socials.length ? `<nav class="socials" aria-label="${esc(text.socials)}">${socials.join('')}</nav>` : ''}
</header>
${cover}
${items.length ? `<div class="items">${itemsHtml}</div>` : ''}
${footer}
</main>
${lineButton}${embedButton}${ctx.sheets.map((sheet) => sheetHtml(text, sheet)).join('')}
${reportsTaps ? `<script>${TAP_SCRIPT}</script>` : ''}${ctx.sheets.length ? `<script>${SHEET_SCRIPT}</script>` : ''}
${options.draft ? draftScript(options.draft) : ''}`
	const bodyClass = [lineButton && 'has-line', embedButton && 'has-embed'].filter(Boolean).join(' ')

	return `<!doctype html>
<html lang="${text.lang}"${dirAttribute(text.lang)}>
<head>
${headHtml(look, title, options.fonts, live || options.settled ? body : undefined)}
${meta}
<style>${pageVars(look)}
${BASE_CSS}
${THEME_CSS[look.theme.id]}${lineButton ? `\n${LINE_BUTTON_CSS}` : ''}${showsEmbed ? `\n${EMBED_CSS}` : ''}${ctx.sheets.length ? `\n${SHEET_CSS}` : ''}${options.mode === 'preview' ? `\n${TODO_CSS}` : ''}${options.draft ? `\n${DRAFT_CSS}` : ''}</style>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
</body>
</html>`
}
