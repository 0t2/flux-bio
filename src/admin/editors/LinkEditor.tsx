import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { isHttpUrl, LINK_ICONS, type LinkIcon, type LinkItem } from '../../shared/content'
import { LINK_ICON_LABELS } from '../../templates/icons'
import { ApiError } from '../api'
import { Icon } from '../components/Icon'
import { CopyButton, toast, Toggle } from '../components/ui'
import { t } from '../i18n'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { useApp } from '../state/app'
import { usePage } from '../state/page'
import type { EditorProps } from './types'

export function LinkEditor({ item, set, invalid }: EditorProps<LinkItem>) {
	const app = useApp()
	const page = usePage()
	const [sharing, setSharing] = useState(false)
	const [slug, setSlug] = useState(item.slug)
	const [made, setMade] = useState(false)
	const [shareError, setShareError] = useState<string | null>(null)
	const id = (name: string) => `item-${item.id}-${name}`
	const hasUrl = isHttpUrl(item.url.trim())

	useEffect(() => setSlug(item.slug), [item.slug])

	async function makeShort(wanted?: string) {
		setShareError(null)
		try {
			const link = await page.shortLink(item.id, wanted)
			setSlug(link.slug)
			setMade(true)
			if (wanted !== undefined) toast(t('已儲存，立即生效'))
		} catch (caught) {
			setShareError(caught instanceof ApiError ? caught.message : t('儲存失敗'))
		}
	}

	function share() {
		if (!sharing && hasUrl) void makeShort()
		setSharing(!sharing)
	}

	function commitSlug() {
		const value = slug.trim()
		if (!value) setSlug(item.slug)
		else if (value !== item.slug) void makeShort(value)
	}
	return (
		<>
			<div className="field">
				<label htmlFor={id('title')}>{t('標題')}</label>
				<input
					id={id('title')}
					className="input"
					maxLength={80}
					value={item.title}
					aria-invalid={invalid('title')}
					onChange={(event) => set({ title: event.target.value })}
					placeholder={t('例如：最新教學影片')}
				/>
			</div>
			<div className="field">
				<label htmlFor={id('subtitle')}>{t('說明文字（選填）')}</label>
				<input
					id={id('subtitle')}
					className="input"
					maxLength={120}
					value={item.subtitle}
					onChange={(event) => set({ subtitle: event.target.value })}
					placeholder={t('顯示在標題下方的一行小字')}
				/>
			</div>
			<div className="field">
				<label htmlFor={id('url')}>{t('目的網址')}</label>
				<input
					id={id('url')}
					className="input mono"
					type="url"
					inputMode="url"
					maxLength={2048}
					value={item.url}
					aria-invalid={invalid('url')}
					onChange={(event) => set({ url: event.target.value })}
					placeholder="https://"
				/>
			</div>
			<div className="field">
				<span className="label">{t('隱藏原始網址')}</span>
				<span className="inline-toggle">
					<Toggle on={Boolean(item.hideUrl)} onChange={(hideUrl) => set({ hideUrl })} label={t('隱藏原始網址')} />
					{t('按鈕改走短網址，訪客點之前看不到目的地，適合聯盟行銷連結，點擊也算得最準。設了密碼、UTM 或裝置導向的連結一律走短網址。')}
				</span>
			</div>
			<div className="link-share">
				<button type="button" className="btn small" aria-expanded={sharing || Boolean(invalid('slug'))} onClick={share}>
					<Icon name="link" size={16} />
					{t('分享')}
				</button>
			</div>
			{(sharing || invalid('slug')) && !hasUrl && <p className="hint">{t('填好目的網址，就能產生短網址。')}</p>}
			{(sharing || invalid('slug')) && hasUrl && <div className="short-box">
				<div className="short-box-main">
					<label htmlFor={id('slug')} className="sr-only">
						{t('短網址代稱')}
					</label>
					<div className="prefixed">
						<span>{app.host}/</span>
						<input
							id={id('slug')}
							maxLength={64}
							value={slug}
							aria-invalid={invalid('slug') ?? (shareError ? true : undefined)}
							onChange={(event) => setSlug(event.target.value)}
							onBlur={commitSlug}
							onKeyDown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault()
									event.currentTarget.blur()
								}
							}}
						/>
					</div>
					{shareError ? <span className="hint" role="alert">{shareError}</span> : <span className="hint">{t('代稱可以自訂，也能用中文。改了馬上生效，舊的短網址會失效。')}</span>}
				</div>
				{made && <CopyButton text={`${app.origin}/${encodeURIComponent(item.slug)}`} label={t('複製')} done={t('已複製')} />}
				<Link href={`/short-links?select=${item.id}`} className="short-box-link">
					{t('短網址設定')}
				</Link>
			</div>}
			<div className="field-row">
				<div className="field">
					<label htmlFor={id('start')}>{t('開放時間')}</label>
					<input
						id={id('start')}
						className="input"
						type="datetime-local"
						value={toLocalInput(item.startsAt)}
						onChange={(event) => set({ startsAt: fromLocalInput(event.target.value) })}
					/>
					<span className="hint">{t('空白＝立即')}</span>
				</div>
				<div className="field">
					<label htmlFor={id('end')}>{t('到期日')}</label>
					<input
						id={id('end')}
						className="input"
						type="datetime-local"
						value={toLocalInput(item.endsAt)}
						aria-invalid={invalid('endsAt')}
						onChange={(event) => set({ endsAt: fromLocalInput(event.target.value) })}
					/>
					<span className="hint">{t('空白＝不設定；過了之後短網址會顯示「已過期」，並附上回到這一頁的按鈕')}</span>
				</div>
			</div>
			<div className="field-row">
				<div className="field">
					<label htmlFor={id('icon')}>{t('圖示')}</label>
					<select id={id('icon')} className="select" value={item.icon} onChange={(event) => set({ icon: event.target.value as LinkIcon })}>
						{LINK_ICONS.map((name) => (
							<option key={name} value={name}>
								{t(LINK_ICON_LABELS[name])}
							</option>
						))}
					</select>
				</div>
				<div className="field">
					<span className="label">{t('精選')}</span>
					<span className="inline-toggle">
						<Toggle on={item.featured} onChange={(featured) => set({ featured })} label={t('設為精選')} />
						{t('比其他連結更顯眼')}
					</span>
				</div>
			</div>
		</>
	)
}
