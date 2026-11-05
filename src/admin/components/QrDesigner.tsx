import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'wouter'
import {
	contrastRatio,
	QR_BG_SWATCHES,
	QR_FG_SWATCHES,
	QR_FRAME_TEXT_MAX,
	QR_SIZE_IDS,
	QR_SIZES,
	qrSvg,
	relativeLuminance,
	type QrLogo,
	type QrShape,
	type QrStyle,
	type QrSwatch,
} from '../../shared/qr'
import { msg, t, tr } from '../i18n'
import { imageToDataUrl, pixelSize, qrPdf, qrPng } from '../lib/qrExport'
import { Icon } from './Icon'
import { Section, toast, Toggle } from './ui'
import '../qr.css'

export interface QrDesignerProps {
	/** The URL to encode. */
	value: string
	/** Shown under the preview, e.g. "fluxbio.link/lens". */
	caption: string
	/** Download base name, e.g. "qr-lens". */
	fileName: string
	style: QrStyle
	onChange: (style: QrStyle) => void
	/** The bio page avatar, e.g. "/media/<id>"; null when there is none. */
	avatarUrl: string | null
	/** Whether pages are on; off, there is nowhere to add an avatar, so without one the option isn't offered. */
	pages: boolean
	/** Uploads an image and resolves to its media id. */
	uploadImage: (file: File) => Promise<string>
	/** The page this link is on, to offer its default; null for a standalone link. */
	pageName: string | null
	/** What a code following the default shows now. */
	defaultImage: { media: string; from: 'page' | 'site' } | null
	onSetDefault: (scope: 'page' | 'site', media: string) => Promise<void>
}

type Format = 'png' | 'svg' | 'pdf'

const SHAPES: { id: QrShape; label: string }[] = [
	{ id: 'square', label: msg('方形') },
	{ id: 'rounded', label: msg('圓角') },
	{ id: 'dots', label: msg('圓點') },
]

const LOGOS: { id: QrLogo; label: string }[] = [
	{ id: 'default', label: msg('跟隨預設') },
	{ id: 'none', label: msg('不放') },
	{ id: 'avatar', label: msg('頭像') },
	{ id: 'mark', label: msg('FluxBio 標誌') },
	{ id: 'upload', label: msg('上傳圖片') },
]

/** Below this WCAG ratio some phone cameras can't tell the modules from the background. */
const MIN_CONTRAST = 4

const mediaUrl = (id: string) => `/media/${encodeURIComponent(id)}`

/** QR Code style editor with a live preview that is the real, scannable code. */
export function QrDesigner({ value, caption, fileName, style, onChange, avatarUrl, pages, uploadImage, pageName, defaultImage, onSetDefault }: QrDesignerProps) {
	const id = useId()
	const fileInput = useRef<HTMLInputElement>(null)
	// An upload resolves after later edits; it must merge into the newest style, not the one it started from.
	const latest = useRef(style)
	useLayoutEffect(() => {
		latest.current = style
	})
	const [uploading, setUploading] = useState(false)
	// A picture just uploaded: where it goes is asked once, and "only here" is what already happened.
	const [justUploaded, setJustUploaded] = useState<string | null>(null)
	const [settingDefault, setSettingDefault] = useState(false)
	const [busy, setBusy] = useState<Format | null>(null)
	const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

	const size = QR_SIZES[style.size]
	const defaultUrl = defaultImage ? mediaUrl(defaultImage.media) : null
	const logoUrl = style.logo === 'avatar' ? avatarUrl : style.logo === 'upload' && style.logoMedia ? mediaUrl(style.logoMedia) : style.logo === 'default' ? defaultUrl : null
	const preview = useMemo(() => {
		try {
			return qrSvg(value, style, { logoHref: logoUrl })
		} catch {
			return null
		}
	}, [value, style, logoUrl])
	const lowContrast = contrastRatio(style.fg, style.bg) < MIN_CONTRAST
	const inverted = !lowContrast && relativeLuminance(style.fg) > relativeLuminance(style.bg)

	function update(patch: Partial<QrStyle>) {
		setStatus(null)
		onChange({ ...latest.current, ...patch })
	}

	function pickLogo(logo: QrLogo) {
		// The first time, pick the file first; the option turns on once the upload is done.
		if (logo === 'upload' && !style.logoMedia) fileInput.current?.click()
		else update({ logo })
	}

	async function onFile(file: File | undefined) {
		if (!file) return
		setUploading(true)
		try {
			const media = await uploadImage(file)
			update({ logo: 'upload', logoMedia: media })
			setJustUploaded(media)
		} catch (error) {
			toast(error instanceof Error ? error.message : t('上傳失敗'))
		} finally {
			setUploading(false)
			if (fileInput.current) fileInput.current.value = ''
		}
	}

	async function makeDefault(scope: 'page' | 'site') {
		if (!justUploaded || settingDefault) return
		setSettingDefault(true)
		try {
			await onSetDefault(scope, justUploaded)
			update({ logo: 'default' })
			setJustUploaded(null)
			toast(scope === 'site' ? t('已設成全站預設，跟隨預設的 QR Code 都會換成這張') : t('已設成「{name}」頁面的預設，這個頁面跟隨預設的 QR Code 都會換成這張', { name: pageName ?? '' }))
		} catch (error) {
			toast(error instanceof Error ? error.message : t('儲存失敗，請稍後再試'))
		} finally {
			setSettingDefault(false)
		}
	}

	async function download(format: Format) {
		setBusy(format)
		setStatus(null)
		try {
			let logoHref: string | null = null
			if (logoUrl) {
				// Inline the image so it survives in the file and on the canvas.
				try {
					logoHref = await imageToDataUrl(logoUrl)
				} catch {
					setStatus({ ok: false, text: t('中間圖示載入失敗，請重新上傳或換一個圖示。') })
					return
				}
			}
			const svg = qrSvg(value, style, { logoHref })
			const blob =
				format === 'svg'
					? new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' })
					: format === 'png'
						? await qrPng(svg, pixelSize(style))
						: await qrPdf(svg, style)
			const name = `${fileName}-${t(size.label)}.${format}`
			saveFile(blob, name)
			setStatus({ ok: true, text: t('已下載 {name}', { name }) })
		} catch {
			setStatus({ ok: false, text: t('下載失敗，請再試一次') })
		} finally {
			setBusy(null)
		}
	}

	const downloadDisabled = busy !== null || preview === null

	return (
		<div className="qr-designer">
			<div className="qr-controls">
				<Section title={t('顏色')}>
					<SwatchRow label={t('圖案')} swatches={QR_FG_SWATCHES} value={style.fg} onPick={(fg) => update({ fg })} />
					<SwatchRow label={t('底色')} swatches={QR_BG_SWATCHES} value={style.bg} onPick={(bg) => update({ bg })} />
					{lowContrast && (
						<p className="qr-warning" role="status">
							<WarningIcon />
							{t('顏色太接近，有些手機可能掃不到。')}
						</p>
					)}
					{inverted && <p className="hint">{t('深色底配淺色圖案時，少數舊的掃描 App 讀不到，印之前先用手機試掃一次。')}</p>}
				</Section>

				<section className="section">
					<h2 id={`${id}-shape`} className="section-title">
						{t('點的形狀')}
					</h2>
					<div className="qr-choices" role="group" aria-labelledby={`${id}-shape`}>
						{SHAPES.map((option) => (
							<button
								key={option.id}
								type="button"
								className="option qr-choice"
								aria-pressed={style.shape === option.id}
								onClick={() => update({ shape: option.id })}
							>
								{t(option.label)}
							</button>
						))}
					</div>

					<h2 id={`${id}-logo`} className="section-title qr-subtitle">
						{t('中間圖示')}
					</h2>
					<div className="qr-choices" role="group" aria-labelledby={`${id}-logo`}>
						{LOGOS.filter((option) => option.id !== 'avatar' || avatarUrl || pages).map((option) => (
							<button
								key={option.id}
								type="button"
								className="option qr-choice"
								aria-pressed={style.logo === option.id}
								disabled={(option.id === 'avatar' && !avatarUrl) || (option.id === 'upload' && uploading)}
								onClick={() => pickLogo(option.id)}
							>
								{option.id === 'upload' && uploading && !style.logoMedia ? t('上傳中…') : t(option.label)}
							</button>
						))}
					</div>
					{!avatarUrl && pages && <p className="hint">{t('還沒有頭像，到「頁面」上傳後就能放在中間。')}</p>}
					{style.logo === 'default' &&
						(defaultImage && defaultUrl ? (
							<div className="qr-upload">
								<img src={defaultUrl} alt="" />
								<p className="hint">{defaultImage.from === 'page' ? t('目前用「{name}」頁面的預設圖片。', { name: pageName ?? '' }) : t('目前用全站的預設圖片。')}</p>
							</div>
						) : (
							<p className="hint">{tr('還沒有預設圖片，中間會留空。到 {link} 上傳，或在這裡上傳後設成預設。', { link: <Link href="/settings">{t('設定')}</Link> })}</p>
						))}
					{style.logo === 'upload' && style.logoMedia && (
						<div className="qr-upload">
							<img src={mediaUrl(style.logoMedia)} alt="" />
							<button type="button" className="btn small" disabled={uploading} onClick={() => fileInput.current?.click()}>
								<Icon name="upload" size={16} />
								{uploading ? t('上傳中…') : t('換一張圖片')}
							</button>
						</div>
					)}
					{justUploaded && (
						<div className="qr-scope" role="group" aria-labelledby={`${id}-scope`}>
							<p className="hint" id={`${id}-scope`}>
								{t('這張圖片要用在哪裡？')}
							</p>
							<div className="qr-choices">
								<button type="button" className="option qr-choice" disabled={settingDefault} onClick={() => setJustUploaded(null)}>
									{t('只用在這個短網址')}
								</button>
								{pageName && (
									<button type="button" className="option qr-choice" disabled={settingDefault} onClick={() => void makeDefault('page')}>
										{t('設成「{name}」頁面的預設', { name: pageName })}
									</button>
								)}
								<button type="button" className="option qr-choice" disabled={settingDefault} onClick={() => void makeDefault('site')}>
									{t('設成全站預設')}
								</button>
							</div>
						</div>
					)}
					<input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => onFile(event.target.files?.[0])} />
				</section>

				<Section title={t('外框文字')} action={<Toggle on={style.frame} onChange={(frame) => update({ frame })} label={t('顯示外框文字')} />}>
					<div className="field">
						<label htmlFor={`${id}-text`}>{t('印在 QR Code 下方的字')}</label>
						<input
							id={`${id}-text`}
							className="input"
							type="text"
							value={style.frameText}
							maxLength={QR_FRAME_TEXT_MAX}
							placeholder={t('例如：掃我看更多')}
							onChange={(event) => {
								const frameText = event.target.value.slice(0, QR_FRAME_TEXT_MAX)
								// Typing a caption shows it; switching it off keeps the text for later.
								update(frameText.trim() ? { frameText, frame: true } : { frameText })
							}}
						/>
						<span className="counter" aria-hidden="true">
							{style.frameText.length}/{QR_FRAME_TEXT_MAX}
						</span>
					</div>
				</Section>

				<Section title={t('下載')}>
					<div className="option-grid qr-sizes" role="group" aria-label={t('印刷尺寸')}>
						{QR_SIZE_IDS.map((sizeId) => (
							<button
								key={sizeId}
								type="button"
								className="option qr-size"
								aria-pressed={style.size === sizeId}
								onClick={() => update({ size: sizeId })}
							>
								<strong>{t(QR_SIZES[sizeId].label)}</strong>
								<small>{QR_SIZES[sizeId].spec}</small>
							</button>
						))}
					</div>
					<div className="qr-actions">
						<button type="button" className="btn primary" disabled={downloadDisabled} onClick={() => download('png')}>
							<DownloadIcon />
							{busy === 'png' ? t('產生中…') : t('下載 PNG')}
						</button>
						<button type="button" className="btn" aria-label={t('下載 SVG')} disabled={downloadDisabled} onClick={() => download('svg')}>
							{busy === 'svg' ? t('產生中…') : 'SVG'}
						</button>
						<button type="button" className="btn" aria-label={t('下載 PDF')} disabled={downloadDisabled} onClick={() => download('pdf')}>
							{busy === 'pdf' ? t('產生中…') : 'PDF'}
						</button>
						<span className={status && !status.ok ? 'qr-status error' : 'qr-status'} role="status">
							{status?.text}
						</span>
					</div>
				</Section>
			</div>

			<aside className="qr-preview" aria-labelledby={`${id}-preview`}>
				<div className="preview-head">
					<span id={`${id}-preview`}>{t('預覽')}</span>
					<span>
						{t(size.label)} · {size.cm} cm
					</span>
				</div>
				<div className="qr-stage">
					{preview ? (
						<div
							className="qr-art"
							role="img"
							aria-label={t('{value} 的 QR Code', { value: caption })}
							// qrSvg() builds this markup and escapes every text and attribute value in it.
							dangerouslySetInnerHTML={{ __html: preview }}
						/>
					) : (
						<p className="qr-art-error" role="alert">
							{t('網址太長，沒辦法做成 QR Code。')}
						</p>
					)}
					<p className="qr-caption">{caption}</p>
				</div>
				<p className="qr-note">{t('下載的檔案就是預覽這一張，可以直接拿去印。')}</p>
			</aside>
		</div>
	)
}

function SwatchRow({
	label,
	swatches,
	value,
	onPick,
}: {
	label: string
	swatches: readonly QrSwatch[]
	value: string
	onPick: (hex: string) => void
}) {
	return (
		<div className="qr-swatch-row" role="group" aria-label={label}>
			<span className="label" aria-hidden="true">
				{label}
			</span>
			<div className="swatches">
				{swatches.map((swatch) => (
					<button
						key={swatch.hex}
						type="button"
						className="swatch"
						aria-label={`${label} ${t(swatch.name)}`}
						aria-pressed={value.toUpperCase() === swatch.hex}
						onClick={() => onPick(swatch.hex)}
					>
						<span aria-hidden="true" style={{ background: swatch.hex }} />
					</button>
				))}
			</div>
		</div>
	)
}

function saveFile(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = name
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function DownloadIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M12 4v11" />
			<path d="M7 10.5l5 5 5-5" />
			<path d="M5 20h14" />
		</svg>
	)
}

function WarningIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M12 4l9 16H3z" />
			<path d="M12 10v4" />
			<path d="M12 17h.01" />
		</svg>
	)
}
