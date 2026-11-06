import { CSS_AT_RULES, CSS_LIMIT } from '../../shared/css'
import { BUTTON_IDS, defaultAppearance, FONT_IDS, ITEM_KINDS, LOCALES, newItem, SOCIAL_PLACES, SOCIAL_PLATFORMS, THEME_IDS } from '../../shared/content'
import { EMBED_PROVIDERS, EMBEDS } from '../../shared/embeds'
import { ENGLISH } from '../../shared/serverWords'
import { RESERVED_SLUGS } from '../../shared/slug'
import { ownLinkLook } from '../../templates/compositions'
import { AVATAR_RADIUS, COLORFUL, ICON_RADIUS, PALETTE, RADIUS, resolveAppearance, THEMES, type ButtonKey } from '../../templates/themes'
import type { GuideNames } from './agent'
import { KV_OPS_AT_ONCE, VERSIONS_KEPT } from './mode'
import { OPERATIONS } from './openapi'

// The parts of the guide an agent reads only when it needs them, served at
// /api/guide/<topic>. The main guide (/llms.txt, agent.ts) is loaded in every
// conversation, as an Agent Skill's SKILL.md is, so it holds only what every
// conversation needs; detail about one feature lives here, and the main guide's
// index says when to read each topic (`when`). A name in (see "...") is either
// in the main guide or in a topic's `covers`, which tests/agent.test.ts checks.

export const GUIDE_TOPICS = [
	{ id: 'first-conversation', title: 'The first conversation', covers: ['The first conversation'], when: 'The owner has just deployed FluxBio or connected you, or asks what you can do' },
	{ id: 'trying-it', title: 'Trying it out', covers: ['Trying it out'], when: 'The owner is new to this or only trying FluxBio, or asks about free quota, coming back later, going public or a domain' },
	{ id: 'content', title: 'Page content', covers: ['Page content'], when: 'Before you add or change anything on a page: every kind of item and its fields, slugs, social icons, the LINE button, embeds for tips or bookings, and a block FluxBio lacks' },
	{ id: 'stats', title: 'Stats and sources', covers: ['Report on stats', 'Sources and UTM tags'], when: 'Before you report on views, clicks or visitors, or tag where visitors come from' },
	{ id: 'look', title: 'Themes and fonts', covers: ['Themes', 'Buttons', 'Make a theme', 'Fonts'], when: 'Before you change a theme, colors, pictures, fonts or `hostFonts`: it says what fonts cost' },
	{
		id: 'customize',
		title: 'Customize the look',
		covers: ['Customize the look', 'Page markup', "The owner's pictures and links"],
		when: "A look the theme fields can't give, or one that matches a picture the owner sends",
	},
	{ id: 'translate', title: 'Translate a page', covers: ['Translate a page'], when: 'Languages are added, or you change text on a page while `settings.languages` isn\'t empty: translate without being asked' },
	{ id: 'links', title: 'Many short links and QR codes', covers: ['Many short links at once', 'Get a QR code', 'QR code pictures'], when: 'Making many short links at once, a QR code as a file, or the picture in QR codes' },
	{ id: 'share-image', title: 'Share image', covers: ['Share image'], when: 'A page is about to go public, or the owner asks about the picture shown when its link is shared' },
	{ id: 'custom-page', title: 'Custom page', covers: ['Custom page'], when: 'The owner doesn\'t want a page of links: their own HTML, or sending an address on to another site' },
	{ id: 'quota', title: 'How much free quota is left', covers: ['How much free quota is left'], when: 'Before anything that writes a lot, when `GET /api/usage` is past 70%, or the owner asks about quota or old stats' },
	{ id: 'test-site', title: 'Test site', covers: ['Test site'], when: 'Trying a change before it goes live: on the owner\'s computer, or on a second site' },
	{ id: 'move', title: 'Restore, or move to another FluxBio', covers: ['Restore, or move to another FluxBio'], when: 'Restoring a backup, or moving to another deployment' },
	{ id: 'domain', title: 'Use a custom domain', covers: ['Use a custom domain', 'More sites'], when: 'Setting up or changing a custom domain, or adding a second site' },
	{ id: 'short-links-only', title: 'Short links only', covers: ['Short links only'], when: 'Switching pages off or on, or a site with no pages' },
	{ id: 'password', title: 'Changing the admin password', covers: ['Changing the admin password'], when: 'The owner wants a new dashboard password, has lost it, or it leaked' },
	{ id: 'faq', title: "Answering the owner's questions", covers: ["Answering the owner's questions"], when: 'The owner asks about cost, where the data is, passwords and tokens, what happens if you make a mistake, or visitor tracking' },
	{ id: 'update', title: 'Update FluxBio', covers: ['Update FluxBio'], when: 'The owner asks for the latest version, or a problem they reported has been fixed' },
	{ id: 'remove', title: 'Remove FluxBio', covers: ['Remove FluxBio'], when: 'The owner doesn\'t want FluxBio any more, or asks how to delete it all' },
	{ id: 'endpoints', title: 'Endpoints', covers: ['Endpoints'], when: 'You need a route the main guide doesn\'t name, or which token may call it' },
] as const

export type GuideTopicId = (typeof GUIDE_TOPICS)[number]['id']

/** One example of every item kind, with readable ids. */
function itemExamples(): string {
	return ITEM_KINDS.map((kind) => {
		let n = 0
		// A new item's title is a dashboard key.
		const json = JSON.stringify(newItem(kind), (key, value) => (key === 'id' ? `${kind}-${++n}` : key === 'title' ? (ENGLISH[value] ?? value) : value))
		return `- \`${kind}\`: \`${json}\``
	}).join('\n')
}

function endpointTable(): string {
	const rows = OPERATIONS.map((op) => {
		const who = op.open ? 'none' : op.owner ? 'owner only' : op.linksToken ? 'links, full' : 'full'
		return `| ${op.method.toUpperCase()} | \`${op.path}\` | ${op.summary} | ${who} |`
	})
	return ['| Method | Path | What | Token |', '| --- | --- | --- | --- |', ...rows].join('\n')
}

const list = (values: readonly string[]) => values.map((value) => `\`${value}\``).join(', ')

/** "a, b and c". */
const and = (values: readonly string[]) => (values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`)

/** Where an AI can see every theme before picking one: the landing page draws each with a sample page. */
const THEME_PICTURES = 'https://fluxbio.link'

/** Which themes color their buttons by position from a fixed palette, which `accent` and `accent2` don't reach. Read from the themes. */
function paletteGuide(): string {
	const names = COLORFUL.map((id) => `${THEMES[id].en} (\`${id}\`)`)
	const vars = PALETTE.map((_, index) => `\`--c${index + 1}\``)
	return `**Colors by position.** ${and(names)} paint their link buttons and social icons in turn from a palette of their own, ${vars[0]} to ${vars.at(-1)}, each with \`--on-c1\`… for the text on it. \`accent\` and \`accent2\` don't change those colors; most of these themes use \`accent\` for a featured link. To give the buttons the owner's colors on these themes, set the variables in \`appearance.css\`, e.g. \`:root{--c1:#fedb8a;--on-c1:#000000}\` (text at 4.5:1 at least), or pick a theme that colors buttons from \`accent\`.`
}

/**
 * What each `button` value does, and what a theme draws on its link buttons itself, which `button` then leaves alone.
 * Read from the themes and their compositions, so it can't fall behind them.
 */
function buttonGuide(): string {
	const round = (radius: string) => (radius === '999px' ? 'round' : radius === '0px' ? 'square' : radius)
	const shapes = (key: ButtonKey) => `${RADIUS[key] === '999px' ? 'round ends' : `${RADIUS[key]} corners`}, ${round(ICON_RADIUS[key])} icons, ${round(AVATAR_RADIUS[key])} avatar`
	const hard = resolveAppearance({ ...defaultAppearance(), button: 'shadow' }).vars
	const pill = THEME_IDS.filter((id) => THEMES[id].button === 'pill').map((id) => THEMES[id].en)
	const own = THEME_IDS.flatMap((id) => {
		const look = ownLinkLook(id)
		if (look.bare) return []
		const parts = [look.border && 'border', look.corners === true && 'corners', typeof look.corners === 'number' && `corners up to ${look.corners}px`, look.shadow && 'shadow'].filter(Boolean)
		return parts.length ? [`${THEMES[id].en} (${parts.join(', ')})`] : []
	})
	const bare = THEME_IDS.filter((id) => ownLinkLook(id).bare).map((id) => THEMES[id].en)
	const all = THEME_IDS.filter((id) => {
		const look = ownLinkLook(id)
		return !look.border && !look.corners && !look.shadow
	}).map((id) => THEMES[id].en)
	// An example of what that means, from a theme that keeps its own shadow but takes the border.
	const example = THEME_IDS.find((id) => {
		const look = ownLinkLook(id)
		return look.shadow && !look.border && !look.bare
	})
	const so = example ? ` So on ${THEMES[example].en} only \`shadow\` gives link buttons a border, over the theme's own shadow rather than the offset one.` : ''
	return `**Buttons.** \`button\` sets the shape of link buttons, panels, social icons and the avatar, through the variables in "Page markup" (\`--radius\`, \`--icon-radius\`, \`--avatar-radius\`, and for \`shadow\` the borders and shadows):
- \`auto\`: the theme's own, which is \`pill\` on ${and(pill)}, and \`rounded\` on the others.
${(['pill', 'rounded', 'square'] as const).map((key) => `- \`${key}\`: ${shapes(key)}. No border.`).join('\n')}
- \`shadow\`: ${shapes('shadow')}, and a ${hard['--card-border']!.split(' ')[0]} border in the text color with a hard ${hard['--card-shadow']!.split(' ')[0]} offset shadow on buttons, panels, icons and the avatar. The only value that draws a border.

Some themes draw part of their link buttons themselves, and that part stays the theme's whatever \`button\` is: ${and(own)}. ${and(bare)} ${bare.length > 1 ? 'have' : 'has'} no buttons at all, so \`button\` changes only ${bare.length > 1 ? 'their' : 'its'} panels, icons and avatar. ${and(all)} take all of it.${so} Featured links, panels and social icons follow the variables too unless the theme draws them itself, and in many themes the social icons are plain symbols with nothing around them. To be sure, read the theme's rules in the \`<style>\` of \`GET /api/pages/{id}/preview\`; for more than this, see "Customize the look".`
}

function bodies({ origin, host, worker, liveWorker, tokenVar, skill, otherSites }: GuideNames): Record<GuideTopicId, string> {
	return {
		customize: `**Customize the look.** Go up this ladder one step at a time, and only as far as the owner's request needs:
1. A built-in theme in one of its color sets, which the owner picks on Appearance.
2. The theme's fields, through the API: colors, fonts, the button shape, a cover picture, a picture behind the page, whole or repeated as a pattern with \`bgTile\` (see "Make a theme").
3. \`appearance.css\`: CSS of your own on top of the theme whose layout is closest, for what the fields can't do: the shape, border and shadow of buttons, spacing, a pattern on the buttons or the header, how the header is laid out. The page stays a page of links with everything that comes with one: the owner edits it in the dashboard, its blocks work, taps are counted, and translations and preview links work.
4. A page of their own HTML (see "Custom page"), only when it shouldn't be a page of links at all. Say first what it gives up: the dashboard's editor, blocks, translations, themes, and counted taps other than through short links.

**\`appearance.css\`.** A string of up to ${CSS_LIMIT.toLocaleString('en')} characters in the draft's \`appearance\`: \`PUT\` the draft and publish as usual. It goes in a \`<style>\` of its own after the theme's, on the public page, in preview links and in the dashboard's preview. System pages (not found, an expired link) don't get it. Saving refuses CSS that could break out of the page or load something, with a 400 whose \`problems[]\` has \`path: "appearance.css"\` and a message that names the line and the reason:
- \`<\` anywhere. Inside a string, write \`\\3c \` instead, as in an \`@property\` syntax: \`syntax: "\\3c color>"\`.
- Anything that loads from an address, apart from this site's pictures written out plainly as \`url(/media/<id>)\` or \`url("/media/<id>")\`. So no other \`url()\`, no \`@import\` or \`@font-face\`, no \`image()\`, \`image-set()\`, \`src()\`, \`cross-fade()\`, \`element()\` or \`paint()\`, and no strings that look like addresses (\`"https://…"\`, \`"//…"\`, \`"data:…"\`) except as the value of an attribute selector, which matches and loads nothing: \`a[href^="https://x.com"]\` is fine.
- At-rules other than ${CSS_AT_RULES.map((rule) => `\`@${rule}\``).join(', ')}.
- \`expression()\`, \`behavior\` and \`-moz-binding\`, and strings, comments or brackets left open.

Escapes are fine (\`content: "\\2192"\`). The browser holds the same line: a page loads pictures only from this site, plus YouTube's thumbnails on a page with a YouTube video. A font comes through \`headFont\` and \`bodyFont\` (see "Fonts"); your CSS can then name it, or use \`var(--head-font)\` and \`var(--body-font)\`. The CSS costs nothing per view, since it comes with the page's one KV read, and each picture it uses costs what any picture does (see "How much free quota is left").

**Page markup.** These class names and this structure are what FluxBio keeps stable for your CSS. Write against them, not against other elements or attributes, which may change. Live pages and previews have the same markup:

\`\`\`html
<html lang="…" dir="rtl">                 dir only for a right-to-left language
<body class="has-line has-embed">         has-line with the LINE button, has-embed with the floating embed button
<p class="draft-note">                    only on a draft preview link
<div class="page-bg"><img></div>          appearance.bgImage; its ::after is the dimming layer, opacity var(--dim)
<div class="page-bg tile">                 instead, with bgTile: the picture is its background-image, repeated
<main>
  <header class="head">
    <div class="avatar"><img> or the initials</div>
    <h1>name</h1>                         <h1 class="visually-hidden"> with appearance.showName false: out of sight, still read
    <p class="bio">
    <p class="open-pill"><i></i><b>Open now</b><span>until 18:00</span></p>    with opening hours; "open-pill closed" when closed
    <nav class="socials"><a aria-label="Instagram"><svg></a>…</nav>    here with appearance.socialPlace "top", the default
  </header>
  <figure class="cover"><img></figure>    appearance.coverImage
  <div class="items">                     one element per item, in the draft's order
  <nav class="socials">                   here instead with socialPlace "bottom": .socials is either, main > .socials only this one
  <footer><a class="badge">               showBadge
</main>
<a class="line-button"><svg></a>          lineButton
<a class="embed-button"><svg><span>words</span></a>    embedButton
<dialog class="sheet">                    one per service on a live page with an embed: the panel a tap opens
  <div class="sheet-bar"><b>name</b><form><button class="sheet-close"></button></form></div>
  <iframe>                                the service's own panel, which page CSS doesn't reach
</dialog>
\`\`\`

Each item, inside \`.items\`:
- \`link\`: \`<a class="link"><svg>?<span class="t"><b>title</b><small>subtitle</small></span><span class="go"><svg></span></a>\`. The first \`<svg>\` is its icon, when it has one. \`featured\` adds \`feat\`. In the dashboard's preview, a link with no address yet is \`<div class="link todo">\`.
- \`heading\`: \`<h2 class="sep">\`.
- \`video\`: \`<section class="video"><div class="frame"><iframe></div><p class="cap">title</p></section>\`. What is inside the frame is a document of its own, which page CSS doesn't reach.
- \`gallery\`: \`<section class="gallery">\` (\`gallery single\` with one image): \`<h2 class="block-title">\`, a \`<div class="track">\` of \`<a class="slide"><img></a>\` (\`<span class="slide">\` without a link), and \`<p class="hint-line">\`.
- \`product\`: \`<section class="products">\`: \`<h2 class="block-title">\`, a \`<div class="grid">\` (\`grid one\` with one card) of \`<a class="product"><span class="ph"><img></span><span class="info"><b>name</b><span class="price"></span></span></a>\` (\`<div class="product">\` without a link), then \`<a class="more">\`.
- \`embed\`: \`<section class="panel embed"><div class="embed-head"><span class="embed-icon"><svg></span><div class="embed-text"><h2>title</h2><p class="note">note</p></div></div><a class="act main">button</a></section>\`. In the dashboard's preview, one with no account yet has \`<span class="act main todo">\`. The sheet takes the service's own colors (\`--paper\`), since its panel keeps them whatever the theme.
- \`hours\`: \`<section class="panel hours">\`: \`<h2>\`, a \`<dl>\` of \`<div><dt>days</dt><dd>hours</dd></div>\` (today's has \`today\`, closed days \`off\`), \`<p class="note">\`, \`<div class="map"><iframe></div>\`, \`<p class="addr">\`, and a \`<div class="acts">\` (\`acts one\` with one button) of \`<a class="act main">\` (directions) and \`<a class="act">\` (call).

The theme's colors and shapes are variables on \`:root\`. Use them rather than fixed values, so a color set or the colors you set still apply: \`--bg\`, \`--fg\`, \`--muted\`, \`--accent\`, \`--ink\` (text on \`--accent\`), \`--accent2\`, \`--on-accent2\`, \`--accent-text\` (the accent where it is text), \`--accent-shift\`, \`--card-bg\`, \`--card-border\`, \`--card-shadow\`, \`--feat-border\`, \`--feat-shadow\`, \`--panel\`, \`--field\`, \`--field-border\`, \`--line\`, \`--ph\` (behind a picture still loading), \`--radius\`, \`--icon-radius\`, \`--avatar-radius\`, \`--avatar-border\`, \`--avatar-shadow\`, \`--body-font\`, \`--head-font\`, \`--ok\` and \`--error\`. Some themes add \`--accent-tint\`, or \`--c1\` to \`--c6\` with \`--on-c1\` to \`--on-c6\`. \`main\` has \`--pad-x\` and \`--pad-t\`.

Writing it:
- Your CSS comes after the theme's, so a selector as specific as the theme's wins. Read the theme's rules in the \`<style>\` of \`GET /api/pages/{id}/preview\` before you override them, and use \`!important\` only where you must.
- Use logical properties (\`margin-inline-start\`, \`padding-inline\`, \`inset-inline-end\`, \`border-inline-start\`, \`text-align: start\`), never \`left\` or \`right\`: pages in Arabic run right to left, and \`[dir=rtl]\` selects them. An arrow you draw with \`content:\` doesn't turn round by itself, so give it a \`[dir=rtl]\` rule too.
- Items have no ids. To pick out one, use its position (\`.items > :nth-child(3)\`) or its address (\`a.link[href*="shop.example"]\`, \`.socials a[href^="https://x.com"]\`; a link that goes through its short link has \`href="/<slug>…"\`), and remember that it moves when the page changes.
- Put the social icons after the links with \`socialPlace: "bottom"\`, and hide the name with \`showName: false\` (see "Themes"), not with CSS: moving things with \`display: contents\` and \`order\` leaves a keyboard and a screen reader going through them in another order than the screen shows.
- The floating buttons (\`.line-button\`, \`.embed-button\`) sit over the bottom corner of the screen, and \`body.has-line main\` and \`body.has-embed main\` keep room at the end of the page (\`padding-bottom\`, home indicator included) so the last thing on it scrolls clear of them, whichever corner they are in. Moving one to the other corner needs nothing more; if you make one taller or raise it, make that room as much bigger. Set \`--pad-x\` and \`--pad-t\` on \`main\`, never a \`padding\` that takes the room away.
- Keep buttons at least 44 px tall and focus outlines visible, and put motion inside \`@media (prefers-reduced-motion: no-preference)\`.
- Leave what the owner decides to the content: don't hide a link, the badge or the social icons with \`display: none\`, change the draft. Text in \`content:\` isn't translated, so keep words out of it and use it for symbols and decoration.

**Match a reference picture.** When the owner sends a picture and says "make it look like this":
1. Read the picture: the layout (centered or to one side, a card or the whole screen), the header, the buttons (shape, fill, border, shadow), colors, type, the background (flat, a gradient, a pattern, a photo) and the spacing.
2. Pick the base theme whose layout is closest (see "Themes"), from the pictures of all 24 at ${THEME_PICTURES}/en/#themes, not by switching the draft through them. They load as the page scrolls to them, so a screenshot taken by a script shows blank cards: scroll that section into view and wait, or open one theme's sample page at ${THEME_PICTURES}/preview/en/<theme id>. Then get as near as the fields allow: \`accent\`, \`accent2\`, \`bg\` and \`fg\` from the picture, \`headFont\` and \`bodyFont\` (see "Fonts"), \`button\`, \`coverImage\`, \`bgImage\`, \`bgDim\` and \`bgTile\` (see "Make a theme").
3. Write \`appearance.css\` for the rest, against "Page markup", a few rules at a time. Upload any picture it needs first (see "The owner's pictures and links"). A pattern is often a gradient (\`repeating-linear-gradient\`, \`radial-gradient\`), which needs no picture at all.
4. \`PUT\` the draft, make a preview link (see "Show the owner a draft"), and take screenshots at phone width (\`"viewport":{"width":390,"height":844}\`) and on a wide screen (1280 × 800), with \`"screenshotOptions":{"fullPage":true}\`, by the command in "Share image" or with a browser on this computer such as Playwright. For right to left, add \`?lang=ar\` if Arabic is turned on; otherwise add \`html{direction:rtl}\` with \`addStyleTag\` (in your own browser, set \`dir="rtl"\` on \`<html>\`), which shows whether the layout turns round. Two things in these screenshots aren't the page:
   - A preview link has a bar at the top, \`.draft-note\`, that pushes everything down by its height. Hide it before you compare positions, with \`.draft-note{display:none}\` in \`addStyleTag\`.
   - A full-page screenshot draws what is fixed to the screen once, over the first screen: the background (\`.page-bg\`, and the field some themes draw behind the page) and the floating buttons. Below the first screen the background looks missing, and a floating button can sit over the middle of the page. On a phone they stay put as the page scrolls, so judge them on screen-sized shots, one at the top and one scrolled to the end.
5. Put the screenshot beside the reference, list what differs, fix the biggest difference first, and repeat. Three or four rounds are usually enough; each screenshot uses a few seconds of the 10 minutes of browser time a day.
6. Check before you show the owner: text reads at 4.5:1 against what is behind it, a background picture included; nothing overflows at 320 px; long titles wrap; right to left looks right.
7. Send the owner the preview link, and say where it differs from the picture on purpose (what the page has that the picture doesn't). Publish on their yes, and save the look with \`POST /api/themes\`, which keeps its \`css\`, so you can put it back later.

**The owner's pictures and links**, to use in CSS or in a page of their own HTML:
- Their pictures: \`GET /api/media\` lists every upload with its \`id\`, \`url\`, \`type\`, \`size\` and \`uploadedAt\`, 1,000 at a time (\`nextCursor\` for more). Each call is one KV list, and the free plan allows 1,000 a day for the whole Cloudflare account, so list once and keep the answer. Use one as \`url(/media/<id>)\` in CSS, or \`<img src="/media/<id>">\` in HTML. Look at a picture at \`/media/<id>\`, or ask the owner, rather than guess what it is from its id.
- New pictures: \`POST /api/media\`, a PNG, JPEG, WebP, GIF or AVIF of 2 MB at most. SVG can't be uploaded, so draw a pattern as PNG or WebP at twice the size it shows. Behind the whole page, set \`bgImage\` to it and \`bgTile\` to the width it shows (a 96 px picture with \`bgTile: 48\`), which needs no CSS; anywhere else, halve it with \`background-size\` in CSS.
- Their links, in a page of their own HTML: link to \`/<slug>\`, never straight to the address, so clicks count, and the owner can change where a button goes on Short links without touching the HTML. \`GET /api/links\` lists the short links (\`slug\`, \`url\`, \`title\`) and \`POST /api/links\` makes new ones. When you turn an existing page of links into HTML, use its links' slugs: they keep working while \`custom\` is set.

**What custom CSS can't do, and what to tell the owner.** It can't load anything from elsewhere (fonts, pictures, stylesheets) or run scripts, and it doesn't change what the page says: links, their order, translations and counting stay the owner's, in the dashboard. Tell the owner once, in plain words, that changes to this look go through you; that picking a color set or another theme on Appearance takes it away, after the dashboard asks; and that a published version or a saved look brings it back.`,
		content: `**Page content.** A page's \`draft\` is a \`PageContent\` (the full schema is in the OpenAPI document under \`components.schemas.PageContent\`):
- \`profile\`: \`name\`, \`bio\`, \`avatar\` (a media id, or null). \`appearance.showName: false\` keeps the name out of sight (see "Themes").
- \`appearance\`: the theme and the rest of the look (see "Themes").
- \`socials\`: up to 12 of ${SOCIAL_PLATFORMS.join(', ')}, each \`{ id, platform, url }\`, shown while \`appearance.showSocial\` is on: under the bio, or after the items with \`appearance.socialPlace: "bottom"\`. \`countSocials: true\` also counts taps on them, at one Worker request and one KV read per tap; email icons never count.
- \`items\`: the page from top to bottom, below. Each has a unique \`id\` of 4–32 characters from \`A-Za-z0-9_-\`. Make new ones up (e.g. 8 random letters) and keep existing ones, because stats are counted per id.
- \`seo\`: the share preview's \`title\`, \`description\` and picture (see "Share image"). \`showBadge\`: "Made with ♥️ and FluxBio" in the footer.
- \`lineButton\`, \`embedButton\`: buttons floating at the bottom right, the embed one above LINE's. LINE takes an address like \`https://lin.ee/…\` or an official account's \`@id\`. \`embedButton\` is \`{ provider, account }\`, as on an \`embed\` item (below).
- \`translations\`: see "Translate a page". \`custom\`: the owner's own HTML, or a redirect, instead of links (see "Custom page").

Items, as they start out:
${itemExamples()}

What each kind takes:
- \`link\`: its \`slug\` is its short URL. Leave it "" and publishing fills it in. Slugs and page handles share one namespace (the first path segment), are case-insensitive, and may use any letters (Chinese too), digits, \`-\` and \`_\`. Reserved: ${list([...RESERVED_SLUGS].filter((s) => !s.includes('.')))}. Every link gets a short link, for sharing elsewhere too.
  - Its button shows the real address, and a small script reports the tap, so a blocker can hide some of those clicks. \`hideUrl: true\` sends the button through the short link instead, which suits affiliate links, and every click counts. A link with a password, UTM tags, device addresses, \`lineExternal\` or \`inAppPrompt\` always does, because those only happen there.
  - Those belong to its short link, not the draft: \`PATCH /api/links/{id}\` sets its password, UTM tags, smart routing and QR style, and its slug at once (warn first: see "When to warn the owner"), but refuses its url, title and schedule, which change only through the draft and publish. \`PUT /api/pages/{id}/links/{itemId}/short\` also makes the short link of a link not yet published.
  - Outside its \`startsAt\`–\`endsAt\` window it is hidden from the page, and its short URL says "not open yet" or "expired".
- \`video\`: a YouTube or Vimeo URL. \`gallery\`: up to 10 images. \`product\`: up to 8 cards. \`hours\`: the week, Monday first.
- \`embed\`: a card that opens another service's panel over the page, with \`provider\`, \`account\`, \`title\` and \`note\`. \`provider\`: ${EMBED_PROVIDERS.map((id) => `\`${id}\` (${EMBEDS[id].about})`).join(', ')}. \`account\` also takes the address or the service's embed code. A tap on it or on \`embedButton\` opens the panel; nothing loads from the service before.

A block FluxBio doesn't have: first check whether a link, a kind above, a custom page (see "Custom page") or a look you make does it. If none does, offer to open a block request at https://github.com/0t2/flux-bio/issues/new?template=block-request.yml, rather than a workaround that loads another site before a tap.`,
		stats: `**Report on stats.** \`GET /api/stats?page=<id>&days=30\` (7, 30 or 90) has a page's views, clicks, clicks ÷ views, top links (\`topLinks\`), sources (\`viewSources\`, \`clickSources\`) and the change from the period before (\`previous\`). One link: \`GET /api/links/{id}/stats?days=30\`. Standalone short links aren't in a page's stats: \`GET /api/links\` has each one's clicks in the last 7 days.
- Unique visitors are counted per day and added up, so someone who comes every day counts each day: call them daily visitors, not people.
- Compare the two source lists per platform. \`viewSources\` says where the page was opened from (Instagram, X, Facebook, Threads, LINE…) and \`clickSources\` how many clicks each of those led to, because links on the page carry the visit's source. A platform with many views but few clicks is worth pointing out.
- \`insights\` adds where visitors were (\`countries\`, \`cities\`, and \`points\`: town-level spots for a map), their networks (\`networks\`: carriers and company networks), devices, languages, referrers, click hours, and \`campaigns\`: page views and clicks per set of UTM tags (source, medium, campaign, content). If a good share of \`networks\` are data centers (Amazon, Google Cloud, Microsoft, DigitalOcean, OVH, Hetzner…), say that those visits are probably bots or link checkers rather than people. It is null while FluxBio runs on the owner's computer.
- Visitors are anonymous: there are no IPs or cookies, and nobody can be identified.
- With pages off, see "Short links only".

**Sources and UTM tags.**
- Add \`?s=ig\`, \`?s=threads\` or \`?s=qr\` to the page URL or a short URL to tag where visitors come from. Instagram, Threads, Facebook, LINE, X, TikTok, WeChat, Weibo, KakaoTalk, NAVER, Zalo, Snapchat, Pinterest and LinkedIn are recognised by themselves (their in-app browsers or their redirects), and so are sites that send a referrer. WhatsApp, Telegram, Discord, email apps, text messages, PDFs and print usually arrive with nothing and count as direct, so tag links shared there (\`?s=whatsapp\`, \`?s=telegram\`, \`?s=email\`, \`?s=qr\`).
- Tell places on one platform apart with \`utm_content\`: the Instagram bio link, a story and a post all come from Instagram. Give each place its own address, e.g. the page URL with \`?utm_source=instagram&utm_medium=social&utm_content=story\`, or a short link whose \`utm.content\` is \`story\`. Visitors keep the page URL's tags when they tap a link on the page, so stats show which place brought people who click.
- Spell tags carefully. \`?s=\` keeps only a–z, 0–9, \`-\` and \`_\` after lowercasing, so a tag in Chinese or with accents is dropped and counts as direct (use \`?s=newsletter\`), while UTM tags are kept as written (\`story\` and \`Story\` are two rows). Reuse the spelling the owner already has in \`insights.campaigns\`.
- For one URL shared in several places, make one short link per platform with UTM tags (see "Many short links at once"), then compare them (\`GET /api/links\`).`,
		password: `**Changing the admin password.** It is the Worker's \`ADMIN_PASSWORD\` secret, at least 12 characters, so the API can't change it.${otherSites.length ? ' Every site this Worker holds shares it.' : ''} Changing it signs everyone out, ends every preview link and revokes every API token, yours included.
- If you can run commands in the owner's FluxBio folder (\`$FLUXBIO_DIR\`): \`pnpm exec cf workers secrets update ADMIN_PASSWORD --worker ${worker} --type secret_text --text '<new password>'\`. Unless they pick one, make it with \`openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24\`.
- Otherwise walk them through the Cloudflare dashboard: Workers & Pages → ${worker} → Settings → Variables and Secrets.
- Then you need a new token: if you set the password, make one with it (\`POST /api/tokens\`); otherwise ask the owner to make one on Settings → API token. Save it where the old one was (\`${tokenVar}\`), and tell the owner that other AIs and shortcuts need new tokens too.
- Give the owner the new password once, and suggest saving it in their password app.`,
		endpoints: `**Endpoints.** Every route, and which token may call it. "Owner only" is for the owner signed in to the dashboard: no token can. Parameters and request bodies are in ${origin}/api/openapi.json.

${endpointTable()}`,
		'custom-page': `**Custom page.** A page doesn't have to be links. Set \`custom\` in its draft and publish as usual. Each page chooses for itself, and any of them can be the home page. The draft's links stay where they are, so taking \`custom\` away brings that page back, and its short links keep working all the while: say so if they expect those to stop.
- **Their own HTML:** \`{ "kind": "html", "html": "<!doctype html>…" }\`, up to 250,000 characters. Nothing is added to it, so write a whole document with its own title, viewport and share preview tags. Themes, translations and the automatic share card don't apply.
  - It runs in a sandbox. Scripts, forms and links work, but it has no cookies or browser storage (\`localStorage\` throws) and can't reach this site's API, which keeps a bad script away from the dashboard. Don't use \`allow-same-origin\` tricks to get round this.
  - Views count. Clicks count only through short links, so link to \`/<slug>\` rather than straight out. Pictures the owner uploaded are at \`/media/<id>\`, and backups keep any named that way. To find their pictures and short links, see "The owner's pictures and links". For another look on a page that stays a page of links, see "Customize the look" instead.
  - On a page like this, FluxBio's promises about visitors only cover what FluxBio does. Before adding anything from elsewhere (analytics, chat widgets, ads), tell the owner it can track their visitors, and wait for a yes.
  - A preview link shows it, but doesn't update by itself: tell them to reload.
- **Redirect:** \`{ "kind": "redirect", "url": "https://…" }\`. Opening this page's address goes straight there, and it counts as a view. Search engines aren't told about it. Never point it at this page's own address: it would go round in circles. To send one short address somewhere, a short link (\`POST /api/links\`) is simpler: this is for the home page, or a page's address that is already out there.
- With pages off (\`bio: false\`) there are no pages, custom ones included, and \`homeUrl\` says where \`/\` goes.`,
		'trying-it': `**Trying it out.** Most people start here: they have never programmed, and they want to see how it looks before anyone else does. Work this way until they say otherwise, and tell them at most three things at a time.

- **On their own computer.** If this site's address starts with \`http://localhost\`, they are trying FluxBio before putting it online (AGENTS.md 1.2). It costs nothing and nobody else can reach it, so publish freely, and leave out free quota, preview links and test sites. Say that the address only opens on this computer, and that if it stops, you can start it again with nothing lost. When they want to show someone, or say they like it, offer to put it online: it takes a free Cloudflare account, you do the rest, and what they made comes along. Everything below about a live address applies after that.
- **"Not public yet" means don't publish.** Send a preview link that lasts a day (see "Show the owner a draft") and say: only people with this link can see it, and tell me what to change. To pass one on to a friend, make one that lasts a week (\`"minutes": 10080\`). Their main address shows an empty page until they publish.
- **Their address is real.** The \`workers.dev\` address is free and doesn't expire: it stays until they delete the site, so never call it temporary. They don't need a domain, and it is only longer than one would be. They can add their own domain at any time, and links they have shared keep working. Don't offer a test site or a second deployment.
- **Making it public.** When they say they are happy, repeat what goes live. Fill in the share preview first, so the link looks right in LINE or Instagram: \`seo.title\`, \`seo.description\` and a screenshot of their page (see "Share image"). Publish, and give them the address to share.
- **How much free quota is left.** Tell them without being asked: right after deploying, after anything that changes a lot at once, and when something seems to be used up. If you can run commands in their FluxBio folder (\`$FLUXBIO_DIR\`), run \`pnpm usage --json\` and use \`plain\`, for example: "Today your site can still take about 49,000 page views and about 980 changes. That starts over at 8:00." For a page with several pictures, give about half of \`plain.pageViews\`. Give the time in their zone, don't explain how you got the numbers, and don't mention anything else from the output. Say once that it is free, that running out only pauses the site until it starts over and never costs money, and that it counts everything on their Cloudflare account. If you can't run it, say the free plan covers ten thousand to several tens of thousands of page views a day, depending on the pictures on the page, and several hundred changes, and use \`GET /api/stats\` to say how far they are from that.
- **Coming back.** Tell them nothing is lost when they close this window or turn off their computer, because the site lives on Cloudflare. Next time they open the same tool and say what they want, for example "Add my YouTube channel to my FluxBio page". They don't have to find a folder. The key you saved works in windows opened after you saved it.
- **The dashboard and its password.** They don't need the dashboard, because you do everything. Say that before you give them the password. If they lose it, you can set a new one (see "Changing the admin password").
- **When something goes wrong.** Say plainly what happened and what you will try next. To tell the people who make FluxBio, write a few lines: what they asked for, what happened, the error text and \`version\` from \`GET /api/state\`. Leave out tokens, passwords and preview links. Give them the text to send to whoever invited them. If nobody did, it goes at https://github.com/0t2/flux-bio/issues, which takes a free GitHub account.
- **If they don't want it.** See "Remove FluxBio". Say first that they can simply leave it, since it costs nothing.`,
		'share-image': `**Share image.** The picture people see when the page's link is pasted into LINE, Threads or Facebook. A page published through the API has only its avatar there, and a screenshot of the page is better. You can take one if you can run commands and the owner is signed in to Cloudflare (\`pnpm exec cf auth whoami\` in their FluxBio folder, \`$FLUXBIO_DIR\`). Cloudflare's free plan has 10 minutes of browser time a day and a shot takes a few seconds, so just do it when a page is about to go public.

1. Finish the draft, because an unfinished link looks unfinished in the picture. \`POST /api/pages/{id}/preview-link\` gives a URL that shows the draft without counting a visit.
2. In their FluxBio folder, with that URL and \`?lang=<the page language>\` on the end:

\`\`\`sh
pnpm exec cf browser-run quick-action screenshot --body '{"url":"<url>","viewport":{"width":1200,"height":630},"gotoOptions":{"waitUntil":"networkidle0"},"screenshotOptions":{"type":"jpeg","quality":85},"addStyleTag":[{"content":".draft-note{display:none}"}]}' > share.jpg
\`\`\`

   Keep \`networkidle0\`, or the photo and the fonts won't have loaded yet. Look at the picture if you can.
3. \`POST /api/media\` with the file as the body and \`content-type: image/jpeg\` returns an \`id\`. Put it in the draft's \`seo.image\`, set \`seo.imageMode\` to \`"upload"\`, and publish. Then delete \`share.jpg\`.

The picture doesn't follow the page, so take a new one when the look or the top of the page changes. If any of this fails, carry on without it: the page still works, and shares with its avatar. Without a screenshot, upload any 1200 × 630 image the same way, or have the owner press Publish once in the dashboard, which draws a share card of its own while \`seo.imageMode\` is \`"auto"\`; pages published through the API don't. The dashboard has no button for a screenshot.`,
		links: `**Many short links at once.** \`POST /api/links/bulk\` with \`{ "links": [ … ] }\`, up to 100 per call; report \`created\` and each of \`errors\` (by \`index\`). Before sending, drop rows whose URL isn't http(s) and slugs already taken (\`GET /api/links\`, page handles in \`GET /api/state\`), and say which ones you skipped.
- One URL for several places: one link per place, all with the same \`utm.campaign\`. Use these tags so stats group them: Instagram \`source: instagram, medium: social\`, slug suffix \`-ig\`; Threads \`threads, social\`, \`-th\`; LINE \`line, broadcast\`, \`-line\`; Facebook \`facebook, social\`, \`-fb\`; YouTube \`youtube, video\`, \`-yt\`; newsletter \`newsletter, email\`, \`-mail\`; print and QR codes \`print, qr\`, \`-qr\`. Add \`utm.content\` when one platform gets several links: \`bio\`, \`story\`, \`post\`, \`reel\`, \`pinned\`, \`dm\`, or a date such as \`story-1101\`. Ask for a short slug prefix and the campaign name if the owner gave none.
- A list or spreadsheet from the owner (columns like slug, url, title, expires): map each row to \`{ url, slug?, title?, expiresAt? }\`, converting dates in the site's time zone to epoch milliseconds.

**Get a QR code.** \`GET /api/links/{id}/qr\` returns an SVG file in the link's saved style (\`qr\`), \`?size=card\`, \`sticker\` or \`poster\` for 2.5, 5 or 15 cm. It holds the short URL with \`?s=qr\`, the same as a download from the dashboard, so scans show up under that source. Change the style with \`PATCH /api/links/{id}\`. Save the file on the owner's computer and say where it is. Ask them to scan it with a phone before printing many. A picture over 256 KB is only linked from the file, and print tools may not show a WebP: for a print shop, convert it to PDF or PNG yourself and check the result, or have the owner download one from the dashboard.

**QR code pictures.** A link's \`qr.logo\` of \`default\`, which is what a link with no saved style has, shows its page's picture, else the site's, else nothing. Upload with \`POST /api/media\`, then set a page's with \`PATCH /api/pages/{id}\` and \`qrLogo\`, or the site's with \`qrLogo\` in \`PUT /api/settings\`. Every code following it changes in the dashboard and in new downloads, but printed ones and files already saved don't, so say that. Codes with their own picture, or set to none, don't follow it.`,
		update: `**Update FluxBio.** When the owner asks, or a problem they reported has been fixed. Their pages, links and stats are on Cloudflare, and updating leaves them alone. The code is in their FluxBio folder (\`$FLUXBIO_DIR\`).
1. Back up (see "Back up"). If the site has visitors, ask whether to try it on a test site first (see "Test site").
2. If the folder has \`.git\`, run \`git pull\`. If not, download the new code next to it and swap the folders: \`mkdir ../flux-bio.new && curl -fsSL https://github.com/0t2/flux-bio/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C ../flux-bio.new\`, copy over any \`.secrets*\` files, \`.dev.vars\` and \`sites.json\` (without it, the other sites this Worker holds go offline: see "More sites"), and move the old folder aside until it works. If the old \`cloudflare.config.ts\` has another \`WORKER_NAME\`, set the same one.
3. Run \`pnpm install\`, then \`pnpm deploy:images --site ${origin}\`, which deploys and keeps the pictures as static files (see "How much free quota is left"); \`pnpm run deploy\` would put them back on the quota.
4. Check that the site answers, read \`/llms.txt\` again, and save the new guide over the old skill: \`curl -fsSL ${origin}/skill.md -o ~/.claude/skills/${skill}/SKILL.md\`.${otherSites.length ? ' Do the same for the skill of each other site this Worker holds, from its own address.' : ''}
5. Say in a line what changed. Then delete the old folder.`,
		remove: `**Remove FluxBio.** Say first that they can leave it as it is, since it costs nothing. If they still want it gone:
1. Offer a backup (see "Back up"), and say what goes: pages, short links, stats and pictures. Every short link and printed QR code stops working, and this can't be undone, apart from the database within 7 days.
2. Wait for a clear yes to this, in this conversation.
3. In their FluxBio folder, look at what exists with \`pnpm exec cf d1 list\` and \`pnpm exec cf kv namespaces list\`, and delete only what belongs to this site: \`pnpm exec cf workers delete ${worker} --force\`, then \`pnpm exec cf d1 delete <id> --force\` for the database named \`${worker}\`, and \`pnpm exec cf kv namespaces delete <id> --force\` for the namespace named \`${worker}-kv\`. Their other projects on the account stay untouched. If your tool refuses to run a delete, don't look for a way around it: show them the command and how to run it.
4. Then clear what you left on their computer: the \`FLUXBIO_TOKEN\` and \`FLUXBIO_DIR\` lines in their shell profile, \`~/.claude/skills/fluxbio\`, and their FluxBio folder. Leave their backups unless they say otherwise.
5. Their Cloudflare account stays, free. Closing it is up to them, on Cloudflare.`,
		"first-conversation": `If the owner is new to this, read "Trying it out" first, and pick the two or three things below that matter most instead of listing them all.

The owner may have just deployed FluxBio and connected you. Most of its settings have no screen in the dashboard; they are yours to handle, so guide the owner through them.

If \`settings.bio\` is false, the owner chose to use this site only for short links, so don't push page setup: skip the page checks below, and don't suggest a first page, a theme or switching pages on unless they ask for something that needs one. Say how many short links there are and how many clicks they had in the last 7 days (\`GET /api/links\`), then offer what still applies: the time zone, where \`/\` should go (see "Short links only"), a custom domain, a backup, and bulk short links with UTM tags.

Otherwise:

1. Read \`GET /api/state\` and the home page (\`GET /api/pages/{id}\`), and say in three or four lines what the site has: its pages and addresses, whether each is published, how many links, and clicks in the last 7 days.
2. List what isn't set up yet, most useful first, and offer to do each one. Check:
   - a page that was never published (\`publishedAt\` is null) or has unpublished changes (\`dirty\`);
   - no home page (\`settings.home\` is ""), so ${host}/ shows nothing;
   - no avatar (\`profile.avatar\`) or an empty bio;
   - no share preview text (\`seo.title\`, \`seo.description\`);
   - the time zone still \`UTC\`: ask where the owner is, because daily stats and "open now" follow it;
   - the page language (\`settings.locale\`) isn't the language the owner writes to you in: offer to switch it;
   - visitors from several countries (\`insights.countries\` or \`insights.languages\` in \`GET /api/stats\`) while \`settings.languages\` is empty: suggest turning on their languages and translating the pages (see "Translate a page");
   - a page with \`untranslated\` above 0 in the state: offer to translate it;
   - visitors from the EU (\`insights.countries\`) while \`settings.hostFonts\` is off: their browsers fetch fonts from Google, which a German court found breaks the GDPR; offer to turn it on and say what it costs (see \"Fonts\");
   - no custom domain (optional; see "Use a custom domain");
   - no backup yet: offer one (see "Back up").
3. Tell the owner they can simply say what they want, with two or three examples that fit their site, such as "Add a link to my YouTube channel at the top and publish it", "Make short links with UTM tags for this URL, one each for IG, Threads and LINE", "Which link got the most clicks this month?" or "Back up my whole site". Write them in the owner's language.

When the owner asks what you can do, answer with what the dashboard leaves to you: links and pages, short links one at a time or in bulk with UTM tags, stats reports, translating pages, the domain, time zone and language, share previews, a theme of their own with their colors, fonts and pictures or one that matches a picture they send, themes from files or GitHub, fonts from Google Fonts, switching pages off to use only short links, backups and moving to another FluxBio, and the steps for changing the admin password.`,
		faq: `The FluxBio FAQ (README and fluxbio.link) says the same; keep your answers in line with it.
- **Cost:** FluxBio is free and open source. It runs on the owner's Cloudflare account; the free plan allows 100,000 requests, 100,000 KV reads and 1,000 KV writes a day, plenty for a person or a small shop. A new visitor's page view uses one request and one read, plus one of each per image on the page, and per font file when \`hostFonts\` is on (see \"Fonts\"). Their AI subscription is separate. If they ask how much is left today, see "How much free quota is left".
- **Where the data is:** only in their Cloudflare account (pages, short links and stats in D1, images in KV). There is no central server; FluxBio's authors can't see it.
- **Admin password, API tokens, Cloudflare key:** the password is for signing in to the dashboard (set at deploy, changeable any time). Tokens are for AIs and tools: one per AI, optionally limited to creating short links, revocable one at a time. The Cloudflare key manages the whole Cloudflare account and is only needed to deploy or change the password; it never belongs in a chat.
- **A leaked token:** revoke it in Settings and make a new one. A leaked password: change it (see "Changing the admin password"), which also revokes every token.
- **Mistakes:** you edit drafts, and nothing is public until it is published; each page keeps its last ${VERSIONS_KEPT} published versions, so a publish can be undone (see "Undo a publish"); you ask first whether to publish straight away or show a preview, and confirm before deleting or renaming. For bigger changes you can use a test site and move things to the live site once they approve. Before changing anything you save a backup on their computer, or ask them to press Download backup on Settings if you can't; only the signed-in owner can wipe everything.
- **Do I need the dashboard:** no. Anything they want done, they can ask you for. It is there if they like to look around.
- **Without an AI:** pages, appearance, short links, QR codes, stats and downloading a backup all work in the dashboard; settings without a screen (domain, time zone, restoring a backup, a look with their own colors and pictures) go through the API described here.
- **Visitor tracking:** no cookies, no IP addresses and no full user-agent strings. Each visit leaves an event for 90 days with the time, source, device, browser, language, network and a location rounded to about 10 km (Cloudflare's estimate from the IP), and a one-way hash that changes daily; the totals stay. Known bots and link previews are not counted. Fonts load from Google unless \`hostFonts\` is on, and YouTube thumbnails come from Google, so visitors' browsers connect there.`,
		look: `**Themes.** A page's look is its \`draft.appearance\`: \`theme\`; \`accent\`, \`accent2\`, \`bg\` (background) and \`fg\` (text), each \`#rrggbb\` or "" for the theme's own; \`font\` (${list(FONT_IDS)}); \`headFont\` and \`bodyFont\` (see "Fonts"); \`button\` (${list(BUTTON_IDS)}, see "Buttons"); \`showName\` (false hides the name from sight, for an avatar that is a logo with the name in it; screen readers and search engines still read it); \`showSocial\`, and \`socialPlace\` (${list(SOCIAL_PLACES)}: the social icons under the bio, or after the items); and \`coverImage\`, \`bgImage\`, \`bgDim\` and \`bgTile\` (see "Make a theme"). The owner has switches for \`showName\` (Content, under the name), and for \`showSocial\` and \`socialPlace\` (Appearance). There are 24 base themes, and each is a layout of its own, not only colors: \`liquid\` Neon (a deep night, pills that glow), \`editorial\` Vista (the cover fills the screen, white outlined pills), \`brutal\` Tiles (a big bright square per social account, on a dark blurred cover), \`jelly\` Candy (a soft field, every link its own bright color; good for shops), \`minimal\` Airy (white space, a small avatar beside the name, pastel rows), \`aurora\` Aurora (a gradient across the page, buttons two to a row; good for events), \`notebook\` Card (one card floating on a color, a square portrait at its head), \`boutique\` Frost (a blurred cover under frosted rows; good for shops), \`sunset\` Sunset (a card whose top is a gradient, the avatar overlapping it), \`sky\` Sky (a gradient behind a card, an oval portrait beside the name), \`pop\` Pop (a loud field, a bright card, pastel pills in many colors), \`portrait\` Portrait (a large black-and-white picture on a dark page, one bright button), \`sheet\` Sheet (the cover on top, a rounded sheet rising over it), \`rail\` Rail (a portrait fills the screen, round icons down its right edge), \`duo\` Two-tone (a saturated top with a curved edge, a pale bottom), \`relief\` Relief (one quiet color, raised buttons and pressed icons), \`bento\` Bento (tiles of different sizes, with the cover as one of them), \`dots\` Dots (no buttons, a big round colored icon on each row), \`pastel\` Pastel (a soft mesh of color behind white translucent pills), \`letter\` Letter (warm paper, a serif name, rows divided by hairlines), \`obsidian\` Obsidian (near-black with blurred color behind glass panels), \`moon\` Moon (a huge circular picture cropped by the top of the screen), \`chips\` Chips (one big button, then the links as a cloud of pills), \`tracks\` Tracks (the links as a numbered list in a card, like a playlist). To see them before you pick, look at pictures rather than switching a draft through them: ${THEME_PICTURES}/<code>/#themes shows all 24 with a sample page each, and ${THEME_PICTURES}/preview/<code>/<theme id> is one theme's sample page in full, to screenshot at 390 px wide (\`<code>\` is a page language: ${list(LOCALES)}). The owner picks one on Appearance, in one of its few color sets. \`GET /api/themes/community?lang=<code>\` answers \`{ source, lang, bases, themes }\`: \`bases\` is every base theme as \`{ id, name, en }\`, where \`name\` is what the owner sees on Appearance in that language (the site's page language when \`lang\` is left out), so call a theme by it; \`themes\` are the color sets, each \`{ id, name, base, accent, accent2, bg, fg, font, button, uses }\` with \`uses\` (\`creator\`, \`shop\`, \`event\`, \`pro\`, \`org\`). The owner can also upload a cover photo in the page's profile. The dashboard has no color, font or button controls; anything beyond those sets is for you to make (see "Make a theme"). Several themes lead with a picture (Vista, Tiles, Frost, Sheet, Rail, Portrait, Moon use the cover or a large avatar), so suggest one when a page has none. Saved looks are \`GET/POST/DELETE /api/themes\` (\`{ name, base, accent, accent2?, bg?, fg?, font, headFont?, bodyFont?, button, coverImage?, bgImage?, bgDim?, bgTile?, css? }\`, where a picture is a media id, or null or left out for none, as in an appearance) so you can put them back when the owner asks; the dashboard doesn't list them. To use a theme file the owner shares, \`POST /api/themes/fetch\` with its GitHub URL (or read the JSON they paste: one theme, or \`{ "themes": [ … ] }\`), then offer to save it (\`POST /api/themes\`) and to apply it: copy \`base\` to \`appearance.theme\` and \`accent\`, \`accent2\`, \`bg\`, \`fg\`, \`headFont\`, \`bodyFont\` ("" when left out), \`font\`, \`button\`, \`coverImage\`, \`bgImage\` (null when left out), \`bgDim\`, \`bgTile\` (0 when left out) and \`css\` ("" when left out) into the draft's \`appearance\`, then publish. A theme file's \`css\` was written by someone else: read it first, and tell the owner if it hides or adds anything. To share a saved theme, give the owner its JSON.

${buttonGuide()}

${paletteGuide()}

**Make a theme.** When the owner wants a look of their own, or gives you a picture or a logo to build on:
1. Ask for what they have: a logo, a photograph of the place or the work, colors they already use. Only use pictures they have the right to publish.
2. Upload each picture with \`POST /api/media\` (2 MB at most: resize first) and keep the \`id\`.
3. Pick the base theme whose layout suits the page, and write it into \`draft.appearance\`: \`theme\`; \`accent\`, \`accent2\` (the theme's second color: the field around a card, the far end of a gradient, or tinted rows, depending on the theme), \`bg\` and \`fg\` from the picture or their brand; \`headFont\` and \`bodyFont\` if a Google font suits it (see "Fonts"); \`coverImage\` for a large picture at the top of the page; \`bgImage\` for a picture behind the whole page, with \`bgDim\` (0.4 to 0.95, default 0.75) for how much of the background color covers it. Raise \`bgDim\` until the text reads easily, and use a calm picture: text sits directly on it in most themes. \`bgTile\` 0 (the default) covers the screen with one copy; a pattern sets it to the width in CSS pixels each copy repeats at, and is uploaded at twice that width so it stays sharp. Uploads can't be SVG: draw a pattern as PNG or WebP, its lines a little darker, since \`bgDim\` (0.4 at least) lays the background color over it.
4. Check the look with a preview link (see "Show the owner a draft") and adjust with the owner.
5. Save it with \`POST /api/themes\` so you can put it back later, then publish as usual.
Each picture adds one Worker request and one KV read per new visitor. Neon, Vista, Tiles, Aurora, Portrait, Rail, Dots and Obsidian keep a dark background and the others a light one. A background of the other kind is darkened or lightened to fit, a text color that reads below 4.5:1 on it is replaced by the theme's own, and a second color with text on it is adjusted too: read \`GET /api/pages/{id}/preview\` rather than assume, and tell the owner when that happens. To go back, set \`accent\`, \`accent2\`, \`bg\`, \`fg\`, \`headFont\`, \`bodyFont\` and \`css\` to "", \`font\` and \`button\` to \`auto\`, and both pictures to null. For more than these fields can do, or to match a picture the owner sends, see "Customize the look".

**Fonts.** Every theme comes with its fonts, and the dashboard has no font control, so a font is something the owner asks you for: a built-in one (\`appearance.font\`: \`sans\`, \`serif\`, \`kai\`, \`mono\`), or any other. Any Google Fonts family can be the heading font (\`appearance.headFont\`: the name and headings) or the body font (\`bodyFont\`).
1. Ask what it is for and suggest two or three families from \`GET /api/fonts?q=&category=&script=\`. Use the page language's script for body text (\`script=chinese-traditional\` for zh-TW, \`script=arabic\` for ar, \`japanese\`, \`korean\`, \`thai\`…). For headings a Latin family is fine on any page: characters it lacks use \`font\`. Prefer variable families (\`variable: true\`): one file covers every weight.
2. Tell the owner what it costs (below) and wait for a yes.
3. Set \`headFont\` and/or \`bodyFont\` in the draft, \`PUT\` it, send a preview link, then publish. To go back, set them to "" and publish.
Only the weights a role needs are loaded: \`bodyFont\` loads 400 to 700, \`headFont\` only its bold (700, or the nearest it has), so heading text can't be made lighter in CSS; for lighter headings, use the family as \`bodyFont\` and leave \`headFont\` empty. With \`bodyFont\` set and \`headFont\` empty, headings use \`bodyFont\` too, and \`--head-font\` and \`--body-font\` are both that family.

Where fonts load from is the site setting \`hostFonts\` (\`PUT /api/settings\`; on Appearance in the dashboard, with an explanation for the owner):
- **Off, the default:** public pages load their fonts, built-in and picked, from Google Fonts. It costs this site nothing, but visitors' browsers connect to Google, which then has their IP addresses.
- **On:** publishing copies just the characters each page can show from Google Fonts into this site's KV and serves them from \`/_fonts/\`, so visitors never connect to Google. Turning it on or off updates every published page at once. A German court ruled in 2022 that loading Google Fonts without visitors' consent breaks the GDPR, so suggest it to owners with visitors in the EU (\`insights.countries\`). If Google can't be reached when a page is published, that page uses the visitor's own fonts until it is published again; after importing a backup, publish each page once. Uploading the owner's own font files isn't supported.

What fonts cost with \`hostFonts\` on, on the free Cloudflare plan (per day, shared by the whole site: 100,000 Worker requests, 100,000 KV reads, 1,000 KV writes); with it off they cost nothing:
- Every font file is one Worker request and one KV read for each new visitor; returning visitors have it cached for a year. A page already has two files for its theme's fonts (the font itself and its heading face). A picked family adds one file if it is variable or for headings, and up to four for body text in a family without variable weights.
- Publishing a page whose text changed writes each font file again and deletes the old ones: about two KV writes per file. Publishing many times a day with several fonts adds up.
- Chinese, Japanese and Korean files are larger (roughly 50–100 KB for a page's characters, against 10–30 KB for Latin ones): more to download, not more requests. That holds with Google too.
- Suggest at most one picked font, usually for headings, and keeping body text in the built-in font. For a page with tens of thousands of new visitors a day and \`hostFonts\` on, suggest no picked font. Cloudflare's Workers Paid plan (US$5 a month) raises the limits to millions a month.
- If the owner runs FluxBio's code with an agent that can change it (Claude Code in their FluxBio folder, say), AGENTS.md lists ways to cut the cost of \`hostFonts\` further: Cloudflare's cache for font files and images, one fewer built-in file, or device fonts only.`,
		move: `**Restore, or move to another FluxBio.** On the target deployment (with a token made there): upload every image with \`PUT /api/media/{id}\` under its original id (raw bytes, with its content type, from the \`media\` folder; decode \`mediaFiles\` data URLs if the file has them), then \`POST /api/import\` with the JSON (without \`mediaFiles\`). It returns \`{ pages, shortLinks }\`. Short links keep their slugs, but links already shared (and printed QR codes) point at the old address: they keep working only if that address now reaches the new deployment, e.g. by moving the custom domain to it and setting it there (see "Change settings").`,
		quota: `**How much free quota is left.** To an owner, say it in page views and changes, using \`plain\` from the JSON (see "Trying it out"). If you can run commands in the owner's FluxBio folder, run \`pnpm usage\` (add \`--json\` to read it yourself): KV reads, writes, deletes and lists, and D1 rows read and written and each database's size, used today on the whole account, what is left, and when it resets. It breaks them down by KV namespace and by database, which answers "which project used it", a question Settings offers the owner to ask you; Worker requests per Worker are only in the Cloudflare dashboard (Workers & Pages → the Worker → Metrics). \`--date YYYY-MM-DD\` shows one day and \`--days 7\` a week. It needs their Cloudflare sign-in and changes nothing.
- \`GET /api/usage\` works from anywhere and is what Settings shows: the whole account's KV and D1 use today (\`account\`, from Cloudflare's analytics, a few minutes late; null in local development), this site's database size, and Worker requests estimated from this site's views and clicks, since Cloudflare's analytics have no count of those. \`dailyLimits\` holds the free plan's limits, or null on Workers Paid. The site can't see the owner's plan: the owner picks it on Settings, and \`pnpm usage --json\` can read it (\`plan\`). When you run that and it differs from \`settings.plan\`, set it with \`PUT /api/settings\` without asking.
- Pictures. Each one a visitor's browser doesn't have yet costs a Worker request and a KV read, which on a page with several pictures is most of a view's cost. If you can run commands in the owner's FluxBio folder, \`pnpm deploy:images --site ${origin}\` deploys with the pictures the pages use as static files, which visitors load at no cost to the quota. The dashboard can't do this, so offer it when the owner adds pictures or asks about quota, and again after new uploads: those cost as before until the next run. A deploy without it puts them back on the quota, nothing breaks.
- Old numbers. Stats keep each day for 13 months, then each month as one number per link, page and source: only the day within the month is lost. Past 70% of the database, 6 months instead. \`stats.nextMerge\` says which month is next and when. Before that day, offer the download (Download stats on Settings, or \`GET /api/stats/export\` saved next to the backups), for an owner who wants every day kept. Downloading deletes nothing. If the database still fills up, the owner can delete old months on Settings (\`POST /api/stats/clear\`, owner only); suggest downloading first, or Workers Paid, whose databases hold 10 GB.
- A site has no limit on pages or short links, so this quota is what to watch when making many. Changing the time zone costs one KV write, and visits use it within 5 minutes. Changing languages, or copying fonts, drops published pages' KV copies, which a visit rebuilds: at most ${KV_OPS_AT_ONCE} in one request. If \`PUT /api/settings\` answers \`copiesLeft: true\`, some pages stayed as they were and show the old languages until they're next published. Tell the owner, in those words.
- The limits are per Cloudflare account, so other projects on the account count too. If one of them uses the most, say so: it isn't FluxBio.
- A day runs in UTC whatever the owner's time zone, so "today" starts over at 00:00 UTC. Give the reset in their local time. At a limit, that kind of operation fails until the reset: once reads run out, public pages and short links answer with an error until then, so warn the owner well before that.
- The numbers are estimates and run late (see the note it prints), so don't promise exact counts. It doesn't cover the 100,000 Worker requests a day.
- Run it before anything that writes a lot: bulk short links, copying a site to a test site, or turning on more languages, which rewrites every published page.
- If you can only reach this API, you can't read the quota of the whole account: \`GET /api/usage\` has KV and D1 for it, but not Worker requests or which project used what. Point the owner to the Cloudflare dashboard for those.`,
		"test-site": `**Test site.** Try a change first where it costs nothing on Cloudflare: a preview link for a page (see "Show the owner a draft"), or, for anything else including a new version of FluxBio, FluxBio on the owner's computer. In their FluxBio folder, with \`ADMIN_PASSWORD\` in \`.dev.vars\`, run \`pnpm exec cf dev --mode staging\` in the background and give them the address it prints: only this computer can open it, and it uses none of their quota. For real content, copy the live site into it as step 2 says. On their yes, deploy to the live site with \`pnpm run deploy\`.

**A test site on Cloudflare** only if the owner asks for one, say to show someone else. Say first that it takes a second D1 database (10 per account on the free plan) and shares the account's daily quota with the live site: copying a site there costs one KV write per page, short link and image. It is a second FluxBio of the owner's, the Worker \`${liveWorker}-staging\`, with its own database, images and stats. What happens there doesn't reach the live site, and search engines are kept away. \`testSite\` in \`GET /api/state\` says which kind of site you are talking to: check it before anything below that replaces data. All of this needs a tool that can run commands in the owner's FluxBio folder.
1. Set it up, once, with its own password. Run \`printf 'ADMIN_PASSWORD=%s\\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.staging.env\`, then \`pnpm exec cf deploy --mode staging --secrets-file .secrets.staging.env\`. It prints the address and creates the database. If Cloudflare isn't signed in, ask the owner to run \`pnpm exec cf auth login\`. Keep that file, which git ignores: it is how you sign in to the test site. Later deploys are \`pnpm exec cf deploy --mode staging\`.
   - If Cloudflare says the account has reached its limit of D1 databases (10 on the free plan), stop and tell the owner. Never delete a database to make room on your own: another of their projects may depend on it. Their choices are to pick one they no longer need, to move to Workers Paid, or to try the change on this computer instead with \`pnpm exec cf dev --mode staging\`, which needs \`ADMIN_PASSWORD\` in \`.dev.vars\`, makes nothing on Cloudflare, and can only be seen on this computer.
   - That failed deploy leaves an empty KV namespace, \`${liveWorker}-staging-kv\`, and the next try stops with "a namespace with this account ID and title already exists". Once there is room, delete that namespace with the owner's yes (check its name, and that \`pnpm exec cf kv keys list --namespace-id <id> --limit 10\` succeeds and shows no keys), then deploy again.
2. Copy the live site if the change needs real content. Take a backup of the live site (see "Back up"). Then, on the test site and only after \`testSite\` says \`true\`, upload every image with \`PUT /api/media/{id}\` and send the backup to \`POST /api/import\`. Stats don't come along.
3. Make the change on the test site and give the owner its address. To let them look around in the dashboard, tell them the password in \`.secrets.staging.env\`.
4. Wait for their yes, then move only what they approved to the live site:
   - Code: deploy the same version to the live site with \`pnpm run deploy\`, and check it answers.
   - A page: read \`draft\` from \`GET /api/pages/{id}\` on the test site. Download each image it uses (\`profile.avatar\`, \`seo.image\`, \`seo.autoImage\`, \`appearance.coverImage\`, \`appearance.bgImage\`, gallery and product images) from the test site's \`/media/<id>\` and upload it to the live site with \`PUT /api/media/{id}\` under the same id. Then, on the live site, \`POST /api/pages\` if the page is new there, read the page and \`PUT /api/pages/{id}/draft\` with its \`draftUpdatedAt\` as \`If-Match\`. Send a preview link from the live site, and publish on their yes. If publishing answers \`409\`, a link's slug is taken on the live site: tell them which.
   - Settings, standalone short links and saved themes: make the same change on the live site with the usual calls.
5. **Never use \`POST /api/import\` to move things to the live site.** It replaces every page, short link and saved theme there, so whatever changed on the live site since the copy is lost, and short links that aren't in the file stop working.
6. Keep the test site for next time. It costs nothing while nobody visits. Delete it only if they ask, and say first that the Worker and KV namespace can't be brought back, and the database only within 7 days (\`pnpm exec cf d1 undelete\`). The commands are \`pnpm exec cf workers delete ${liveWorker}-staging --force\`, then \`pnpm exec cf d1 delete <id> --force\` (the id is in \`pnpm exec cf d1 list\`) and \`pnpm exec cf kv namespaces delete <id> --force\` (the id is in \`pnpm exec cf kv namespaces list\`). Check each name before deleting.`,
		"short-links-only": `**Short links only.** An owner who only wants a link shortener can switch pages off: \`PUT /api/settings\` with the current settings and \`bio: false\` (warn first, see "When to warn the owner"); \`bio: true\` undoes it, and either can take about a minute to reach visitors everywhere. The owner has the same switch under Settings in the dashboard, where Page disappears while it is off.
- What visitors get while it is off: \`/\` says this address is for short links, or redirects (302) to \`homeUrl\` if set, say to the owner's main website; \`homeUrl\` is an http or https URL, or "" for the page, and does nothing while pages are on. Never point it at this site's own \`/\`: it would redirect to itself. A page's address answers "not found", and so do draft preview links and clicks inside blocks. \`/robots.txt\` and \`/sitemap.xml\` list no pages. Every short link keeps redirecting and counting, and images at \`/media/\` stay public.
- What you can still do: edit and publish pages through the API. They stay out of sight until pages are on again, and a page's address stays reserved, so no short link can take it. \`POST /api/pages/{id}/preview-link\` answers 409; read \`GET /api/pages/{id}/preview\` yourself.
- Stats: \`GET /api/stats\` is about one page, so use \`GET /api/links/clicked\` for the last 7 days of every link someone clicked and \`GET /api/links/{id}/stats\` for one link's longer periods, places and devices.
- A site with no pages at all works the same way, and needs no first page. If pages are switched on later and none exists, the dashboard asks for the first one.`,
		translate: `**Translate a page.** Translating is your job, because nothing on the site can do it. Arabic (\`ar\`) runs right to left: its pages turn round by themselves, so there is nothing to set. Without being asked: when languages are added to \`settings.languages\`, translate every page into them; when you change text on a page and \`settings.languages\` isn't empty, translate the new text in the same \`PUT\`. Say in one line what you translated. If the owner changed text in the dashboard, \`untranslated\` in \`GET /api/state\` shows which pages need you.
1. \`GET /api/pages/{id}\`: \`page.untranslated\` lists, per language turned on, the texts with no translation yet. A text is matched by its exact wording, so a text that was changed shows up here again.
2. Add to \`draft.translations\`: \`{ "ja": { "<the text exactly as it is written>": "<its translation>" } }\`. Keep what is already there, and \`PUT\` the whole draft.
3. Send a preview link with \`?lang=<code>\` added and tell the owner the translations are yours, so they can have someone check a language they don't read. Publishing follows the usual rule; visitors get the translation once it is published, and \`untranslated\` in the response says what still shows as written.
- Translated: the name, bio, share preview title and description, link titles and subtitles, headings, video, gallery and product titles, image descriptions, product names and prices, and the title and note of opening hours and of an embed card. Addresses, phone numbers, URLs, slugs and embed accounts stay as written, and the share image stays one picture.
- Keep the owner's tone and keep it short, since titles sit on buttons. Leave brand names and the owner's name as they are, unless the owner says otherwise, and still list them, with the same text, so they stop showing as untranslated. A price stays a price: convert a currency only if the owner asks.
- Visitors get the language their browser prefers, and anything untranslated in the original. \`?lang=<code>\` on a page address shows one language; search engines find it through the sitemap once every text on the page has a translation.
- \`settings.locale\` is the page language: the built-in text on public pages (buttons, notices, opening hours, the 404 page). \`settings.languages\` turns on more of those for visitors whose browser prefers one; everyone else sees \`locale\`. Only the owner decides what goes in \`languages\`, so ask which before adding any, and leave it out of \`PUT /api/settings\` to keep the list as it is. The owner can also set both on Appearance in the dashboard.
- With \`hostFonts\` on, every language adds characters, and changed text rewrites the page's font files once (see "Fonts"). Say so the first time.`,
		domain: `**Use a custom domain.** The domain has to reach this Worker before FluxBio can use it, and only the owner can do that part, in Cloudflare: the domain must be on their Cloudflare account, then Workers & Pages → ${worker} → Settings → Domains & Routes → Add → Custom domain. Walk them through it step by step. Then \`POST /api/settings/verify-domain\` with \`{ "domain": "links.example.com" }\`: if \`ok\` is false, show its \`message\` and try again in a few minutes (DNS takes time). When it passes, \`PUT /api/settings\` with the new \`domain\`.

**More sites.** One Worker can hold more than one site. Each has its own pages, short links, stats, settings and API tokens, in a database and a KV namespace of its own, and is reached through its own domain. They share the code, the dashboard and the admin password, and nothing else: a name can be a page at one site and a short link at another, and the dashboard's menu at the top left moves between them. \`sites\` in \`GET /api/state\` lists them, with \`current\` on the one you asked; it is empty when there is only one. ${otherSites.length ? `Here, beside ${host}: ${otherSites.join(', ')}.` : `${host} is the only site here now.`}

It is for a second domain that should be a site of its own: say a shortener at one domain beside pages at another. A second address for the same site needs none of this: see "Use a custom domain".

Tell the owner, in plain words, before you add one:
- It takes one more D1 database, of the 10 a free account may have, and every site shares the account's daily quota (see "How much free quota is left").
- All the sites have the same password. Each has its own tokens.
- Each needs a domain of its own on their Cloudflare account. The \`workers.dev\` address only ever reaches the first site, which is called \`main\`.

To add one, on a computer that can deploy, in their FluxBio folder (\`$FLUXBIO_DIR\`):
1. Back up (see "Back up").
2. List the sites in \`sites.json\` in that folder: \`{ "main": ["${host}"], "<id>": ["<the new domain>"] }\`. An id is lowercase letters, digits and hyphens, and goes into the name of its database: keep it short, like \`link\`. Keep every site already listed. A deploy binds exactly what this file lists, so a site left out goes offline and its domain shows the main site instead.
3. Deploy: \`pnpm exec cf deploy\`, or \`pnpm deploy:images --site ${origin}\` to keep the pictures as static files. Cloudflare makes the new database and namespace.
4. Have the owner add the domain to the Worker in Cloudflare, as in "Use a custom domain".
5. Check it with the admin password: \`GET https://<the new domain>/api/auth/me\` answers \`{"ok":true,"role":"admin"}\`, and \`GET https://<the new domain>/api/state\` lists both sites.
6. Set it up like any new site, through its own address: a first page, or only short links (see "Short links only"), where \`bio: false\` with \`homeUrl\` set to the other site's address sends its home page there.
7. It has its own guide at \`https://<the new domain>/llms.txt\`, which says which variable its token goes in, and \`/skill.md\` there is a skill under a name of its own, to save beside this one. Make its token there (\`POST /api/tokens\`): one made at ${host} opens nothing at another site.

Updating FluxBio updates every site at once. When the folder is replaced, \`sites.json\` has to come along (see "Update FluxBio").

To take a site out, never delete its database yourself. Back it up through its own address, remove it from \`sites.json\` and deploy, which only unbinds it, and leave deleting the database and the namespace to the owner (see "Remove FluxBio").`,
	}
}

/** One part of the guide as Markdown, or null if there is no such topic. */
export function guideTopic(id: string, names: GuideNames): string | null {
	const topic = GUIDE_TOPICS.find((candidate) => candidate.id === id)
	if (!topic) return null
	return `# FluxBio guide: ${topic.title}\n\nFor ${names.host}. This adds to ${names.origin}/llms.txt: read that first, because its rules still apply.\n\n${bodies(names)[topic.id]}\n`
}
