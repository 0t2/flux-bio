import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import type { LinkJson } from '../../shared/api'
import type { Settings } from '../../shared/content'
import { DEFAULT_QR_STYLE, defaultQrLogo, QrStyleSchema, type QrStyle } from '../../shared/qr'
import { ApiError, request } from '../api'
import { QrDesigner } from '../components/QrDesigner'
import { Breadcrumb } from '../components/ui'
import { t } from '../i18n'
import { uploadImage } from '../lib/image'
import { useApp } from '../state/app'
import { useOptionalPage } from '../state/page'
import { Loading } from '../components/Loading'

const SAVE_DELAY = 600

export function QrPage({ id }: { id: string }) {
	const app = useApp()
	const page = useOptionalPage()
	const [link, setLink] = useState<LinkJson | null>(null)
	const [style, setStyle] = useState<QrStyle>(DEFAULT_QR_STYLE)
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
	const timer = useRef(0)

	useEffect(() => {
		let cancelled = false
		request<{ link: LinkJson }>(`/links/${id}`)
			.then(({ link: result }) => {
				if (cancelled) return
				setLink(result)
				const parsed = QrStyleSchema.safeParse(result.qr)
				if (parsed.success) setStyle(parsed.data)
			})
			.catch((caught) => !cancelled && setError(caught instanceof ApiError ? caught.message : t('讀取失敗')))
		return () => {
			cancelled = true
			window.clearTimeout(timer.current)
		}
	}, [id])

	// The style is saved with the link, so its 下載 PNG on the short links page matches.
	function change(next: QrStyle) {
		setStyle(next)
		setSaved('saving')
		window.clearTimeout(timer.current)
		timer.current = window.setTimeout(() => {
			request(`/links/${id}`, { method: 'PATCH', json: { qr: next } })
				.then(() => setSaved('saved'))
				.catch(() => setSaved('error'))
		}, SAVE_DELAY)
	}

	if (error) {
		return (
			<div className="banner" role="alert">
				{error} <Link href="/short-links">{t('回到短網址')}</Link>
			</div>
		)
	}
	if (!link) return <Loading inline />

	const owner = app.pages.find((entry) => entry.id === link.pageId)

	async function setDefault(scope: 'page' | 'site', media: string) {
		if (scope === 'site') {
			const { settings } = await request<{ settings: Settings }>('/settings', { method: 'PUT', json: { qrLogo: media } })
			app.setSettings(settings)
		} else if (owner) {
			await request(`/pages/${owner.id}`, { method: 'PATCH', json: { qrLogo: media } })
			await app.refresh()
		}
	}

	const avatar = owner?.avatar ?? (page ? page.draft.profile.avatar : app.current?.avatar)
	return (
		<>
			<Breadcrumb items={[{ href: '/short-links', label: t('短網址') }, { href: `/short-links?select=${link.id}`, label: link.slug }, { label: 'QR Code' }]} />
			<div className="page-head">
				<div>
					<h1>{t('QR Code 樣式')}</h1>
					<p>{t('掃描進來也算一次點擊，來源會記成「QR Code」。樣式會跟著這個短網址儲存。')}</p>
				</div>
				<span className="save-state" role="status">
					{saved === 'saving' ? t('儲存中…') : saved === 'saved' ? t('已儲存樣式') : saved === 'error' ? t('儲存失敗') : ''}
				</span>
			</div>
			<QrDesigner
				value={`${link.short}?s=qr`}
				caption={`${app.host}/${link.slug}`}
				fileName={`qr-${link.slug}`}
				style={style}
				onChange={change}
				avatarUrl={avatar ? `/media/${avatar}` : null}
				pages={app.settings.bio}
				pageName={owner?.name || owner?.handle || null}
				defaultImage={defaultQrLogo(owner?.qrLogo, app.settings.qrLogo)}
				onSetDefault={setDefault}
				uploadImage={(file) => uploadImage(file, { maxWidth: 512, maxHeight: 512, square: true })}
			/>
		</>
	)
}
