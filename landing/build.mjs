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
// The changelog page is made from CHANGELOG.md alone. A line it can't read stops the build here, with its number.
const { module: changelog } = await runnerImport('./landing/changelog.ts')
const changelogTemplate = readFileSync(join(here, 'changelog.html'), 'utf8')
if (!existsSync(join(root, 'CHANGELOG.md'))) throw new Error('en: missing required source file CHANGELOG.md')
const english = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
let releases
try { releases = changelog.parseChangelog(english) }
catch (error) { throw new Error(`en: ${error instanceof Error ? error.message : String(error)}`) }
// The newest heading is the version the code calls itself, so a site can find its place in the file.
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (releases[0].version !== version) throw new Error(`en: CHANGELOG.md line ${releases[0].line}: the newest heading is ${changelog.releaseName(releases[0])}, and package.json says ${version}. They change together.`)
const localeFiles = readdirSync(join(here, 'locales')).filter((name) => name.endsWith('.json'))
const localeWords = new Map()
for (const code of changelog.LOCALES) {
	const file = join(here, 'locales', `${code}.json`)
	if (!existsSync(file)) throw new Error(`${code}: missing required locale file landing/locales/${code}.json`)
	try { localeWords.set(code, JSON.parse(readFileSync(file, 'utf8'))) }
	catch (error) { throw new Error(`${code}: cannot read landing/locales/${code}.json: ${error instanceof Error ? error.message : String(error)}`) }
}
const labelsFor = changelog.categoryLabels
const translations = {}
for (const code of changelog.LOCALES) {
	if (code === 'en') continue
	const file = join(here, 'changelog', `${code}.md`)
	if (!existsSync(file)) throw new Error(`${code}: missing required translation file landing/changelog/${code}.md`)
	translations[code] = { source: readFileSync(file, 'utf8'), labels: labelsFor(localeWords.get(code)) }
}
changelog.validateTranslations(english, translations)
const localizedReleases = new Map([['en', releases]])
for (const [code, value] of Object.entries(translations)) localizedReleases.set(code, changelog.parseChangelog(value.source, value.labels, `landing/changelog/${code}.md`))
const keys = [...new Set([...site.templateKeys(template), ...site.templateKeys(changelogTemplate)])].sort()

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
		// One address: with the workers.dev one on, the whole site was there a second time.
		workersDev: false,
		previewUrls: false,
	}),
)

cpSync(join(here, 'public'), assets, { recursive: true })
for (const icon of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) cpSync(join(root, 'public', icon), join(assets, icon))

// The dashboard screenshots are not in git: a checkout without them builds pages that ask for pictures it doesn't
// have. A deploy fetches them first (scripts/landing-pictures.mjs), so this only says so.
const screens = [...new Set([...template.matchAll(/\/dash-([\w-]+)\.webp/g)].map((match) => match[1]))]
const absent = localeFiles.flatMap((name) => screens.filter((screen) => !existsSync(join(assets, name.replace('.json', ''), `dash-${screen}.webp`))))
if (absent.length) console.log(`${absent.length} dashboard screenshots are not here: pnpm landing:pictures fetches them from fluxbio.link.`)

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
for (const file of localeFiles.sort()) {
	const code = file.replace('.json', '')
	const words = localeWords.get(code)
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
	write(`${code}/changelog/index.html`, changelog.renderChangelog(changelogTemplate, words, code, localizedReleases.get(code), labelsFor(words)))
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
console.log(`landing/.cloudflare/output: 13 pages, 13 changelog pages, ${files} previews. Noto Sans TC on the zh-TW page is from ${chineseFrom}.`)
process.exit(problems ? 1 : 0)
