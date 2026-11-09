import { describe, expect, it } from 'vitest'
import { isShippableMediaId, planMediaAssets } from '../src/shared/mediaAssets'
import { MEDIA_CSP } from '../src/worker/lib/media'
import headers from '../public/_headers?raw'
import gitignore from '../.gitignore?raw'
import config from '../cloudflare.config.ts?raw'
import { SCOPED_MEDIA_PATH } from '../src/shared/mediaAssetPaths'

// pnpm deploy:images ships the pictures pages use as static files, which visitors load without running the Worker.

describe('which pictures ship', () => {
	it('refreshes every used image and removes those no page uses any more', () => {
		expect(planMediaAssets(['a1.webp', 'b2.png', 'c3.jpg'], ['b2.png', 'old.webp', '.DS_Store'])).toEqual({
			download: ['a1.webp', 'b2.png', 'c3.jpg'],
			remove: ['.DS_Store', 'old.webp'],
			skipped: [],
		})
	})

	it('leaves to the Worker an id that is no safe file name or has no picture extension', () => {
		for (const id of ['..', '.hidden.png', 'no-extension', 'page.html', 'x.svg', 'a/b.png']) expect(isShippableMediaId(id), id).toBe(false)
		for (const id of ['abcdefghijkl.webp', 'A_b-c.JPG', 'x.jpeg', 'y.avif', 'z.gif']) expect(isShippableMediaId(id), id).toBe(true)
		expect(planMediaAssets(['ok.png', '..', 'note.txt'], []).skipped).toEqual(['..', 'note.txt'])
	})
})

describe('a shipped picture', () => {
	it('gets the headers the Worker gives one from KV', () => {
		const rule = headers.split(/\n(?=\/)/).find((block) => block.startsWith('/media/*'))
		expect(rule).toBeDefined()
		expect(rule).toContain(`Content-Security-Policy: ${MEDIA_CSP}`)
		expect(rule).toContain('Cache-Control: public, max-age=31536000, immutable')
		expect(rule).toContain('X-Content-Type-Options: nosniff')
	})

	it('never goes into git: they are the owner\'s pictures', () => {
		expect(gitignore.split('\n')).toContain('public/media/')
	})
})

describe('scoped pictures', () => {
	it('run the Worker first, at the path the Worker serves them from', () => {
		expect(config).toContain(`'${SCOPED_MEDIA_PATH}/*'`)
	})

	it('keep the Worker’s modules out of cloudflare.config.ts', () => {
		// The Vite plugin bundles the config, and a module it imports then fails to load in the Worker under `cf dev`
		// ("Failed to load url"), so `pnpm dev` stops before serving anything. Tests don't load the config, so only this sees it.
		expect(config).not.toMatch(/from '\.\/src\//)
	})
})
