import type { ThemeId } from '../shared/content'

/**
 * What makes each theme a layout rather than a color set: the rules that come
 * after BASE_CSS in src/templates/render.ts. Each theme only gets its own, so a
 * page never ships the others.
 *
 * Every color here is a variable from pageVars() or a mix of them, so a theme
 * keeps working in colors an AI picks. Dark themes can rely on --fg being light
 * and light themes on --bg being light (fitBackground in themes.ts).
 */

/** `color` at `percent`% over whatever is behind it. */
const see = (color: string, percent: number) => `color-mix(in srgb,var(${color}) ${percent}%,transparent)`
/** The cover as the whole page's background, behind a scrim. */
const coverBehind = (scrim: string, blur = 0) => `.cover{position:fixed;inset:${blur ? `-${blur * 2}px` : '0'};z-index:-1;width:auto;margin:0;aspect-ratio:auto;border:0;border-radius:0;box-shadow:none;background:none}
.cover img{${blur ? `filter:blur(${blur}px)` : ''}}
.cover::after{content:"";position:absolute;inset:0;background:${scrim}}`
/** A background that stays put while the page scrolls, on phones too. */
const field = (background: string) => `body::before{content:"";position:fixed;inset:0;z-index:-2;background:${background}}`
/** The name beside the avatar, with the bio and what follows under them. */
const sideHead = (avatar: number) => `.head{display:grid;grid-template-columns:${avatar}px minmax(0,1fr);column-gap:14px;align-items:center}
.avatar{grid-row:span 1;width:${avatar}px;height:${avatar}px;margin:0}
.head h1{margin:0;text-align:start}
.head .bio,.head .open-pill,.head .socials{grid-column:1/-1;justify-self:start}
.head .bio{margin-top:12px;text-align:start}
.socials{justify-content:flex-start}`
/** Translucent panels for blocks on a picture or a gradient. */
const glass = (color: string, percent: number, blur = 12) => `.panel,.product{background:${see(color, percent)};backdrop-filter:blur(${blur}px);-webkit-backdrop-filter:blur(${blur}px);border:1px solid ${see(color, Math.min(percent + 20, 100))};box-shadow:none}`

/** One card floating on a field of color, holding the whole page. */
const floating = (shadow: string) => `main{width:calc(100% - 36px);max-width:430px;min-height:0;margin:24px auto;background:var(--bg);border-radius:30px;overflow:hidden;box-shadow:0 18px 46px ${see(shadow, 45)}}`
/** Social icons with no button around them. */
const plainIcons = `.socials a{background:none;border:0;box-shadow:none;color:var(--accent-text)}`

export const THEME_CSS: Record<ThemeId, string> = {
	// Neon: a deep night with two soft glows, and pills that give off light.
	liquid: `${field(`radial-gradient(70% 38% at 12% 6%,${see('--accent', 30)},transparent 72%),radial-gradient(80% 42% at 92% 100%,${see('--accent2', 24)},transparent 72%),var(--bg)`)}
.avatar{width:104px;height:104px;box-shadow:0 0 0 3px var(--accent),0 0 30px ${see('--accent', 60)}}
.socials a{width:42px;height:42px;background:var(--fg);color:var(--bg)}
.socials a:nth-child(3n+2){background:var(--accent);color:var(--ink)}
.socials a:nth-child(3n){background:var(--accent2);color:var(--bg)}
.link{min-height:54px;background:${see('--accent', 8)};border:1.5px solid var(--accent);box-shadow:0 0 16px ${see('--accent', 28)}}
.items>a.link:nth-of-type(even){background:${see('--accent2', 7)};border-color:var(--accent2);box-shadow:0 0 16px ${see('--accent2', 26)}}
.items>a.link.feat{min-height:64px;background:var(--accent);border-color:var(--accent);color:var(--ink);box-shadow:0 0 30px ${see('--accent', 55)}}
${glass('--accent', 8, 0)}
.panel,.product{border-color:${see('--accent', 40)}}
.cover{border:1.5px solid ${see('--accent', 50)};box-shadow:0 0 24px ${see('--accent', 30)}}`,

	// Vista: one photograph is the whole page, with white outlined pills on it.
	editorial: `${field('linear-gradient(170deg,var(--accent2),var(--bg))')}
${coverBehind(`linear-gradient(${see('--bg', 30)},${see('--bg', 62)} 34%,${see('--bg', 86)} 72%,${see('--bg', 94)})`)}
.head{text-shadow:0 1px 14px ${see('--bg', 70)}}
.avatar{width:108px;height:108px;border:3px solid var(--fg);box-shadow:0 8px 30px ${see('--bg', 60)}}
h1{font-size:30px;font-weight:600}
.bio{color:var(--fg)}
.socials a{width:38px;height:38px;background:var(--fg);color:var(--bg)}
.link{justify-content:center;min-height:50px;background:${see('--bg', 28)};border:1.5px solid var(--fg);text-align:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.link .t{flex:0 1 auto}
.link .go{display:none}
.link.feat{min-height:58px;background:var(--accent);border-color:var(--accent);color:var(--ink);backdrop-filter:none;-webkit-backdrop-filter:none}
.sep{text-align:center;color:var(--fg)}
.block-title{text-align:center}
${glass('--bg', 55)}
.hint-line{color:var(--fg)}
.badge{color:var(--fg)}`,

	// Tiles: every social account is a big bright square, on a dark blurred picture.
	brutal: `${coverBehind(see('--bg', 80), 24)}
main{--pad-t:36px}
${sideHead(72)}
h1{font-size:26px}
.bio{color:var(--fg)}
.head .socials{grid-column:1/-1;justify-self:stretch;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:20px}
.socials:has(a:nth-child(2):last-child),.socials:has(a:nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
.socials a:only-child{grid-column:1/-1}
.socials a:nth-child(5):last-child{grid-column:span 2}
.socials a{width:auto;height:auto;min-height:92px;flex-direction:column;gap:6px;border:0;border-radius:18px;background:var(--c1);color:var(--on-c1);box-shadow:none;font-size:13px;font-weight:700}
.socials a svg{width:32px;height:32px}
.socials a::after{content:attr(aria-label)}
.socials a:nth-child(6n+2){background:var(--c2);color:var(--on-c2)}
.socials a:nth-child(6n+3){background:var(--c3);color:var(--on-c3)}
.socials a:nth-child(6n+4){background:var(--c4);color:var(--on-c4)}
.socials a:nth-child(6n+5){background:var(--c5);color:var(--on-c5)}
.socials a:nth-child(6n){background:var(--c6);color:var(--on-c6)}
.items{margin-top:16px;gap:10px}
.link{justify-content:center;min-height:48px;background:${see('--fg', 10)};border:1px solid ${see('--fg', 20)};text-align:center}
.link .t{flex:0 1 auto}
.link .go{display:none}
.link.feat{min-height:56px;background:var(--accent);border-color:var(--accent);color:var(--ink)}
.sep{text-align:center}
${glass('--fg', 8)}
.cover~.items{margin-top:16px}`,

	// Candy: a soft field, and every link in its own bright color.
	jelly: `main{--pad-t:32px}
.avatar{width:116px;height:116px;border:4px solid var(--panel)}
h1{font-size:28px;font-weight:800}
.bio{color:var(--fg)}
.socials{gap:10px;margin-top:14px}
.socials a{width:42px;height:42px;background:var(--panel);box-shadow:0 2px 8px ${see('--fg', 12)}}
.items{margin-top:20px;gap:10px}
.link{min-height:52px;padding:8px 22px;background:var(--c5);color:var(--on-c5);box-shadow:0 2px 0 ${see('--fg', 12)}}
.link .t b{font-size:17px;font-weight:800}
.link .t small{opacity:.85}
.items>a.link:nth-of-type(5n+3){background:var(--c1);color:var(--on-c1)}
.items>a.link:nth-of-type(5n+4){background:var(--c2);color:var(--on-c2)}
.items>a.link:nth-of-type(5n+5){background:var(--c4);color:var(--on-c4)}
.items>a.link:nth-of-type(5n+6){background:var(--c3);color:var(--on-c3)}
.items>a.link.feat{min-height:60px;background:var(--accent);color:var(--ink)}
.sep,.block-title{text-align:center;font-size:18px;font-weight:800;color:var(--fg)}
.cover{border-radius:24px}`,

	// Airy: white space, a small avatar beside the name, and quiet pastel rows.
	minimal: `main{--pad-x:22px;--pad-t:48px}
${sideHead(58)}
h1{font-size:24px;font-weight:600}
.socials{gap:0;margin-top:10px;margin-inline-start:-10px}
.socials a{background:none;box-shadow:none;border:0}
.items{margin-top:22px}
.link{min-height:56px;background:none;border:1px solid var(--line)}
.link .t b{font-weight:500}
.items>a.link:nth-of-type(3n+2){background:var(--accent2);border-color:transparent}
.items>a.link:nth-of-type(3n){background:var(--accent-tint);border-color:transparent}
.items>a.link.feat{min-height:68px;background:var(--accent);border-color:transparent;color:var(--ink);box-shadow:0 8px 22px ${see('--fg', 12)}}
.sep{color:var(--muted);font-weight:500}
.panel,.product{background:none;border:1px solid var(--line);box-shadow:none}
.track{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0;padding:0;overflow:visible}
.slide{aspect-ratio:1/1.15;border:0}
.gallery.single .track{grid-template-columns:1fr}
.gallery.single .slide{aspect-ratio:7/5}
.hint-line{display:none}`,

	// Aurora: a gradient across the page, and buttons two to a row.
	aurora: `${field('linear-gradient(165deg,var(--bg),var(--accent2))')}
main{--pad-t:36px}
${sideHead(64)}
h1{font-size:26px}
.bio{color:var(--fg)}
.socials{gap:10px;margin-top:14px}
.socials a{background:${see('--fg', 22)};border:0;box-shadow:none}
.cover{margin-top:18px;border-radius:22px;aspect-ratio:16/10}
.items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:16px;gap:10px}
.items>*{grid-column:1/-1;min-width:0}
.items>a.link:not(.feat){grid-column:auto;min-height:68px;padding:10px 14px;background:${see('--accent', 92)};color:var(--ink);border-radius:18px}
.link .t b{font-weight:700}
.link .go{display:none}
.link.feat{justify-content:center;min-height:60px;background:var(--accent);color:var(--ink);border-radius:999px;text-align:center}
.link.feat .t{flex:0 1 auto}
.sep{color:var(--fg);margin-top:8px}
${glass('--fg', 16)}
.panel,.product{color:var(--fg)}
.hint-line,.note,.addr,.hours dt,.hours .off dd{color:var(--fg)}
.badge{color:var(--fg)}`,

	// Card: everything sits on one card floating on a color, a square portrait at its head.
	notebook: `html,body{background:var(--accent2)}
${floating('--accent2')}
main{padding:28px 20px 12px}
.avatar{width:128px;height:128px;border-radius:22px}
.socials{gap:4px;margin-top:10px}
${plainIcons}
.items{margin-top:16px;gap:9px}
.link{min-height:50px;background:color-mix(in srgb,var(--accent) 11%,var(--bg))}
.link.feat{min-height:58px;background:var(--accent);color:var(--ink)}
.panel,.product{background:color-mix(in srgb,var(--accent) 7%,var(--bg))}
.track{margin:0 -20px;padding:0 20px;scroll-padding:0 20px}
footer{padding-top:18px}`,

	// Frost: a blurred picture, and rows of frosted glass on it.
	boutique: `${field('linear-gradient(170deg,var(--bg),var(--accent2))')}
${coverBehind(`linear-gradient(${see('--bg', 62)},${see('--bg', 40)})`, 14)}
main{--pad-t:36px}
.avatar{width:100px;height:100px;border:3px solid ${see('--bg', 80)};box-shadow:0 8px 24px ${see('--fg', 18)}}
h1{font-size:28px}
.bio{color:var(--fg)}
.socials{gap:10px;margin-top:14px}
.socials a{width:40px;height:40px;background:${see('--bg', 70)};border:0;box-shadow:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.items{margin-top:20px;gap:10px}
.link{min-height:50px;background:${see('--bg', 52)};border:1px solid ${see('--bg', 72)};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.link.feat{justify-content:center;min-height:56px;background:var(--accent);border-color:var(--accent);color:var(--ink);border-radius:999px;text-align:center;backdrop-filter:none;-webkit-backdrop-filter:none}
.link.feat .t{flex:0 1 auto}
.sep{color:var(--fg)}
${glass('--bg', 52)}
.hint-line,.note,.addr,.hours dt,.hours .off dd{color:var(--fg)}
.badge{color:var(--fg)}`,
	// Sunset: a white card whose top is a gradient, with the avatar overlapping its edge.
	sunset: `html,body{background:var(--accent2)}
${floating('--fg')}
main{padding:0 20px 12px}
main::before{content:"";order:-2;flex:0 0 auto;align-self:stretch;height:116px;margin:0 -20px;background:linear-gradient(115deg,var(--accent-shift),var(--accent))}
main:has(.cover)::before{display:none}
.cover{order:-1;flex:0 0 auto;align-self:stretch;width:auto;height:150px;margin:0 -20px;aspect-ratio:auto;border-radius:0}
.head{position:relative;margin-top:-52px;align-items:flex-start}
.head h1,.head .bio{text-align:start}
.avatar{width:96px;height:96px;border:4px solid var(--bg);box-shadow:0 6px 18px ${see('--fg', 18)}}
h1{margin-top:10px;font-size:26px;font-weight:800}
.socials{gap:0;margin-top:6px;margin-inline-start:-10px;justify-content:flex-start}
${plainIcons}
.items{margin-top:12px;gap:9px}
.link{min-height:50px;background:color-mix(in srgb,var(--accent) 9%,var(--bg))}
.link.feat{min-height:56px;background:var(--accent);color:var(--ink);box-shadow:0 6px 16px ${see('--accent', 30)}}
.panel,.product{background:color-mix(in srgb,var(--accent) 6%,var(--bg))}
.track{margin:0 -20px;padding:0 20px;scroll-padding:0 20px}
footer{padding-top:18px}`,

	// Sky: an open gradient behind a white card, an oval portrait beside the name.
	sky: `${field('linear-gradient(170deg,color-mix(in srgb,var(--accent2) 30%,var(--bg)),var(--accent2))')}
${floating('--accent')}
main{padding:22px 18px 12px}
.head{display:grid;grid-template-columns:120px minmax(0,1fr);column-gap:16px;align-items:center}
.avatar{grid-row:span 2;align-self:center;width:120px;height:152px;margin:0;border-radius:50%}
.head h1{align-self:end;margin:0;font-size:26px;text-align:start}
.head .bio{align-self:start;margin-top:6px;text-align:start}
.head .open-pill{grid-column:1/-1;justify-self:start}
.head .socials{grid-column:1/-1;justify-self:center;margin-top:12px;gap:8px}
${plainIcons}
.items{margin-top:12px;gap:9px}
.link{min-height:50px;background:color-mix(in srgb,var(--accent) 14%,var(--bg))}
.items>a.link:nth-of-type(odd):not(.feat){background:color-mix(in srgb,var(--accent) 9%,var(--bg))}
.link .go{opacity:1}
.link.feat{min-height:56px;background:var(--accent);color:var(--ink)}
.panel,.product{background:color-mix(in srgb,var(--accent) 6%,var(--bg))}
.track{margin:0 -18px;padding:0 18px;scroll-padding:0 18px}
footer{padding-top:16px}`,

	// Pop: a loud field, a bright card and soft pills in many colors.
	pop: `html,body{background:var(--accent2)}
${floating('--fg')}
main{padding:22px 18px 12px}
.head{display:grid;grid-template-columns:84px minmax(0,1fr);column-gap:14px;align-items:center}
.avatar{grid-row:span 2;width:84px;height:84px;margin:0}
.head h1{align-self:end;margin:0;font-size:26px;text-align:start}
.head .bio{align-self:start;margin-top:4px;text-align:start}
.head .open-pill{grid-column:1/-1;justify-self:start}
.head .socials{grid-column:1/-1;justify-self:center;margin-top:16px;gap:10px}
.socials a{background:var(--bg);border:0;box-shadow:0 2px 10px ${see('--fg', 18)}}
.items{margin-top:16px;gap:9px}
.link{min-height:50px;background:color-mix(in srgb,var(--c4) 28%,var(--bg))}
.link .t b{font-weight:700}
.link .go{opacity:1}
.items>a.link:nth-of-type(3n){background:color-mix(in srgb,var(--c3) 28%,var(--bg))}
.items>a.link:nth-of-type(3n+1){background:color-mix(in srgb,var(--c2) 30%,var(--bg))}
.items>a.link.feat{min-height:58px;justify-content:center;background:var(--accent);color:var(--ink);text-align:center;box-shadow:0 6px 16px ${see('--accent', 32)}}
.link.feat .t{flex:0 1 auto}
.panel,.product{background:color-mix(in srgb,var(--c4) 12%,var(--bg))}
.frame,.cover{border-radius:18px}
.track{margin:0 -18px;padding:0 18px;scroll-padding:0 18px}
footer{padding-top:16px}`,

	// Portrait: a large black-and-white picture leads a dark page, with one bright button.
	portrait: `main{--pad-t:16px;--pad-x:16px}
.head{align-items:flex-start}
.head h1,.head .bio{text-align:start}
.avatar{width:100%;height:auto;aspect-ratio:1/.82;border-radius:min(var(--avatar-radius),26px);overflow:hidden}
.avatar:not(:has(img)){width:92px;height:92px;aspect-ratio:1}
.avatar img{filter:grayscale(1) contrast(1.05)}
main:has(.cover) .avatar{display:none}
.cover{order:-1;margin:0;aspect-ratio:1/.82;border-radius:min(var(--avatar-radius),26px)}
.cover img{filter:grayscale(1) contrast(1.05)}
h1{margin-top:16px;font-size:30px;font-weight:700}
.socials{justify-content:flex-start;gap:8px;margin-top:14px}
.socials a{background:var(--accent2);color:var(--fg);border:0;box-shadow:none}
.items{margin-top:18px;gap:9px}
.link{min-height:50px;background:var(--accent2);border:1px solid var(--line)}
.link .go{opacity:.75}
.link.feat{min-height:58px;justify-content:center;background:var(--accent);border-color:var(--accent);color:var(--ink);text-align:center}
.link.feat .t{flex:0 1 auto}
.panel,.product{background:var(--accent2);border:1px solid var(--line);box-shadow:none}`,
	// Sheet: a photograph on top, and a rounded sheet rising over it like a phone's bottom sheet.
	sheet: `main{--pad-t:0px}
.cover{order:-1;align-self:stretch;width:auto;height:min(44vh,340px);margin:0 calc(-1*var(--pad-x));aspect-ratio:auto;border-radius:0}
main:not(:has(.cover))::before{content:"";order:-1;flex:0 0 auto;align-self:stretch;height:170px;margin:0 calc(-1*var(--pad-x));background:linear-gradient(115deg,var(--accent-shift),var(--accent))}
.head{position:relative;align-self:stretch;width:auto;margin:-38px calc(-1*var(--pad-x)) 0;padding:24px var(--pad-x) 0;background:var(--bg);border-radius:38px 38px 0 0;box-shadow:0 -10px 26px ${see('--fg', 14)}}
main:has(.cover) .avatar{display:none}
.avatar{width:96px;height:96px;margin-top:-68px;border:4px solid var(--bg)}
h1{margin-top:10px;font-size:28px}
.bio{color:var(--fg)}
.socials{margin-top:8px;gap:2px}
.socials a{background:none;border:0;box-shadow:none}
.items{margin-top:14px;gap:9px}
.link{min-height:50px;background:var(--accent2)}
.link .go{opacity:.8}
.link.feat{min-height:56px;background:var(--accent);color:var(--ink)}
.panel,.product{background:var(--accent2)}`,

	// Rail: a portrait fills the screen, with a rail of round icons down its right edge.
	rail: `${field('linear-gradient(170deg,var(--accent2),var(--bg))')}
body::after{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(transparent 22%,${see('--bg', 72)} 52%,${see('--bg', 94)} 78%)}
${coverBehind('none')}
main:has(.cover) .avatar{display:none}
main:not(:has(.cover)) .avatar:has(img){position:fixed;inset:0;z-index:-1;width:auto;height:auto;margin:0;border:0;border-radius:0;box-shadow:none}
.head{align-items:flex-start;padding-top:min(44vh,360px);text-shadow:0 1px 12px ${see('--bg', 70)}}
main:not(:has(.cover)) .head:not(:has(img)){padding-top:64px}
.head h1,.head .bio{text-align:start}
h1{margin-top:0;font-size:28px;font-weight:600}
.bio{margin-top:4px;color:var(--fg)}
.socials{position:absolute;top:var(--pad-t);inset-inline-end:var(--pad-x);flex-direction:column;gap:10px;margin:0}
.socials a{background:var(--fg);color:var(--bg);border:0;box-shadow:0 4px 14px ${see('--bg', 50)}}
.items{margin-top:14px;gap:8px}
.link{min-height:48px;background:${see('--accent2', 68)};border:1px solid ${see('--fg', 14)};backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.link .go{opacity:.85}
.link.feat{min-height:54px;background:${see('--accent', 16)};border:1.5px solid var(--accent);color:var(--fg)}
${glass('--accent2', 68, 6)}
.hint-line,.note,.addr,.hours dt,.hours .off dd{color:var(--fg)}
.badge{color:var(--fg)}`,

	// Two-tone: a saturated top with a curved edge, a pale bottom holding the links.
	duo: `main{--pad-t:0px}
.head{align-self:stretch;width:auto;margin:0 calc(-1*var(--pad-x));padding:30px var(--pad-x) 46px;--fg:var(--on-accent2);--muted:var(--on-accent2);--ok:var(--on-accent2);background:var(--accent2);color:var(--fg);border-radius:0 0 50% 50%/0 0 46px 46px}
.avatar{width:116px;height:116px;border:4px solid var(--accent)}
h1{margin-top:10px;font-size:28px}
.socials a{background:${see('--fg', 18)};color:var(--fg);border:0;box-shadow:none}
.items{margin-top:18px;gap:10px}
.link{min-height:50px;background:var(--panel);box-shadow:0 3px 10px ${see('--fg', 10)}}
.link .go{opacity:.85}
.link.feat{min-height:74px;background:var(--accent);color:var(--ink);border-radius:min(var(--radius),24px)}
.panel,.product{background:var(--panel);box-shadow:0 3px 10px ${see('--fg', 8)}}`,

	// Relief: one quiet color, raised buttons and pressed icons.
	relief: `.avatar{width:112px;height:112px;box-shadow:8px 8px 18px var(--accent2),-8px -8px 18px white}
h1{margin-top:18px}
.bio{color:var(--fg)}
.socials{gap:14px;margin-top:20px}
.socials a{background:var(--bg);border:0;box-shadow:inset 3px 3px 7px var(--accent2),inset -3px -3px 7px white;color:var(--accent-text)}
.items{margin-top:26px;gap:16px}
.link{min-height:54px;background:var(--bg);border:0;box-shadow:7px 7px 16px var(--accent2),-7px -7px 16px white}
.link.feat{min-height:62px;background:var(--bg);color:var(--fg);box-shadow:7px 7px 16px var(--accent2),-7px -7px 16px white,inset 5px 0 0 var(--accent)}
.panel,.product{background:var(--bg);border:0;box-shadow:7px 7px 16px var(--accent2),-7px -7px 16px white}
.cover{box-shadow:7px 7px 16px var(--accent2),-7px -7px 16px white}`,

	// Bento: tiles of different sizes in two tints, with the cover as one of them.
	bento: `main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:row dense;gap:10px;align-items:stretch;align-content:start}
.head{grid-column:1/-1;margin-bottom:10px}
.avatar{width:104px;height:104px}
.socials{gap:2px;margin-top:8px}
.socials a{background:none;border:0;box-shadow:none}
.items{display:contents}
.items>*{grid-column:1/-1;order:3;min-width:0}
.items>a.link{grid-column:auto;min-height:62px;background:var(--accent2);border-radius:min(var(--radius),22px)}
.items>a.link:nth-of-type(3n){background:var(--accent-tint)}
.items>a.link:nth-of-type(2){grid-row:span 2;align-items:flex-end}
.items>a.link.feat{grid-column:1/-1;order:1;min-height:94px;background:var(--accent);color:var(--ink)}
.link .t b{font-size:16px;font-weight:700}
.cover{order:2;grid-column:2;margin:0;height:100%;min-height:124px;aspect-ratio:auto;border-radius:min(var(--radius),22px)}
footer{grid-column:1/-1;order:9}
.panel,.product{background:var(--panel);box-shadow:none}`,

	// Dots: no buttons at all, just a big round colored icon on each row.
	dots: `.head{align-items:flex-start}
.head h1,.head .bio{text-align:start}
.avatar{width:100px;height:100px}
h1{font-size:26px}
.socials{justify-content:flex-start;gap:2px;margin:8px 0 0;margin-inline-start:-10px}
.socials a{background:none;border:0;box-shadow:none}
.items{margin-top:20px;gap:8px}
.link{position:relative;--dot:color-mix(in srgb,var(--c4) 62%,var(--fg));min-height:64px;padding-block:6px;padding-inline:68px 0;background:none;border:0;box-shadow:none}
.link::before{content:"";position:absolute;inset-inline-start:0;top:50%;width:54px;height:54px;margin-top:-27px;border-radius:50%;background:var(--dot)}
.link>svg:first-child{position:absolute;inset-inline-start:15px;top:50%;width:24px;height:24px;margin-top:-12px;color:var(--bg)}
.link .t b{font-size:17px;font-weight:600}
.link .go{opacity:1}
.items>a.link:nth-of-type(4n+3){--dot:color-mix(in srgb,var(--c2) 62%,var(--fg))}
.items>a.link:nth-of-type(4n){--dot:color-mix(in srgb,var(--c1) 62%,var(--fg))}
.items>a.link:nth-of-type(4n+1){--dot:color-mix(in srgb,var(--c6) 62%,var(--fg))}
.link.feat{--dot:var(--accent);min-height:78px;padding-inline-start:84px;background:none;color:var(--fg)}
.link.feat::before{width:68px;height:68px;margin-top:-34px}
.link.feat>svg:first-child{inset-inline-start:21px;width:26px;height:26px;margin-top:-13px}
.link.feat .t b{font-size:18px}`,

	// Pastel: a soft mesh of color behind white translucent pills.
	pastel: `${field(`radial-gradient(62% 42% at 8% 4%,color-mix(in srgb,var(--c3) 36%,var(--bg)),transparent 72%),radial-gradient(66% 50% at 96% 30%,color-mix(in srgb,var(--c4) 40%,var(--bg)),transparent 72%),radial-gradient(76% 44% at 10% 100%,color-mix(in srgb,var(--c2) 34%,var(--bg)),transparent 72%),var(--bg)`)}
.avatar{width:116px;height:116px;border:4px solid ${see('--bg', 88)}}
h1{font-size:30px;font-weight:800;letter-spacing:-.02em}
.bio{color:var(--fg)}
.socials{gap:2px;margin-top:8px}
.socials a{background:none;border:0;box-shadow:none}
.items{gap:11px}
.link{justify-content:center;min-height:52px;background:${see('--bg', 62)};border:1px solid ${see('--bg', 90)};text-align:center;box-shadow:0 8px 20px ${see('--accent', 22)};backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.link .t{flex:0 1 auto}
.link .go{display:none}
.link.feat{min-height:68px;background:var(--bg);color:var(--fg)}
.link.feat .go{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--accent);color:var(--ink);opacity:1}
.sep{text-align:center}
${glass('--bg', 62, 8)}
.hint-line,.note,.addr{color:var(--fg)}`,

	// Letter: warm paper, a serif name and rows divided by hairlines.
	letter: `main{--pad-t:48px;--pad-x:24px}
.avatar{width:100px;height:100px}
h1{margin-top:18px;font-size:32px;font-weight:500;letter-spacing:-.01em}
.bio{color:var(--fg)}
.socials{gap:6px;margin-top:12px}
.socials a{background:none;border:0;box-shadow:none}
.items{margin-top:24px;gap:0}
.link{min-height:54px;padding:10px 8px;background:none;border-bottom:1px solid var(--accent2);border-radius:0}
.link .t b{font-weight:500}
.link.feat{min-height:62px;margin-bottom:10px;padding:12px 20px;background:var(--accent);border:0;border-radius:min(var(--radius),20px);color:var(--ink)}
.sep{margin:24px 0 6px;font-weight:500}
.block-title{margin-top:20px}
.panel,.product{margin-top:12px;background:none;border:1px solid var(--accent2);box-shadow:none}`,

	// Obsidian: near-black with blurred color behind glass panels and thin bright edges.
	obsidian: `${field(`radial-gradient(70% 55% at 0% 14%,${see('--accent', 42)},transparent 72%),radial-gradient(70% 60% at 100% 34%,${see('--accent2', 58)},transparent 72%),var(--bg)`)}
.avatar{width:100px;height:100px;border:2px solid ${see('--fg', 45)}}
.bio{color:var(--fg)}
.socials{gap:2px;margin-top:8px}
.socials a{background:none;border:0;box-shadow:none}
.cover,.frame{border:1px solid ${see('--fg', 40)};border-radius:min(var(--radius),24px);box-shadow:none}
.link{min-height:50px;background:${see('--fg', 7)};border:1px solid ${see('--fg', 38)};border-radius:min(var(--radius),12px);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.link .go{opacity:.85}
.link.feat{min-height:56px;background:${see('--accent', 24)};border-color:var(--accent);color:var(--fg)}
${glass('--fg', 7, 10)}`,

	// Moon: a huge circular picture cropped by the top of the screen, on a bright field.
	moon: `main{--pad-t:0px;overflow-x:clip}
.avatar:has(img){flex:none;width:min(118vw,480px);height:auto;aspect-ratio:1;margin-top:calc(-1*min(34vw,140px));border:0}
.avatar:not(:has(img)){width:116px;height:116px;margin-top:36px}
main:has(.cover) .avatar{display:none}
.cover{order:-1;flex:none;width:min(118vw,480px);max-width:none;aspect-ratio:1;margin:calc(-1*min(34vw,140px)) 0 0;border-radius:50%}
h1{margin-top:22px;font-weight:800}
.bio{color:var(--fg)}
.socials{gap:2px;margin-top:8px}
.socials a{background:none;border:0;box-shadow:none}
.items{margin-top:16px;gap:9px}
.link{justify-content:center;min-height:48px;background:var(--accent2);text-align:center;box-shadow:0 3px 10px ${see('--fg', 14)}}
.link .t{flex:0 1 auto}
.link .t b{font-weight:700}
.link .go{display:none}
.link.feat{min-height:56px;background:var(--accent);color:var(--ink)}
.sep{text-align:center;color:var(--fg)}
.panel,.product{background:var(--accent2)}`,

	// Chips: one big button, then the links as a cloud of pills.
	chips: `${field('linear-gradient(165deg,color-mix(in srgb,var(--c3) 30%,var(--bg)),var(--bg) 52%,var(--accent2))')}
.avatar{width:124px;height:124px;border:4px solid ${see('--panel', 90)}}
.bio{color:var(--fg)}
.socials{gap:2px;margin-top:8px}
.socials a{background:none;border:0;box-shadow:none}
.items{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:10px}
.items>*{flex:0 0 100%;min-width:0}
.items>a.link{flex:0 1 auto;min-height:46px;padding:8px 18px;background:${see('--panel', 80)};box-shadow:0 4px 12px ${see('--fg', 10)}}
.link .go,.link .t small{display:none}
.items>a.link.feat{flex:0 0 auto;min-width:72%;justify-content:center;min-height:56px;background:var(--accent);color:var(--ink);text-align:center;box-shadow:0 8px 18px ${see('--accent', 32)}}
.link.feat .t{flex:0 1 auto}
.sep{text-align:center;margin-top:10px}
.block-title{text-align:center}
.panel,.product{background:${see('--panel', 80)};box-shadow:none}`,

	// Tracks: the links as a numbered list in a card, like a playlist.
	tracks: `.avatar{width:100px;height:100px}
.socials{gap:2px;margin-top:8px}
.socials a{background:none;border:0;box-shadow:none}
.cover{aspect-ratio:16/10;border-radius:min(var(--radius),24px) min(var(--radius),24px) 0 0}
.items{counter-reset:track;margin-top:18px;padding:10px;gap:0;background:var(--accent2);border-radius:min(var(--radius),24px);box-shadow:0 12px 30px ${see('--fg', 12)}}
.cover+.items{margin-top:0;border-radius:0 0 min(var(--radius),24px) min(var(--radius),24px)}
.link{counter-increment:track;min-height:50px;padding:8px 12px;background:none;border-bottom:1px solid var(--line);border-radius:0}
.link::before{content:counter(track,decimal-leading-zero);flex:0 0 auto;font-size:14px;font-variant-numeric:tabular-nums;color:var(--muted)}
.link>svg:first-child{display:none}
.link .go{opacity:.85}
.link.feat{min-height:52px;margin-bottom:4px;background:var(--accent);border:0;border-radius:999px;color:var(--ink)}
.link.feat::before{color:inherit}
.sep{margin:14px 12px 4px}
.block-title{margin:14px 12px 0}
.panel,.product{background:var(--panel);box-shadow:none}
.panel,.gallery,.products,.frame{margin-top:8px}`,
}
