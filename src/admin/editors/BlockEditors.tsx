import { useRef, useState } from 'react'
import {
	GALLERY_LIMIT,
	newId,
	newProduct,
	PRODUCT_LIMIT,
	videoEmbed,
	type GalleryItem,
	type HeadingItem,
	type Product,
	type ProductItem,
	type VideoItem,
} from '../../shared/content'
import { Icon } from '../components/Icon'
import { toast } from '../components/ui'
import { t } from '../i18n'
import { uploadImage } from '../lib/image'
import type { EditorProps } from './types'

const fieldId = (item: { id: string }, name: string) => `item-${item.id}-${name}`

function move<T>(list: T[], index: number, delta: number): T[] {
	const next = list.slice()
	const target = index + delta
	if (target < 0 || target >= next.length) return next
	;[next[index], next[target]] = [next[target]!, next[index]!]
	return next
}

/** Up / down / remove for a row inside a block. */
function RowActions({ index, count, onMove, onRemove, label }: { index: number; count: number; onMove: (delta: number) => void; onRemove: () => void; label: string }) {
	return (
		<span className="row-actions">
			<button type="button" className="icon-btn" aria-label={t('{label}上移', { label })} disabled={index === 0} onClick={() => onMove(-1)}>
				<Icon name="arrowUp" size={16} />
			</button>
			<button type="button" className="icon-btn" aria-label={t('{label}下移', { label })} disabled={index === count - 1} onClick={() => onMove(1)}>
				<Icon name="arrowDown" size={16} />
			</button>
			<button type="button" className="icon-btn" aria-label={t('移除{label}', { label })} onClick={onRemove}>
				<Icon name="trash" size={16} />
			</button>
		</span>
	)
}

export function HeadingEditor({ item, set }: EditorProps<HeadingItem>) {
	return (
		<>
			<div className="field">
				<label htmlFor={fieldId(item, 'title')}>{t('標題')}</label>
				<input id={fieldId(item, 'title')} className="input" maxLength={80} value={item.title} onChange={(event) => set({ title: event.target.value })} placeholder={t('例如：合作')} />
			</div>
		</>
	)
}

export function VideoEditor({ item, set, invalid }: EditorProps<VideoItem>) {
	const video = item.url.trim() ? videoEmbed(item.url) : null
	return (
		<>
			<div className="field">
				<label htmlFor={fieldId(item, 'url')}>{t('影片網址')}</label>
				<input
					id={fieldId(item, 'url')}
					className="input mono"
					type="url"
					inputMode="url"
					maxLength={2048}
					value={item.url}
					aria-invalid={invalid('url') ?? (item.url.trim() && !video ? true : undefined)}
					onChange={(event) => set({ url: event.target.value })}
					placeholder="https://youtu.be/…"
				/>
				<span className="hint">{item.url.trim() && !video ? t('這不是 YouTube 或 Vimeo 的影片網址。') : t('YouTube（含 Shorts）或 Vimeo。訪客按下播放才會載入影片。')}</span>
			</div>
			{video?.thumbnail && <img className="video-thumb" src={video.thumbnail} alt={t('影片封面')} />}
			<div className="field">
				<label htmlFor={fieldId(item, 'title')}>{t('影片標題（選填）')}</label>
				<input id={fieldId(item, 'title')} className="input" maxLength={80} value={item.title} onChange={(event) => set({ title: event.target.value })} placeholder={t('顯示在影片下方')} />
			</div>
		</>
	)
}

/** A button that picks image files and uploads them. */
function UploadButton({
	label,
	multiple,
	disabled,
	square,
	onUploaded,
}: {
	label: string
	multiple?: boolean
	disabled?: boolean
	square?: boolean
	onUploaded: (ids: string[]) => void
}) {
	const input = useRef<HTMLInputElement>(null)
	const [busy, setBusy] = useState(false)
	async function onFiles(files: FileList | null) {
		if (!files?.length) return
		setBusy(true)
		const ids: string[] = []
		try {
			for (const file of [...files]) {
				ids.push(await uploadImage(file, square ? { maxWidth: 800, maxHeight: 800, square: true } : { maxWidth: 1400, maxHeight: 1400 }))
			}
		} catch (error) {
			toast(error instanceof Error ? error.message : t('上傳失敗'))
		} finally {
			setBusy(false)
			if (input.current) input.current.value = ''
			if (ids.length) onUploaded(ids)
		}
	}
	return (
		<>
			<button type="button" className="btn small" disabled={disabled || busy} onClick={() => input.current?.click()}>
				<Icon name="upload" size={16} />
				{busy ? t('上傳中…') : label}
			</button>
			<input ref={input} type="file" accept="image/*" multiple={multiple} hidden onChange={(event) => onFiles(event.target.files)} />
		</>
	)
}

export function GalleryEditor({ item, set, invalid }: EditorProps<GalleryItem>) {
	const left = GALLERY_LIMIT - item.images.length
	return (
		<>
			<div className="field">
				<label htmlFor={fieldId(item, 'title')}>{t('標題（選填）')}</label>
				<input id={fieldId(item, 'title')} className="input" maxLength={80} value={item.title} onChange={(event) => set({ title: event.target.value })} placeholder={t('例如：店內照片')} />
			</div>
			<ol className="sub-list">
				{item.images.map((image, index) => (
					<li key={image.id} className="sub-row">
						<img className="sub-thumb wide" src={`/media/${image.image}`} alt="" />
						<div className="sub-fields">
							<label className="sr-only" htmlFor={fieldId(image, 'alt')}>
								{t('第 {number} 張圖的說明', { number: index + 1 })}
							</label>
							<input
								id={fieldId(image, 'alt')}
								className="input"
								maxLength={120}
								value={image.alt}
								placeholder={t('圖片說明（給看不到圖的人）')}
								onChange={(event) => set({ images: item.images.map((entry) => (entry.id === image.id ? { ...entry, alt: event.target.value } : entry)) })}
							/>
							<label className="sr-only" htmlFor={fieldId(image, 'url')}>
								{t('第 {number} 張圖的連結', { number: index + 1 })}
							</label>
							<input
								id={fieldId(image, 'url')}
								className="input mono"
								type="url"
								maxLength={2048}
								value={image.url}
								placeholder={t('點圖片時前往的網址（選填）')}
								aria-invalid={invalid(`images.${index}.url`)}
								onChange={(event) => set({ images: item.images.map((entry) => (entry.id === image.id ? { ...entry, url: event.target.value } : entry)) })}
							/>
						</div>
						<RowActions
							index={index}
							count={item.images.length}
							label={t('這張圖')}
							onMove={(delta) => set({ images: move(item.images, index, delta) })}
							onRemove={() => set({ images: item.images.filter((entry) => entry.id !== image.id) })}
						/>
					</li>
				))}
			</ol>
			<div className="row-start">
				<UploadButton
					label={item.images.length ? t('加入更多圖片') : t('上傳圖片')}
					multiple
					disabled={left <= 0}
					onUploaded={(ids) =>
						set({ images: [...item.images, ...ids.slice(0, Math.max(0, left)).map((id) => ({ id: newId(), image: id, alt: '', url: '' }))] })
					}
				/>
				<span className="hint">{left > 0 ? t('還可以放 {count} 張，建議橫式 7:5。', { count: left }) : t('最多 {limit} 張。', { limit: GALLERY_LIMIT })}</span>
			</div>
		</>
	)
}

export function ProductEditor({ item, set, invalid }: EditorProps<ProductItem>) {
	const setProduct = (id: string, patch: Partial<Product>) =>
		set({ products: item.products.map((product) => (product.id === id ? { ...product, ...patch } : product)) })
	return (
		<>
			<div className="field">
				<label htmlFor={fieldId(item, 'title')}>{t('標題（選填）')}</label>
				<input id={fieldId(item, 'title')} className="input" maxLength={80} value={item.title} onChange={(event) => set({ title: event.target.value })} placeholder={t('例如：本週推薦')} />
			</div>
			<ol className="sub-list">
				{item.products.map((product, index) => (
					<li key={product.id} className="sub-row">
						<div className="sub-thumb-col">
							{product.image ? <img className="sub-thumb" src={`/media/${product.image}`} alt="" /> : <span className="sub-thumb empty" aria-hidden="true"><Icon name="bag" size={22} /></span>}
							{product.image ? (
								<button type="button" className="btn small" onClick={() => setProduct(product.id, { image: null })}>
									{t('移除照片')}
								</button>
							) : (
								<UploadButton label={t('商品照')} square onUploaded={([id]) => id && setProduct(product.id, { image: id })} />
							)}
						</div>
						<div className="sub-fields">
							<label className="sr-only" htmlFor={fieldId(product, 'name')}>
								{t('第 {number} 個商品的名稱', { number: index + 1 })}
							</label>
							<input
								id={fieldId(product, 'name')}
								className="input"
								maxLength={60}
								value={product.name}
								placeholder={t('商品名稱')}
								aria-invalid={invalid(`products.${index}.name`)}
								onChange={(event) => setProduct(product.id, { name: event.target.value })}
							/>
							<label className="sr-only" htmlFor={fieldId(product, 'price')}>
								{t('第 {number} 個商品的價格', { number: index + 1 })}
							</label>
							<input
								id={fieldId(product, 'price')}
								className="input"
								maxLength={30}
								value={product.price}
								placeholder={t('價格，例如 NT$ 160')}
								onChange={(event) => setProduct(product.id, { price: event.target.value })}
							/>
							<label className="sr-only" htmlFor={fieldId(product, 'url')}>
								{t('第 {number} 個商品的購買連結', { number: index + 1 })}
							</label>
							<input
								id={fieldId(product, 'url')}
								className="input mono"
								type="url"
								maxLength={2048}
								value={product.url}
								placeholder={t('購買連結 https://')}
								aria-invalid={invalid(`products.${index}.url`)}
								onChange={(event) => setProduct(product.id, { url: event.target.value })}
							/>
						</div>
						<RowActions
							index={index}
							count={item.products.length}
							label={t('這個商品')}
							onMove={(delta) => set({ products: move(item.products, index, delta) })}
							onRemove={() => set({ products: item.products.filter((entry) => entry.id !== product.id) })}
						/>
					</li>
				))}
			</ol>
			<div className="row-start">
				<button type="button" className="btn small" disabled={item.products.length >= PRODUCT_LIMIT} onClick={() => set({ products: [...item.products, newProduct()] })}>
					<Icon name="plus" size={16} />
					{t('新增商品')}
				</button>
				<span className="hint">{t('最多 {limit} 個，兩個一排。點商品會算進數據。', { limit: PRODUCT_LIMIT })}</span>
			</div>
			<div className="field">
				<label htmlFor={fieldId(item, 'more')}>{t('「看全部商品」連結（選填）')}</label>
				<input
					id={fieldId(item, 'more')}
					className="input mono"
					type="url"
					maxLength={2048}
					value={item.moreUrl}
					placeholder={t('https://你的商店')}
					aria-invalid={invalid('moreUrl')}
					onChange={(event) => set({ moreUrl: event.target.value })}
				/>
			</div>
		</>
	)
}
