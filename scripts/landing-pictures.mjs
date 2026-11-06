// pnpm landing:pictures
//
// The dashboard screenshots on fluxbio.link (landing/public/<language>/dash-*.webp) are not in git: `pnpm shots` makes
// them, four for each of 13 languages, and every retake would add megabytes to the repository for good. They live on
// the maintainer's computer and on the site itself. So before a deploy, this fetches from the live site whichever
// are missing here, and a deploy from a fresh checkout (GitHub Actions) puts back the ones already there.
//
// New ones reach the site the other way: `pnpm shots --locale <code>`, then `pnpm landing:deploy` from that computer.
//
// It stops with an error if one can't be had, and `pnpm landing:deploy` runs it first, because a deploy without a
// picture would take it off the site, and the site is where the next deploy looks for it.
//
//   pnpm landing:pictures           fetch what is missing
//   pnpm landing:pictures --check   only say what is missing
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SITE = 'https://fluxbio.link'
const AT_ONCE = 6

const root = new URL('..', import.meta.url).pathname
const here = join(root, 'landing')
const check = process.argv.includes('--check')

// The pictures the page shows, as its template names them, in every language it is written in.
const names = [...new Set([...readFileSync(join(here, 'template.html'), 'utf8').matchAll(/\/dash-([\w-]+)\.webp/g)].map((match) => match[1]))].sort()
const languages = readdirSync(join(here, 'locales')).filter((name) => name.endsWith('.json')).map((name) => name.replace('.json', '')).sort()
const wanted = languages.flatMap((language) => names.map((name) => `${language}/dash-${name}.webp`))
const has = (path) => existsSync(join(here, 'public', path)) && statSync(join(here, 'public', path)).size > 0
const missing = wanted.filter((path) => !has(path))

if (!missing.length) {
	console.log(`Dashboard screenshots: all ${wanted.length} are here.`)
	process.exit(0)
}
if (check) {
	console.log(`Dashboard screenshots: ${missing.length} of ${wanted.length} are missing here:\n  ${missing.join('\n  ')}`)
	process.exit(1)
}

const failed = []
for (let at = 0; at < missing.length; at += AT_ONCE) {
	await Promise.all(
		missing.slice(at, at + AT_ONCE).map(async (path) => {
			try {
				const response = await fetch(`${SITE}/${path}`, { signal: AbortSignal.timeout(30_000) })
				const type = response.headers.get('content-type') ?? ''
				// The site answers a path it doesn't have with its 404 page, which is not a picture.
				if (!response.ok || !type.startsWith('image/')) throw new Error(`${response.status} ${type}`)
				const bytes = Buffer.from(await response.arrayBuffer())
				if (!bytes.length) throw new Error('empty')
				mkdirSync(dirname(join(here, 'public', path)), { recursive: true })
				writeFileSync(join(here, 'public', path), bytes)
			} catch (error) {
				failed.push(`${path}: ${error.message}`)
			}
		}),
	)
}

if (failed.length) {
	console.error(`Dashboard screenshots: ${failed.length} could not be fetched from ${SITE}, so nothing is deployed:\n  ${failed.join('\n  ')}\nRetake them with pnpm shots --locale <code>, on a computer that can run the dashboard.`)
	process.exit(1)
}
console.log(`Dashboard screenshots: fetched ${missing.length} from ${SITE}, ${wanted.length} in all.`)
