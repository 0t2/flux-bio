// pnpm landing:fonts
//
// Makes the Noto Sans TC that the Traditional Chinese page of fluxbio.link serves from its own address: one file
// with only the characters that page shows, where the whole font is a hundred files a weight. Google Fonts cuts
// it (`&text=`), and the result goes to landing/.fonts/, out of git, for `pnpm landing` to use. A deploy runs this
// first, so new copy needs nothing done; without it, or if Google can't be reached, the page links the font at
// Google as it always did. The font is under the SIL Open Font License, whose text ships beside it
// (landing/public/fonts/noto-sans-tc/OFL.txt).
//
// IBM Plex needs none of this: IBM's own files are in landing/public/fonts/ (see landing/fonts.ts).
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runnerImport } from 'vite'

const FAMILY = 'Noto Sans TC'
const WEIGHTS = '400..600'
// Google picks the file format by browser; this one gets woff2.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const root = new URL('..', import.meta.url).pathname
const here = join(root, 'landing')
const out = join(here, '.fonts')

function fail(message) {
	console.error(message)
	process.exit(1)
}

async function get(url) {
	const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) }).catch((error) => fail(`Could not reach ${new URL(url).host}: ${error.message}`))
	if (!response.ok) fail(`${new URL(url).host} answered ${response.status}`)
	return response
}

const { module: site } = await runnerImport('./landing/render.ts')
const { module: fonts } = await runnerImport('./landing/fonts.ts')
const words = JSON.parse(readFileSync(join(here, 'locales/zh-TW.json'), 'utf8'))
const page = site.renderLanding(readFileSync(join(here, 'template.html'), 'utf8'), words, 'zh-TW')
const characters = fonts.charactersBeyondAscii(page)

const css = await (await get(`https://fonts.googleapis.com/css2?family=${FAMILY.replaceAll(' ', '+')}:wght@${WEIGHTS}&display=swap&text=${encodeURIComponent(characters)}`)).text()
const faces = []
const files = new Map()
for (const [, body = ''] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
	const weight = /font-weight:\s*(\d{3}(?: \d{3})?)\s*;/.exec(body)?.[1]
	// Only Google's own font host is fetched.
	const src = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\)/.exec(body)?.[1]
	const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim()
	if (!weight || !src || !range) continue
	if (!files.has(src)) {
		const bytes = Buffer.from(await (await get(src)).arrayBuffer())
		// Named by what it holds, so a browser can keep it for a year: another set of characters is another file.
		files.set(src, { name: `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.woff2`, bytes })
	}
	faces.push({ weight, file: files.get(src).name, range })
}
if (!faces.length) fail('Google Fonts sent no font for those characters.')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const { name, bytes } of files.values()) writeFileSync(join(out, name), bytes)
writeFileSync(join(out, 'fonts.json'), `${JSON.stringify({ family: FAMILY, characters, faces }, null, '\t')}\n`)
const size = [...files.values()].reduce((total, file) => total + file.bytes.length, 0)
console.log(`${FAMILY}: ${[...characters].length} characters in ${files.size} file${files.size === 1 ? '' : 's'}, ${Math.round(size / 1024)} KB, for ${faces.length} weights. pnpm landing uses it from now on.`)
