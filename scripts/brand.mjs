// Makes everything that shows the logo as a file, from LOGO_PATH in src/templates/icons.ts: the favicon, the app
// icons, the landing page's share image and its picture of one line branching out. Uses Chrome, or CHROME_PATH.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { runnerImport } from 'vite'

const root = new URL('..', import.meta.url).pathname
const { LOGO_INK: INK, LOGO_LIME: LIME, LOGO_PATH: MARK, logoSvg, logoTile } = (await runnerImport('./src/templates/icons.ts')).module
const OFF_WHITE = '#F4F6EE'
const out = (file) => join(root, 'public', file)

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
async function render(html, width, height, options = { type: 'png', omitBackground: true }, scale = 1) {
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
	await page.setContent(`<!doctype html><body style="margin:0">${html}`, { waitUntil: 'networkidle' })
	await page.evaluate(() => document.fonts.ready)
	const shot = await page.screenshot(options)
	await page.close()
	return shot
}

// The favicon, on its lime tile so it shows on a tab of any color.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${logoTile()}</svg>`
writeFileSync(out('favicon.svg'), `${tile}\n`)
const favicon = (size) => render(tile.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `), size, size)

/** A .ico holding PNGs. */
function ico(images) {
	const header = Buffer.alloc(6 + images.length * 16)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(images.length, 4)
	let offset = header.length
	images.forEach(({ size, png }, index) => {
		const at = 6 + index * 16
		header.writeUInt8(size, at)
		header.writeUInt8(size, at + 1)
		header.writeUInt16LE(1, at + 4)
		header.writeUInt16LE(32, at + 6)
		header.writeUInt32LE(png.length, at + 8)
		header.writeUInt32LE(offset, at + 12)
		offset += png.length
	})
	return Buffer.concat([header, ...images.map(({ png }) => png)])
}
writeFileSync(out('favicon.ico'), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await favicon(size) })))))

// App icons fill their square, because the system rounds them, and keep the mark within a maskable icon's safe zone.
const appIcon = (size) => render(`<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="display:block"><rect width="32" height="32" fill="${LIME}"/><path transform="translate(5.6 5.6) scale(.65)" d="${MARK}" fill="${INK}" fill-rule="evenodd"/></svg>`, size, size)
writeFileSync(out('apple-touch-icon.png'), await appIcon(180))
writeFileSync(out('icon-192.png'), await appIcon(192))
writeFileSync(out('icon-512.png'), await appIcon(512))

// The share image for fluxbio.link. Its eyes show the ink background through.
writeFileSync(
	join(root, 'landing/public/og.jpg'),
	await render(
		`<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@700&display=swap" rel="stylesheet">
		<div style="width:1200px;height:630px;background:${INK};display:flex;align-items:center;justify-content:center;gap:44px">
			<svg width="360" height="360" viewBox="0 0 32 32"><path d="${MARK}" fill="${LIME}" fill-rule="evenodd"/></svg>
			<span style="font:700 132px 'IBM Plex Sans';letter-spacing:-.03em;color:${OFF_WHITE}">FluxBio</span>
		</div>`,
		1200,
		630,
		{ type: 'jpeg', quality: 90 },
	),
)

// One octopus, its arms running out to pages and short links.
const card = (x, y, fill, tall) => `<g transform="translate(${x} ${y})"><rect width="190" height="170" rx="36" fill="${fill}" stroke="${INK}" stroke-width="16"/>${
	tall
		? `<rect x="42" y="42" width="106" height="44" rx="16" fill="${INK}"/><rect x="42" y="104" width="66" height="26" rx="13" fill="${INK}"/>`
		: `<rect x="42" y="46" width="106" height="28" rx="14" fill="${INK}"/><rect x="42" y="96" width="106" height="28" rx="14" fill="${INK}"/>`
}</g>`
const webPage = await browser.newPage({ viewport: { width: 1444, height: 912 } })
await webPage.setContent(`<!doctype html><body style="margin:0"><svg width="1444" height="912" viewBox="0 0 1444 912" style="display:block">
	<g fill="none" stroke="${INK}" stroke-width="28" stroke-linecap="round">
		<path d="M300 430C560 430 540 150 800 150"/><path d="M300 456C520 456 620 456 800 456"/><path d="M300 482C560 482 540 762 800 762"/>
		<path d="M550 290C720 302 900 300 1010 270C1090 248 1100 150 1190 150"/><path d="M990 456H1190"/><path d="M550 622C720 610 900 612 1010 642C1090 664 1100 762 1190 762"/>
	</g>
	${card(800, 65, LIME, true)}${card(1190, 65, OFF_WHITE, false)}${card(800, 371, OFF_WHITE, false)}${card(1190, 371, LIME, true)}${card(800, 677, LIME, false)}${card(1190, 677, OFF_WHITE, true)}
	<!-- The mark's body where the arms leave it; the aerial rises above. -->
	<g transform="translate(2.8 168.7) scale(15.48)">${logoSvg(32).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
</svg>`)
const png = await webPage.screenshot({ type: 'png', omitBackground: true })
const webp = await webPage.evaluate(async (base64) => {
	const image = new Image()
	image.src = `data:image/png;base64,${base64}`
	await image.decode()
	const canvas = document.createElement('canvas')
	canvas.width = image.width
	canvas.height = image.height
	canvas.getContext('2d').drawImage(image, 0, 0)
	return canvas.toDataURL('image/webp', 0.8)
}, png.toString('base64'))
writeFileSync(join(root, 'landing/public/images/link-web.webp'), Buffer.from(webp.split(',')[1], 'base64'))
await browser.close()
console.log('public/favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, landing/public/og.jpg, landing/public/images/link-web.webp')
