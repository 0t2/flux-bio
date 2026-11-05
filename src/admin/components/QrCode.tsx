import { useMemo } from 'react'
import { renderSVG } from 'uqr'
import { msg, t } from '../i18n'

/** Shown next to every QR code in the dashboard. */
export const QR_HINT = msg('掃描進來也算一次點擊，來源會記成「QR Code」。')

function download(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = fileName
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function svgToPng(svg: string, size: number): Promise<Blob> {
	const image = new Image()
	image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
	await image.decode()
	const canvas = document.createElement('canvas')
	canvas.width = size
	canvas.height = size
	const context = canvas.getContext('2d')
	if (!context) throw new Error('Canvas is not available')
	context.imageSmoothingEnabled = false
	context.drawImage(image, 0, 0, size, size)
	return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG failed'))), 'image/png'))
}

export function QrCode({ value, fileName }: { value: string; fileName: string }) {
	const svg = useMemo(() => renderSVG(value, { ecc: 'M', border: 2, whiteColor: '#FFFFFF', blackColor: '#0B0B12' }), [value])
	return (
		<div className="qr-row">
			{/* The SVG comes from the QR encoder, not from user-supplied markup. */}
			<div className="qr" role="img" aria-label={t('{value} 的 QR Code', { value })} dangerouslySetInnerHTML={{ __html: svg }} />
			<div style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
				<p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>QR Code</p>
				<p className="hint">{t(QR_HINT)}</p>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					<button
						type="button"
						className="btn small"
						onClick={async () => download(await svgToPng(svg, 1024), `${fileName}.png`)}
					>
						{t('下載 PNG')}
					</button>
					<button type="button" className="btn small" onClick={() => download(new Blob([svg], { type: 'image/svg+xml' }), `${fileName}.svg`)}>
						{t('下載 SVG')}
					</button>
				</div>
			</div>
		</div>
	)
}
