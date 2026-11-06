import { useEffect, useLayoutEffect, useRef } from 'react'
import { linkItems, type PageContent, type SocialPlace, type ThemeId } from '../../shared/content'
import { THEME_CSS } from '../../templates/compositions'
import { iconSvg, type IconName } from '../../templates/icons'
import { esc } from '../../templates/html'
import { BASE_CSS, BOTTOM_SOCIALS_CSS, initials } from '../../templates/render'
import type { ResolvedAppearance } from '../../templates/themes'
import { t } from '../i18n'
import { loadStylesheet } from '../lib/fontPreview'
import '../styles/library.css'

/** What the previews show: the page being edited, in each theme. */
export interface Sample {
	name: string
	bio: string
	avatar: string | null
	links: string[]
	socials: number
	socialPlace: SocialPlace
	showName: boolean
	coverImage: string | null
}

export function sampleOf(draft: PageContent): Sample {
	const links = linkItems(draft)
		.filter((link) => !link.hidden)
		.slice(0, 4)
		.map((link) => link.title.trim() || t('[block]連結'))
	return {
		name: draft.profile.name,
		bio: draft.profile.bio,
		avatar: draft.profile.avatar,
		// Without a few links there would be little to show the theme's layout on.
		links: [...links, t('[block]連結'), t('[block]連結'), t('[block]連結')].slice(0, Math.max(links.length, 3)),
		socials: draft.appearance.showSocial ? Math.min(draft.socials.length, 6) : 0,
		socialPlace: draft.appearance.socialPlace,
		showName: draft.appearance.showName,
		coverImage: draft.appearance.coverImage,
	}
}

/** Stand-ins, so a theme that draws each social account large has something to draw. */
const SOCIALS: [IconName, string][] = [
	['camera', 'Instagram'],
	['play', 'YouTube'],
	['threads', 'Threads'],
	['x', 'X'],
	['facebook', 'Facebook'],
	['mail', 'Email'],
]

/**
 * The fonts of the built-in themes. In the dashboard itself only these thumbnails are set in them, so they come with
 * the first thumbnail, not with every screen: this stylesheet is several hundred kilobytes, most of it the list of
 * files Chinese fonts are cut into, and in the page's head it held up the first paint. The dashboard's own fonts are
 * in admin/index.html, where Noto Sans TC isn't waited for either. It is in both, in different weights.
 */
const THEME_FONTS =
	'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+TC:wght@900&family=Noto+Serif+TC:wght@500&family=LXGW+WenKai+TC:wght@400&family=Plus+Jakarta+Sans:wght@400..800&family=Manrope:wght@400..800&family=Nunito:wght@400..800&family=Nunito+Sans:wght@400..800&family=DM+Sans:wght@400..800&family=Lora:wght@400..700&display=swap'

// A page's own CSS, with its document-level rules moved onto the element that stands in for <body>. One sheet per theme, shared by every thumbnail.
const SHEETS = new Map<ThemeId, CSSStyleSheet>()
function sheetFor(id: ThemeId): CSSStyleSheet {
	let sheet = SHEETS.get(id)
	if (!sheet) {
		const css = `${BASE_CSS}\n${THEME_CSS[id]}\n${BOTTOM_SOCIALS_CSS}`
			.replace(/html,body\{/g, '.body{')
			.replace(/(^|[\n}])html\{[^}]*\}/g, '$1')
			.replace(/(^|[\n}])body(::before)?\{/g, '$1.body$2{')
			.replace(/100d?vh/g, '844px')
		sheet = new CSSStyleSheet()
		sheet.replaceSync(`${css}\n.body{width:390px;height:844px;overflow:hidden}`)
		SHEETS.set(id, sheet)
	}
	return sheet
}

/**
 * A bio page in miniature, for theme and page cards: the theme's real
 * composition on a few of the page's real elements, scaled down, so a theme
 * needs no separate drawing for its thumbnail. `position:fixed` in a
 * composition lands inside the thumbnail, since it is transformed.
 */
export function MiniBio({
	look,
	name,
	bio = '',
	avatar,
	links,
	socials = 0,
	socialPlace = 'top',
	showName = true,
	size = 'small',
	coverImage,
	bgImage,
	bgDim = 0.75,
}: {
	look: ResolvedAppearance
	name: string
	bio?: string
	avatar: string | null
	/** Link titles. The first is drawn as the featured link. */
	links: string[]
	socials?: number
	socialPlace?: SocialPlace
	showName?: boolean
	size?: 'small' | 'medium'
	/** The page's own picture, or one that comes with a look an AI made. */
	coverImage?: string | null
	bgImage?: string | null
	bgDim?: number
}) {
	const host = useRef<HTMLDivElement>(null)
	const shown = name.trim() || t('我的名字')
	const vars = Object.entries(look.vars)
		.map(([key, value]) => `${key}:${value}`)
		.join(';')
	const icons = socials ? `<nav class="socials">${SOCIALS.slice(0, socials).map(([icon, label]) => `<a aria-label="${esc(label)}">${iconSvg(icon, 20)}</a>`).join('')}</nav>` : ''
	const below = socialPlace === 'bottom'
	const html = `<div class="body" style="${esc(vars)}">${
		bgImage ? `<div class="page-bg" style="--dim:${bgDim}"><img src="/media/${esc(bgImage)}" alt="" loading="lazy"></div>` : ''
	}<main><header class="head"><div class="avatar">${avatar ? `<img src="/media/${esc(avatar)}" alt="" loading="lazy">` : esc(initials(shown))}</div><h1${showName ? '' : ' class="visually-hidden"'}>${esc(shown)}</h1>${
		bio.trim() ? `<p class="bio">${esc(bio)}</p>` : ''
	}${below ? '' : icons}</header>${coverImage ? `<figure class="cover"><img src="/media/${esc(coverImage)}" alt="" loading="lazy"></figure>` : ''}<div class="items">${links
		.map((title, index) => `<a class="link${index === 0 ? ' feat' : ''}"><span class="t"><b>${esc(title)}</b></span><span class="go">${iconSvg('arrowUpRight', 16)}</span></a>`)
		.join('')}</div>${below ? icons : ''}</main></div>`

	useEffect(() => void loadStylesheet(THEME_FONTS), [])

	useLayoutEffect(() => {
		const root = host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' })
		root.adoptedStyleSheets = [sheetFor(look.theme.id)]
		root.innerHTML = html
	}, [html, look.theme.id])

	return (
		<div className={`lib-mini ${size}`} data-ui aria-hidden="true">
			<div className="lib-bio" ref={host} />
		</div>
	)
}
