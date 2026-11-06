// Builds the fluxbio.link site as static files, ready for `cf deploy --prebuilt` from this folder: no Worker script runs, so a
// visit uses no Worker requests at all. Nothing here reaches a self-hosted FluxBio, whose `cf deploy` only uses src/ and public/.
//
//   pnpm landing           builds into landing/.cloudflare/output/v0/workers/default/assets
//   pnpm landing:deploy    builds and deploys
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { runnerImport } from 'vite'

const root = new URL('..', import.meta.url).pathname
const here = join(root, 'landing')
const { module: site } = await runnerImport('./landing/render.ts')
const { module: previews } = await runnerImport('./landing/previews.ts')
const template = readFileSync(join(here, 'template.html'), 'utf8')
const keys = site.templateKeys(template)

const output = join(here, '.cloudflare/output/v0')
const assets = join(output, 'workers/default/assets')
const write = (path, text) => {
	mkdirSync(dirname(join(assets, path)), { recursive: true })
	writeFileSync(join(assets, path), text)
}
rmSync(output, { recursive: true, force: true })
mkdirSync(assets, { recursive: true })
writeFileSync(join(output, 'config.json'), JSON.stringify({ buildContext: { isPreview: false, mode: 'production' } }))
writeFileSync(
	join(output, 'workers/default/worker.config.json'),
	JSON.stringify({
		name: 'fluxbio-showcase',
		compatibilityDate: '2026-10-15',
		// Files only: /zh-TW/ is zh-TW/index.html, and /preview/en/moon is preview/en/moon.html.
		assets: { htmlHandling: 'auto-trailing-slash', notFoundHandling: '404-page' },
		domains: ['fluxbio.link'],
		workersDev: true,
		previewUrls: false,
	}),
)

cpSync(join(here, 'public'), assets, { recursive: true })
for (const icon of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) cpSync(join(root, 'public', icon), join(assets, icon))

// The pages' own fonts come from this site (fonts.ts). IBM Plex is in public/fonts/ and went out with the copy above.
const { module: fonts } = await runnerImport('./landing/fonts.ts')
for (const file of fonts.plexFiles()) {
	if (!existsSync(join(assets, 'fonts', file))) {
		console.log(`landing/public/fonts/${file} is missing`)
		process.exit(1)
	}
}
// Noto Sans TC for the Traditional Chinese page is made by `pnpm landing:fonts`, if it has been run.
const made = join(here, '.fonts')
const chineseFont = existsSync(join(made, 'fonts.json')) ? JSON.parse(readFileSync(join(made, 'fonts.json'), 'utf8')) : null
let chineseFrom = 'Google Fonts (run pnpm landing:fonts to serve it from this site)'

let problems = 0
let files = 0
const pictures = previews.previewsIn(template)
for (const file of readdirSync(join(here, 'locales')).filter((name) => name.endsWith('.json')).sort()) {
	const code = file.replace('.json', '')
	const words = JSON.parse(readFileSync(join(here, 'locales', file), 'utf8'))
	const missing = keys.filter((key) => !words[key])
	if (missing.length) {
		problems += missing.length
		console.log(`${code}: missing ${missing.join(', ')}`)
		continue
	}
	// The font made earlier is only used while it has every character the page shows now: copy changes, and a
	// character it lacks would be drawn in another font. Until it is made again, the page links Google's.
	let chinese = null
	if (code === 'zh-TW' && chineseFont) {
		if (fonts.coversPage(chineseFont, site.renderLanding(template, words, code))) {
			chinese = chineseFont
			for (const { file } of chineseFont.faces) cpSync(join(made, file), join(assets, 'fonts/noto-sans-tc', file))
			chineseFrom = 'this site'
		} else chineseFrom = 'Google Fonts (the page has new characters: run pnpm landing:fonts)'
	}
	write(`${code}/index.html`, site.renderLanding(template, words, code, { chinese }))
	if (code === 'en') write('index.html', site.renderLanding(template, words, code, { home: true }))
	for (const { name, theme, starter } of pictures) {
		write(`preview/${code}/${name}.html`, previews.previewPage(code, theme, starter))
		files++
	}
}
write('language.js', site.languageScript())
write('robots.txt', site.robotsTxt())
write('sitemap.xml', site.sitemapXml())
write('404.html', '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/"><title>FluxBio</title><a href="/">FluxBio</a>\n')
console.log(`landing/.cloudflare/output: 13 pages, ${files} previews. Noto Sans TC on the zh-TW page is from ${chineseFrom}.`)
process.exit(problems ? 1 : 0)
