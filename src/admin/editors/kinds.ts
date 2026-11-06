import type { Item, ItemKind } from '../../shared/content'
import { EMBED_PROVIDERS, EMBEDS, type EmbedAction, type EmbedProvider } from '../../shared/embeds'
import type { IconName } from '../../templates/icons'
import { linkIconName } from '../../templates/icons'
import { msg, t } from '../i18n'

type BlockKind = Exclude<ItemKind, 'embed'>

/** How each kind of item is named and drawn in the editor. The texts are keys: show them with t(). An embed goes by its service. */
export const KIND_META: Record<BlockKind, { label: string; add: string; sub: string; icon: IconName }> = {
	link: { label: msg('[block]連結'), add: msg('連結按鈕'), sub: msg('每個連結都有自己的短網址'), icon: 'link' },
	heading: { label: msg('[block]標題'), add: msg('標題文字'), sub: msg('把連結分組'), icon: 'heading' },
	video: { label: msg('影片'), add: msg('影片'), sub: msg('貼上 YouTube 或 Vimeo 網址'), icon: 'video' },
	gallery: { label: msg('圖片輪播'), add: msg('圖片輪播'), sub: msg('最多 10 張圖'), icon: 'image' },
	product: { label: msg('商品卡'), add: msg('商品卡'), sub: msg('名稱、價格、購買連結'), icon: 'bag' },
	hours: { label: msg('營業時間'), add: msg('營業時間與地圖'), sub: msg('自動顯示營業中或休息中'), icon: 'map' },
}

/** An embed in the dashboard's words, by what its service's button does. `add` names the service. */
export const ACTION_META: Record<EmbedAction, { add: string; sub: string; note: string }> = {
	tip: { add: msg('{name} 贊助'), sub: msg('訪客點一下就能贊助你'), note: msg('例如：每一杯都會變成下一支影片') },
	book: { add: msg('{name} 預約'), sub: msg('訪客不用離開頁面就能預約'), note: msg('例如：30 分鐘的線上諮詢') },
}

/**
 * The choices under 新增區塊: every kind of block, then each embed service as a block of its own, since an owner looks
 * for "Ko-fi" or "Calendly", not for a kind. The card's editor can still switch services.
 */
export type BlockChoice = { kind: BlockKind } | { kind: 'embed'; provider: EmbedProvider }
export const BLOCK_CHOICES: BlockChoice[] = [
	...(Object.keys(KIND_META) as BlockKind[]).map((kind) => ({ kind })),
	...EMBED_PROVIDERS.map((provider) => ({ kind: 'embed' as const, provider })),
]

/** A choice under 新增區塊, in the dashboard's language. */
export function choiceText(choice: BlockChoice): { add: string; sub: string; icon: IconName } {
	if (choice.kind !== 'embed') return { add: t(KIND_META[choice.kind].add), sub: t(KIND_META[choice.kind].sub), icon: KIND_META[choice.kind].icon }
	const service = EMBEDS[choice.provider]
	return { add: t(ACTION_META[service.action].add, { name: service.name }), sub: t(ACTION_META[service.action].sub), icon: service.icon }
}

/** What an item is, in the dashboard's language: its tag and the line under its title in the list. */
export function kindText(item: Item): { label: string; sub: string } {
	if (item.kind !== 'embed') return { label: t(KIND_META[item.kind].label), sub: t(KIND_META[item.kind].sub) }
	const service = EMBEDS[item.provider]
	// A brand name, the same in every language.
	return { label: service.name, sub: t(ACTION_META[service.action].sub) }
}

export function itemIcon(item: Item): IconName {
	if (item.kind === 'link') return linkIconName(item) ?? 'link'
	if (item.kind === 'embed') return EMBEDS[item.provider].icon
	return KIND_META[item.kind].icon
}

/** The name shown in the list, in the dashboard's language; falls back to what the item is. */
export function itemTitle(item: Item): string {
	switch (item.kind) {
		case 'link':
		case 'heading':
		case 'video':
		case 'hours':
		case 'embed':
			return item.title.trim() || (item.kind === 'link' ? t('未命名連結') : kindText(item).label)
		case 'gallery':
			return item.title.trim() || t('圖片輪播・{count} 張', { count: item.images.length })
		case 'product':
			return item.title.trim() || item.products.map((product) => product.name.trim()).filter(Boolean).join('、') || t('商品卡')
	}
}
