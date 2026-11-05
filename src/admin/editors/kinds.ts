import type { Item, ItemKind } from '../../shared/content'
import type { IconName } from '../../templates/icons'
import { linkIconName } from '../../templates/icons'
import { msg, t } from '../i18n'

/** How each kind of item is named and drawn in the editor. The texts are keys: show them with t(). */
export const KIND_META: Record<ItemKind, { label: string; add: string; sub: string; icon: IconName }> = {
	link: { label: msg('[block]連結'), add: msg('連結按鈕'), sub: msg('每個連結都有自己的短網址'), icon: 'link' },
	heading: { label: msg('[block]標題'), add: msg('標題文字'), sub: msg('把連結分組'), icon: 'heading' },
	video: { label: msg('影片'), add: msg('影片'), sub: msg('貼上 YouTube 或 Vimeo 網址'), icon: 'video' },
	gallery: { label: msg('圖片輪播'), add: msg('圖片輪播'), sub: msg('最多 10 張圖'), icon: 'image' },
	product: { label: msg('商品卡'), add: msg('商品卡'), sub: msg('名稱、價格、購買連結'), icon: 'bag' },
	hours: { label: msg('營業時間'), add: msg('營業時間與地圖'), sub: msg('自動顯示營業中或休息中'), icon: 'map' },
}

export function itemIcon(item: Item): IconName {
	if (item.kind === 'link') return linkIconName(item) ?? 'link'
	return KIND_META[item.kind].icon
}

/** The name shown in the list, in the dashboard's language; falls back to what the item is. */
export function itemTitle(item: Item): string {
	switch (item.kind) {
		case 'link':
		case 'heading':
		case 'video':
		case 'hours':
			return item.title.trim() || (item.kind === 'link' ? t('未命名連結') : t(KIND_META[item.kind].label))
		case 'gallery':
			return item.title.trim() || t('圖片輪播・{count} 張', { count: item.images.length })
		case 'product':
			return item.title.trim() || item.products.map((product) => product.name.trim()).filter(Boolean).join('、') || t('商品卡')
	}
}
