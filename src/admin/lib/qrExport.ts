/**
 * Browser-only helpers that turn a `qrSvg()` image into print files.
 *
 * An SVG drawn into a canvas can't use the page's web fonts, and WebKit is
 * unreliable about images nested inside one. So the vector part (background,
 * modules, finders, logo plate, FluxBio mark) is rasterized on its own, and
 * the caption `<text>` and logo `<image>` are painted on top with the canvas
 * API. `qrSvg()` paints those two last, so the stacking order is unchanged.
 */
import { QR_DPI, QR_SIZES, type QrStyle } from '../../shared/qr'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const CM_PER_INCH = 2.54
/** PostScript points per centimeter (72 / 2.54). */
const PT_PER_CM = 28.3465
/** How long a download waits for caption fonts before falling back to system fonts. */
const FONT_TIMEOUT_MS = 4000

/** Pixel width of a PNG/PDF download at 300 dpi: cm × 300 / 2.54, rounded. */
export function pixelSize(style: Pick<QrStyle, 'size'>): number {
	return Math.round((QR_SIZES[style.size].cm * QR_DPI) / CM_PER_INCH)
}

/**
 * Renders a `qrSvg()` image to a PNG `pixelWidth` pixels wide (the height
 * follows the SVG's aspect ratio). The file records its print resolution.
 * Logo images must already be data: URLs, see `imageToDataUrl`.
 */
export async function qrPng(svg: string, pixelWidth: number): Promise<Blob> {
	const art = await rasterize(svg, pixelWidth)
	const png = await canvasToBlob(art.canvas, 'image/png')
	if (!art.widthCm) return png
	// With the resolution recorded, print dialogs and layout apps open it at its real size.
	return setPngDpi(png, Math.round(art.canvas.width / (art.widthCm / CM_PER_INCH)))
}

/**
 * A one-page PDF at the physical print size of `style.size` (taller when
 * there is a caption) holding the code as a 300 dpi RGB image.
 */
export async function qrPdf(svg: string, style: Pick<QrStyle, 'size'>): Promise<Blob> {
	const art = await rasterize(svg, pixelSize(style))
	const { width, height } = art.canvas
	const { data } = art.context.getImageData(0, 0, width, height)
	const rgb = new Uint8Array(width * height * 3)
	for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
		const alpha = data[i + 3]
		for (let c = 0; c < 3; c++) {
			const value = data[i + c]
			// Flatten onto white. The art is opaque (it has a full background), so this rarely matters.
			rgb[j + c] = alpha === 255 ? value : Math.round((value * alpha + 255 * (255 - alpha)) / 255)
		}
	}
	const widthPt = QR_SIZES[style.size].cm * PT_PER_CM
	return pdfDocument({
		widthPt,
		heightPt: widthPt * art.aspect,
		pixelWidth: width,
		pixelHeight: height,
		image: await deflate(rgb),
	})
}

/**
 * Inlines an image (e.g. "/media/<id>") as a data: URL, so it stays in a saved
 * SVG and shows up when the SVG is drawn to a canvas (an `<image>` pointing at
 * a URL doesn't). It is scaled down to `maxSide` and re-encoded as PNG when it
 * has transparency, else JPEG; print and design tools read both, unlike WebP.
 */
export async function imageToDataUrl(url: string, maxSide = 512): Promise<string> {
	if (/^data:/i.test(url)) return url
	const image = await loadImage(url)
	const naturalWidth = image.naturalWidth || maxSide
	const naturalHeight = image.naturalHeight || maxSide
	const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight))
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(naturalWidth * scale))
	canvas.height = Math.max(1, Math.round(naturalHeight * scale))
	const context = context2d(canvas)
	context.imageSmoothingQuality = 'high'
	context.drawImage(image, 0, 0, canvas.width, canvas.height)
	return hasTransparency(context, canvas.width, canvas.height) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
}

// ---------- Rasterizing ----------

interface TextRun {
	text: string
	x: number
	y: number
	fontSize: number
	weight: string
	family: string
	fill: string
	align: CanvasTextAlign
	maxWidth: number | null
}

interface ImageRun {
	href: string
	x: number
	y: number
	width: number
	height: number
	fit: 'meet' | 'slice' | 'none'
	/** Corner radius in SVG units. */
	radius: number
}

interface Raster {
	canvas: HTMLCanvasElement
	context: CanvasRenderingContext2D
	/** Height / width of the SVG viewBox. */
	aspect: number
	/** Physical width from the SVG's width attribute, if it has one in cm, mm or in. */
	widthCm: number | null
}

async function rasterize(svg: string, pixelWidth: number): Promise<Raster> {
	const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
	const root = doc.documentElement
	if (root.namespaceURI !== SVG_NS || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
		throw new Error('Not a valid SVG')
	}
	const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
	const viewWidth = box[2] ?? Number.NaN
	const viewHeight = box[3] ?? Number.NaN
	if (!(viewWidth > 0 && viewHeight > 0)) throw new Error('The SVG needs a viewBox')
	const widthCm = lengthInCm(root.getAttribute('width'))

	// Snapshot first: the collections are live and shrink as elements are removed.
	const texts = Array.from(doc.getElementsByTagNameNS(SVG_NS, 'text')).map((element) => {
		const run = readText(element)
		element.remove()
		return run
	})
	const images = Array.from(doc.getElementsByTagNameNS(SVG_NS, 'image')).map((element) => {
		const run = readImage(doc, element)
		element.remove()
		return run
	})

	const width = Math.max(1, Math.round(pixelWidth))
	const height = Math.max(1, Math.round((width * viewHeight) / viewWidth))
	const scaleX = width / viewWidth
	const scaleY = height / viewHeight
	// Map the viewBox exactly onto the pixel grid, so the background reaches every edge.
	root.setAttribute('width', String(width))
	root.setAttribute('height', String(height))
	root.setAttribute('preserveAspectRatio', 'none')

	const artUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }))
	try {
		const [art, bitmaps] = await Promise.all([loadImage(artUrl), Promise.all(images.map((run) => loadImage(run.href)))])
		await loadFonts(texts.map((run) => ({ font: canvasFont(run, scaleY), text: run.text })))

		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const context = context2d(canvas)
		// The modules are vectors rendered at the final size; never smooth them.
		context.imageSmoothingEnabled = false
		context.drawImage(art, 0, 0, width, height)
		images.forEach((run, i) => {
			const bitmap = bitmaps[i]
			if (bitmap) drawImageRun(context, bitmap, run, scaleX, scaleY)
		})
		for (const run of texts) drawTextRun(context, run, scaleX, scaleY)
		return { canvas, context, aspect: viewHeight / viewWidth, widthCm }
	} finally {
		URL.revokeObjectURL(artUrl)
	}
}

function readText(element: Element): TextRun {
	const anchor = element.getAttribute('text-anchor')
	return {
		text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
		x: numberAttr(element, 'x'),
		y: numberAttr(element, 'y'),
		fontSize: numberAttr(element, 'font-size', 16),
		weight: element.getAttribute('font-weight') ?? '400',
		family: element.getAttribute('font-family') ?? 'sans-serif',
		fill: element.getAttribute('fill') ?? '#000000',
		align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
		maxWidth: element.hasAttribute('data-max-width') ? numberAttr(element, 'data-max-width') : null,
	}
}

function readImage(doc: Document, element: Element): ImageRun {
	const aspect = (element.getAttribute('preserveAspectRatio') ?? '').trim()
	const width = numberAttr(element, 'width')
	return {
		href: element.getAttribute('href') ?? element.getAttributeNS(XLINK_NS, 'href') ?? '',
		x: numberAttr(element, 'x'),
		y: numberAttr(element, 'y'),
		width,
		height: numberAttr(element, 'height'),
		fit: aspect === 'none' ? 'none' : /\bslice\b/.test(aspect) ? 'slice' : 'meet',
		radius: clipRadius(doc, element, width),
	}
}

/** Corner radius of the rounded-rect clip qrSvg() puts on its logo image. */
function clipRadius(doc: Document, element: Element, width: number): number {
	const id = /^url\(\s*#([^)\s]+)\s*\)$/.exec(element.getAttribute('clip-path') ?? '')?.[1]
	if (!id) return 0
	const clip = Array.from(doc.getElementsByTagNameNS(SVG_NS, 'clipPath')).find((candidate) => candidate.getAttribute('id') === id)
	const rect = clip?.getElementsByTagNameNS(SVG_NS, 'rect')[0]
	if (!clip || !rect) return 0
	const rx = numberAttr(rect, 'rx')
	return clip.getAttribute('clipPathUnits') === 'objectBoundingBox' ? rx * width : rx
}

function drawImageRun(context: CanvasRenderingContext2D, image: HTMLImageElement, run: ImageRun, scaleX: number, scaleY: number) {
	const x = run.x * scaleX
	const y = run.y * scaleY
	const w = run.width * scaleX
	const h = run.height * scaleY
	const naturalWidth = image.naturalWidth || w
	const naturalHeight = image.naturalHeight || h
	let drawWidth = w
	let drawHeight = h
	if (run.fit !== 'none') {
		const fit = run.fit === 'slice' ? Math.max(w / naturalWidth, h / naturalHeight) : Math.min(w / naturalWidth, h / naturalHeight)
		drawWidth = naturalWidth * fit
		drawHeight = naturalHeight * fit
	}
	context.save()
	roundedRect(context, x, y, w, h, run.radius * scaleX)
	context.clip()
	context.imageSmoothingEnabled = true
	context.imageSmoothingQuality = 'high'
	context.drawImage(image, x + (w - drawWidth) / 2, y + (h - drawHeight) / 2, drawWidth, drawHeight)
	context.restore()
}

function drawTextRun(context: CanvasRenderingContext2D, run: TextRun, scaleX: number, scaleY: number) {
	if (!run.text) return
	context.save()
	context.font = canvasFont(run, scaleY)
	context.fillStyle = run.fill
	context.textAlign = run.align
	context.textBaseline = 'alphabetic'
	// maxWidth squeezes the line if the real font runs wider than qrSvg() estimated.
	if (run.maxWidth) context.fillText(run.text, run.x * scaleX, run.y * scaleY, run.maxWidth * scaleX)
	else context.fillText(run.text, run.x * scaleX, run.y * scaleY)
	context.restore()
}

function canvasFont(run: TextRun, scale: number): string {
	return `${run.weight} ${Math.max(1, run.fontSize * scale).toFixed(2)}px ${run.family}`
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	const radius = Math.max(0, Math.min(r, w / 2, h / 2))
	context.beginPath()
	context.moveTo(x + radius, y)
	context.arcTo(x + w, y, x + w, y + h, radius)
	context.arcTo(x + w, y + h, x, y + h, radius)
	context.arcTo(x, y + h, x, y, radius)
	context.arcTo(x, y, x + w, y, radius)
	context.closePath()
}

/** Loads the caption fonts (e.g. Noto Sans TC from the dashboard's stylesheet) so the canvas can use them. */
async function loadFonts(requests: { font: string; text: string }[]): Promise<void> {
	if (requests.length === 0) return
	const fonts = document.fonts
	const loading = Promise.all(
		requests.map(async ({ font, text }) => {
			try {
				await fonts.load(font, text)
			} catch {
				// An unknown font is fine: the canvas falls back to the next family in the list.
			}
		}),
	).then(() => fonts.ready)
	// A slow or blocked font server must not hold up the download.
	await Promise.race([loading, new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS))])
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		// Same-origin media needs no CORS; other hosts must allow it or the canvas would be tainted.
		if (!/^(?:data|blob):/i.test(src)) image.crossOrigin = 'anonymous'
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error(`Could not load the image ${src.slice(0, 60)}`))
		image.src = src
	})
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const context = canvas.getContext('2d')
	if (!context) throw new Error('Canvas is not available')
	return context
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), type)
	})
}

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
	const { data } = context.getImageData(0, 0, width, height)
	for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true
	return false
}

function numberAttr(element: Element, name: string, fallback = 0): number {
	const value = Number.parseFloat(element.getAttribute(name) ?? '')
	return Number.isFinite(value) ? value : fallback
}

function lengthInCm(value: string | null): number | null {
	const match = /^\s*(\d+(?:\.\d+)?)\s*(cm|mm|in)\s*$/i.exec(value ?? '')
	if (!match) return null
	const amount = Number(match[1])
	const unit = (match[2] ?? 'cm').toLowerCase()
	if (!(amount > 0)) return null
	return unit === 'mm' ? amount / 10 : unit === 'in' ? amount * CM_PER_INCH : amount
}

// ---------- PNG resolution ----------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Adds a pHYs chunk (pixels per meter) right after IHDR, unless the PNG already has one. */
async function setPngDpi(png: Blob, dpi: number): Promise<Blob> {
	const bytes = new Uint8Array(await png.arrayBuffer())
	if (bytes.length < 33 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte) || chunkType(bytes, 8) !== 'IHDR') return png
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	for (let offset = 8; offset + 8 <= bytes.length; offset += 12 + view.getUint32(offset)) {
		const type = chunkType(bytes, offset)
		if (type === 'pHYs') return png
		if (type === 'IDAT') break
	}
	const perMeter = Math.round(dpi / 0.0254)
	const chunk = new Uint8Array(21)
	const chunkView = new DataView(chunk.buffer)
	chunkView.setUint32(0, 9)
	chunk.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
	chunkView.setUint32(8, perMeter)
	chunkView.setUint32(12, perMeter)
	chunk[16] = 1 // unit: meter
	chunkView.setUint32(17, crc32(chunk.subarray(4, 17)))
	// The signature (8 bytes) and IHDR (25 bytes) come first.
	return new Blob([bytes.subarray(0, 33), chunk, bytes.subarray(33)], { type: 'image/png' })
}

function chunkType(bytes: Uint8Array, offset: number): string {
	return String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
}

let crcTable: Uint32Array | null = null

function crc32(bytes: Uint8Array): number {
	if (!crcTable) {
		crcTable = new Uint32Array(256)
		for (let n = 0; n < 256; n++) {
			let c = n
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
			crcTable[n] = c >>> 0
		}
	}
	let crc = 0xffffffff
	for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

// ---------- PDF ----------

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	// "deflate" is the zlib format, which is what PDF's FlateDecode expects.
	const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
	return new Uint8Array(await new Response(stream).arrayBuffer())
}

function pdfNumber(value: number): string {
	return String(Math.round(value * 1000) / 1000)
}

/** A minimal single-page PDF 1.4 that shows one Flate-compressed RGB image across the whole page. */
function pdfDocument(page: {
	widthPt: number
	heightPt: number
	pixelWidth: number
	pixelHeight: number
	image: Uint8Array<ArrayBuffer>
}): Blob {
	const encoder = new TextEncoder()
	const parts: BlobPart[] = []
	const offsets: number[] = []
	let length = 0
	const write = (part: string | Uint8Array<ArrayBuffer>) => {
		const bytes = typeof part === 'string' ? encoder.encode(part) : part
		parts.push(bytes)
		length += bytes.byteLength
	}
	const object = (dictionary: string, stream?: Uint8Array<ArrayBuffer>) => {
		offsets.push(length)
		write(`${offsets.length} 0 obj\n${dictionary}\n`)
		if (stream) {
			write('stream\n')
			write(stream)
			write('\nendstream\n')
		}
		write('endobj\n')
	}

	const w = pdfNumber(page.widthPt)
	const h = pdfNumber(page.heightPt)
	write('%PDF-1.4\n')
	// A comment with high bytes marks the file as binary for transfer tools.
	write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))
	object('<< /Type /Catalog /Pages 2 0 R >>')
	object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
	object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`)
	object(
		`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${page.image.byteLength} >>`,
		page.image,
	)
	const content = encoder.encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Im1 Do\nQ\n`)
	object(`<< /Length ${content.byteLength} >>`, content)

	const xref = length
	// Every xref entry is exactly 20 bytes, including its two-character line end.
	const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
	write(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${entries}`)
	write(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
	return new Blob(parts, { type: 'application/pdf' })
}
