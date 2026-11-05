// Builds the fluxbio.link site as static files, ready for `cf deploy --prebuilt` from this folder: no Worker script runs, so a
// visit uses no Worker requests at all. Nothing here reaches a self-hosted FluxBio, whose `cf deploy` only uses src/ and public/.
//
//   pnpm landing           builds into landing/.cloudflare/output/v0/workers/default/assets
//   pnpm landing:deploy    builds and deploys
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
	write(`${code}/index.html`, site.renderLanding(template, words, code))
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
console.log(`landing/.cloudflare/output: 13 pages, ${files} previews`)
process.exit(problems ? 1 : 0)
