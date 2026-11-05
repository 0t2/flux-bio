import { emptyContent, emptyLink, newItem, type Item, type PageContent } from '../src/shared/content'
import type { StarterId } from '../src/shared/starters'

/**
 * Sample data for the landing page and its screenshots: one made-up person or
 * business per kind of page. Everything shown on fluxbio.link comes from here,
 * so a demo or a screenshot can be rebuilt for any kind of page (`pnpm shots`).
 * Names and pictures are fictional; the words for each language are in
 * src/landing/sample/<code>.json.
 */
export type SampleWords = Record<StarterId, Record<string, string>>

export const PERSONA_NAMES: Record<StarterId, string> = {
	creator: 'Mika Lin',
	shop: 'Island Coffee',
	event: 'Flux Meetup',
	pro: 'Wen Chang',
	org: 'Harbor Club',
}

/** Addresses, so a page can be published and its short links seeded with numbers. */
export const PERSONA_HANDLES: Record<StarterId, string> = { creator: 'mika', shop: 'island', event: 'flux', pro: 'wen', org: 'harbor' }

const AVATARS: Record<StarterId, string> = {
	creator: 'avatar-mika.webp',
	shop: 'avatar-island.webp',
	event: 'avatar-flux.webp',
	pro: 'avatar-wen.webp',
	org: 'avatar-harbor.webp',
}

/** Their own cover picture, when they have one. */
export const PERSONA_COVERS: Partial<Record<StarterId, string>> = {
	creator: 'cover-night.webp',
	shop: 'cover-corner.webp',
	event: 'cover-stage.webp',
	org: 'cover-garden.webp',
}

type Icon = Extract<Item, { kind: 'link' }>['icon']

function link(id: string, title: string, slug: string, icon: Icon, patch: { subtitle?: string; featured?: boolean } = {}): Item {
	return { ...emptyLink(), id: `link-${slug}`.slice(0, 32), title, subtitle: patch.subtitle ?? '', url: `https://example.com/${id}`, slug, icon, featured: patch.featured ?? false }
}

const SOCIALS: Record<StarterId, [PageContent['socials'][number]['platform'], string][]> = {
	creator: [['instagram', 'instagram'], ['youtube', 'youtube'], ['threads', 'threads'], ['tiktok', 'tiktok'], ['x', 'x'], ['email', 'email']],
	shop: [['instagram', 'instagram'], ['line', 'line'], ['facebook', 'facebook']],
	event: [['instagram', 'instagram'], ['x', 'x'], ['github', 'github']],
	pro: [['website', 'website'], ['github', 'github'], ['email', 'email']],
	org: [['facebook', 'facebook'], ['line', 'line'], ['email', 'email']],
}

const ITEMS: Record<StarterId, (w: Record<string, string>) => Item[]> = {
	creator: (w) => [
		link('watch', w.watch!, 'watch', 'play', { subtitle: w.watchSub!, featured: true }),
		link('recipes', w.recipes!, 'recipes', 'gift'),
		link('favorites', w.favorites!, 'favorites', 'heart'),
		link('work', w.work!, 'work', 'mail'),
	],
	shop: (w) => [
		link('order', w.order!, 'order', 'shop', { subtitle: w.orderSub!, featured: true }),
		link('menu', w.menu!, 'menu', 'book'),
		link('class', w.class!, 'class', 'calendar'),
		{
			...newItem('product'),
			id: 'shop-picks',
			title: w.picks!,
			products: [
				{ id: 'pick-blend', name: w.blend!, price: 'NT$ 480', image: 'product-beans.webp', url: 'https://example.com/blend' },
				{ id: 'pick-dripper', name: w.dripper!, price: 'NT$ 880', image: 'product-dripper.webp', url: 'https://example.com/dripper' },
			],
		} as Item,
		{ ...newItem('hours'), id: 'shop-hours', title: w.hours!, address: w.address! } as Item,
	],
	event: (w) => [
		link('register', w.register!, 'register', 'calendar', { subtitle: w.registerSub!, featured: true }),
		link('schedule', w.schedule!, 'schedule', 'doc'),
		link('venue', w.venue!, 'venue', 'globe'),
		link('slides', w.slides!, 'slides', 'doc'),
		link('group', w.group!, 'group', 'chat'),
	],
	pro: (w) => [
		link('book', w.book!, 'book', 'calendar', { subtitle: w.bookSub!, featured: true }),
		link('services', w.services!, 'services', 'briefcase'),
		link('work', w.work!, 'portfolio', 'star'),
		link('clients', w.clients!, 'clients', 'chat'),
		link('mail', w.mail!, 'hello', 'mail'),
	],
	org: (w) => [
		link('walk', w.walk!, 'walk', 'globe', { subtitle: w.walkSub!, featured: true }),
		link('calendar', w.calendar!, 'calendar', 'calendar'),
		link('about', w.about!, 'about', 'book'),
		link('volunteer', w.volunteer!, 'volunteer', 'heart'),
		{
			...newItem('gallery'),
			id: 'org-gallery',
			title: w.around!,
			images: ['gallery-walk.webp', 'gallery-harvest.webp', 'gallery-table.webp'].map((image, index) => ({ id: `photo-${index + 1}`, image, alt: '', url: '' })),
		} as Item,
	],
}

/** One made-up page with its text in one language. Media ids are file names in public/_landing/. */
export function personaContent(id: StarterId, words: SampleWords): PageContent {
	const w = words[id]
	const content = emptyContent(PERSONA_NAMES[id])
	content.profile = { ...content.profile, bio: w.bio!, avatar: AVATARS[id] }
	content.socials = SOCIALS[id].map(([platform, name]) => ({ id: `social-${name}`, platform, url: platform === 'email' ? 'hello@example.com' : `https://example.com/${name}` }))
	content.items = ITEMS[id](w)
	content.showBadge = true
	return content
}
