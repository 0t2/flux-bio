import { msg } from '../templates/msg'
import { ENGLISH, STARTER_WORDS } from './serverWords'
import { emptyContent, emptyLink, newId, newItem, newProduct, type Item, type Locale, type LinkItem, type PageContent, type ThemeId } from './content'

/**
 * Ready-made pages to start from: the empty links page offers these, and so
 * does "新增頁面". Links are left without URLs for the owner to fill in;
 * publishing points out the ones still missing.
 *
 * The text is in zh-TW; the dashboard passes its t() as `translate` so the
 * owner starts in the dashboard's language, and the API passes starterWords().
 */

export const STARTER_IDS = ['creator', 'shop', 'event', 'pro', 'org'] as const
export type StarterId = (typeof STARTER_IDS)[number]

export const STARTER_LABELS: Record<StarterId, { label: string; hint: string }> = {
	creator: { label: msg('創作者'), hint: msg('影片、免費資源、合作洽詢') },
	shop: { label: msg('小店'), hint: msg('商品、營業時間、地圖') },
	event: { label: msg('活動報名'), hint: msg('報名連結、議程、地點') },
	pro: { label: msg('專業人士'), hint: msg('服務項目、預約、作品') },
	org: { label: msg('社團組織'), hint: msg('近期活動、加入方式、贊助') },
}

/** Turns a zh-TW key into the text to use, e.g. the dashboard's t(). */
export type Translate = (key: string) => string

const asIs: Translate = (key) => key

/** Starter text in a language, for the Worker, which doesn't have the dashboard's dictionaries. */
export function starterWords(locale: Locale): Translate {
	const words = STARTER_WORDS[locale]
	return words ? (key) => words[key] ?? ENGLISH[key] ?? key : asIs
}

export function starterItems(id: StarterId, translate: Translate = asIs): Item[] {
	const link = (title: string, patch: Partial<Omit<LinkItem, 'kind' | 'id'>> = {}): LinkItem => ({
		...emptyLink(),
		...patch,
		title: translate(title),
		subtitle: patch.subtitle ? translate(patch.subtitle) : '',
	})
	switch (id) {
		case 'creator':
			return [
				link(msg('最新作品'), { subtitle: msg('這週剛發布'), icon: 'play', featured: true }),
				link(msg('免費資源下載'), { icon: 'doc' }),
				link(msg('合作洽詢'), { icon: 'briefcase' }),
				link(msg('加入 LINE 官方帳號'), { icon: 'chat' }),
				{ ...newItem('video'), title: translate(msg('頻道精選')) },
			]
		case 'shop': {
			const hours = newItem('hours')
			return [
				link(msg('線上點餐・到店自取'), { subtitle: msg('提前下單，到店直接拿'), icon: 'shop', featured: true }),
				{ ...newItem('heading'), title: translate(msg('本週推薦')) },
				{
					...newItem('product'),
					products: [
						{ ...newProduct(), name: translate(msg('招牌商品')), price: 'NT$ 160' },
						{ ...newProduct(), name: translate(msg('季節限定')), price: 'NT$ 150' },
					],
				},
				newItem('gallery'),
				{ ...hours, title: translate(hours.title), address: '' },
			]
		}
		case 'event':
			return [
				link(msg('立即報名'), { subtitle: msg('名額有限，額滿為止'), icon: 'calendar', featured: true }),
				{ ...newItem('heading'), title: translate(msg('活動資訊')) },
				link(msg('活動議程'), { icon: 'doc' }),
				link(msg('交通與地點'), { icon: 'globe' }),
				{ ...newItem('video'), title: translate(msg('上一屆活動精華')) },
			]
		// Freelancers, consultants, teachers, sales: a business card that keeps working.
		case 'pro':
			return [
				link(msg('預約諮詢'), { subtitle: msg('先聊聊你的需求'), icon: 'calendar', featured: true }),
				{ ...newItem('heading'), title: translate(msg('服務項目')) },
				link(msg('服務內容與報價'), { icon: 'briefcase' }),
				link(msg('作品與案例'), { icon: 'doc' }),
				{ ...newItem('heading'), title: translate(msg('聯絡方式')) },
				link(msg('寄信給我'), { icon: 'mail' }),
				link(msg('用 LINE 聯絡我'), { icon: 'chat' }),
			]
		// Clubs, associations, nonprofits, schools.
		case 'org':
			return [
				link(msg('加入我們'), { subtitle: msg('入會方式和下次聚會時間'), icon: 'heart', featured: true }),
				{ ...newItem('heading'), title: translate(msg('近期活動')) },
				link(msg('活動行事曆'), { icon: 'calendar' }),
				link(msg('上次活動紀錄'), { icon: 'camera' }),
				{ ...newItem('heading'), title: translate(msg('認識我們')) },
				link(msg('關於我們'), { icon: 'book' }),
				link(msg('贊助與捐款'), { icon: 'gift' }),
				link(msg('聯絡我們'), { icon: 'mail' }),
			]
	}
}

const STARTER_THEMES: Record<StarterId, ThemeId> = { creator: 'brutal', shop: 'jelly', event: 'aurora', pro: 'notebook', org: 'minimal' }

const STARTER_BIOS: Record<StarterId, string> = {
	creator: msg('一句話介紹你在做什麼'),
	shop: msg('一句話介紹你的店・地區'),
	event: msg('日期・地點・一句話介紹活動'),
	pro: msg('一句話介紹你的專長和服務對象'),
	org: msg('一句話介紹你們在做什麼'),
}

export function starterContent(id: StarterId, name: string, translate: Translate = asIs): PageContent {
	const content = emptyContent(name)
	content.appearance.theme = STARTER_THEMES[id]
	content.items = starterItems(id, translate)
	content.profile.bio = translate(STARTER_BIOS[id])
	return content
}

/** A starter for looking at: visitors never see a link without a URL, so its links get a stand-in here. */
export function starterPreview(id: StarterId, name: string, translate: Translate = asIs): PageContent {
	const content = starterContent(id, name, translate)
	content.items = content.items.map((item) => (item.kind === 'link' && !item.url ? { ...item, url: '#' } : item))
	return content
}

/** A copy of a page with fresh item ids and no short link slugs, so publishing it creates new short links. */
export function duplicateContent(content: PageContent): PageContent {
	const copy = structuredClone(content)
	copy.items = copy.items.map((item) => {
		const fresh = { ...item, id: newId() }
		if (fresh.kind === 'link') fresh.slug = ''
		if (fresh.kind === 'product') fresh.products = fresh.products.map((product) => ({ ...product, id: newId() }))
		if (fresh.kind === 'gallery') fresh.images = fresh.images.map((image) => ({ ...image, id: newId() }))
		return fresh
	})
	copy.socials = copy.socials.map((social) => ({ ...social, id: newId() }))
	copy.seo.autoImage = null
	copy.seo.autoImageKey = ''
	return copy
}
