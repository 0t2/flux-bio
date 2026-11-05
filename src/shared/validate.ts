import { fill, msg, type Message, type Params } from '../templates/msg'
import { isHttpUrl, socialHref, videoEmbed, type PageContent } from './content'
import { normalizeSlug, SLUG_PROBLEM_TEXT, slugProblem } from './slug'

export interface Problem {
	/** Dotted path into PageContent, e.g. "items.2.url". */
	path: string
	/** In zh-TW. */
	message: string
	/** The message as a translation key with its values, for the dashboard (see src/templates/msg.ts). */
	key?: string
	params?: Params
}

/** A problem's message as a key with values, e.g. for an ApiError. */
export const problemMessage = (problem: Problem): Message => ({ key: problem.key ?? problem.message, params: problem.params })

/**
 * Checks a draft before it goes public. Empty link cards (no URL) are allowed
 * and simply left out; anything half-filled is reported.
 */
export function publishProblems(content: PageContent, handle: string): Problem[] {
	const problems: Problem[] = []
	const report = (path: string, key: string, params: Params) => problems.push({ path, message: fill(key, params), key, params })
	const seen = new Map<string, number>()
	const handleSlug = normalizeSlug(handle)
	const badUrl = (value: string) => Boolean(value.trim()) && !isHttpUrl(value.trim())

	if (content.custom?.kind === 'html' && !content.custom.html.trim()) report('custom.html', msg('自訂 HTML 還是空的'), {})
	if (content.custom?.kind === 'redirect' && !isHttpUrl(content.custom.url.trim())) report('custom.url', msg('轉址的網址要以 http:// 或 https:// 開頭'), {})

	content.items.forEach((item, i) => {
		const n = i + 1
		const at = (field: string) => `items.${i}.${field}`
		switch (item.kind) {
			case 'link': {
				const url = item.url.trim()
				if (!url) {
					if (!item.hidden && item.title.trim()) report(at('url'), msg('第 {n} 項連結還沒填網址'), { n })
					return
				}
				if (!isHttpUrl(url)) report(at('url'), msg('第 {n} 項連結的網址要以 http:// 或 https:// 開頭'), { n })
				if (!item.hidden && !item.title.trim()) report(at('title'), msg('第 {n} 項連結還沒有標題'), { n })
				if (item.startsAt && item.endsAt && item.endsAt <= item.startsAt) {
					report(at('endsAt'), msg('第 {n} 項連結的下架時間要晚於上架時間'), { n })
				}
				const slug = normalizeSlug(item.slug)
				if (!slug) return
				const problem = slugProblem(slug)
				if (problem) report(at('slug'), msg('第 {n} 項連結：{problem}'), { n, problem: { key: SLUG_PROBLEM_TEXT[problem] } })
				else if (slug === handleSlug) report(at('slug'), msg('第 {n} 項連結的代稱和頁面的網址代稱相同'), { n })
				else if (seen.has(slug)) {
					report(at('slug'), msg('第 {n} 項連結的代稱和第 {first} 項重複'), { n, first: (seen.get(slug) ?? 0) + 1 })
				} else seen.set(slug, i)
				return
			}
			case 'video':
				if (item.url.trim() && !videoEmbed(item.url)) {
					report(at('url'), msg('第 {n} 項影片：請貼 YouTube 或 Vimeo 的影片網址'), { n })
				}
				return
			case 'gallery':
				item.images.forEach((image, j) => {
					if (badUrl(image.url)) report(at(`images.${j}.url`), msg('第 {n} 項圖片輪播：第 {image} 張圖的連結格式不正確'), { n, image: j + 1 })
				})
				return
			case 'product':
				item.products.forEach((product, j) => {
					if (badUrl(product.url)) report(at(`products.${j}.url`), msg('第 {n} 項商品卡：第 {product} 個商品的連結格式不正確'), { n, product: j + 1 })
					if (!item.hidden && !product.name.trim() && (product.url.trim() || product.image)) {
						report(at(`products.${j}.name`), msg('第 {n} 項商品卡：第 {product} 個商品還沒有名稱'), { n, product: j + 1 })
					}
				})
				if (badUrl(item.moreUrl)) report(at('moreUrl'), msg('第 {n} 項商品卡：「看全部商品」的連結格式不正確'), { n })
				return
			case 'hours':
				item.week.forEach((openings, day) => {
					if (openings.some((opening) => opening.open === opening.close)) {
						report(at(`week.${day}`), msg('第 {n} 項營業時間：開門和打烊時間不能一樣'), { n })
					}
				})
				return
			case 'heading':
				return
		}
	})

	content.socials.forEach((social, i) => {
		if (social.url.trim() && !socialHref(social.platform, social.url)) {
			report(`socials.${i}.url`, msg('第 {n} 個社群圖示的網址格式不正確'), { n: i + 1 })
		}
	})

	if (content.lineButton?.trim() && !socialHref('line', content.lineButton)) report('lineButton', msg('右下角 LINE 按鈕的網址格式不正確'), {})

	return problems
}
