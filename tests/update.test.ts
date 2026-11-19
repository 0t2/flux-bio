import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateTokenResponse, UpdateResponse } from '../src/shared/api'
import { CHANGELOG_URL, newerVersion, RELEASES_SENT, releasesSince, updateFrom } from '../src/worker/lib/update'
import { VERSION } from '../src/worker/lib/version'
import { parseChangelog } from '../landing/changelog'
import changelog from '../CHANGELOG.md?raw'
import { api, apiJson, call } from './helpers'

// A site is its owner's copy of the code, so nothing tells it when FluxBio moves on. GET /api/update reads the
// project's changelog from GitHub and says what the site is behind by, so its owner's AI can say a fix is waiting.

const [major, minor, patch] = VERSION.split('.').map(Number) as [number, number, number]
const next = (minors: number, patches: number) => `${major}.${minor + minors}.${minors ? patches : patch + patches}`

/** The changelog as it would be three releases from now: a fix, then one with something to do, then a security fix. */
const ahead = `# Changelog

Words for people, with a line that looks like an entry before any release:
- not an entry

## ${next(1, 1)} - 2027-01-12

### Security
- A password could be skipped. [#90](https://github.com/0t2/flux-bio/pull/90)

### Fixed
- A typo in \`/llms.txt\`.

## ${next(1, 0)} - 2027-01-10

### Action needed
- Run \`pnpm deploy:images\` once more.

### New
- A block.

## ${next(0, 1)} - 2027-01-05

### Fixed
- One thing.
- Another.

${changelog.slice(changelog.indexOf('\n## ') + 1)}`

function github(answer: () => Response | Promise<Response>) {
	const asked: string[] = []
	const network = vi.mocked(globalThis.fetch).getMockImplementation()!
	vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
		const url = input instanceof Request ? input.url : String(input)
		if (url !== CHANGELOG_URL) return network(input, init)
		asked.push(url)
		return Promise.resolve(answer())
	})
	return { asked, restore: () => vi.mocked(globalThis.fetch).mockImplementation(network) }
}

describe('GET /api/update', () => {
	let stub: ReturnType<typeof github> | null = null
	afterEach(() => {
		stub?.restore()
		stub = null
	})

	it('says a site on the newest release is behind by nothing', async () => {
		stub = github(() => new Response(changelog))
		expect(await apiJson<UpdateResponse>('/update')).toEqual({ version: VERSION, latest: VERSION, behind: 0, security: false, actionNeeded: false, releases: [] })
		expect(stub.asked).toEqual(['https://raw.githubusercontent.com/0t2/flux-bio/main/CHANGELOG.md'])
	})

	it('lists the releases a site is behind, newest first, and says when one is a security fix or takes a step', async () => {
		stub = github(() => new Response(ahead))
		const update = await apiJson<UpdateResponse>('/update')
		expect(update).toMatchObject({ version: VERSION, latest: next(1, 1), behind: 3, security: true, actionNeeded: true })
		expect(update.releases).toEqual([
			{
				version: next(1, 1),
				date: '2027-01-12',
				changes: [
					{ category: 'Security', entries: ['A password could be skipped. [#90](https://github.com/0t2/flux-bio/pull/90)'] },
					{ category: 'Fixed', entries: ['A typo in `/llms.txt`.'] },
				],
			},
			{ version: next(1, 0), date: '2027-01-10', changes: [{ category: 'Action needed', entries: ['Run `pnpm deploy:images` once more.'] }, { category: 'New', entries: ['A block.'] }] },
			{ version: next(0, 1), date: '2027-01-05', changes: [{ category: 'Fixed', entries: ['One thing.', 'Another.'] }] },
		])
	})

	it("says nothing is known when GitHub can't be read, which is not being up to date", async () => {
		const unknown = { version: VERSION, latest: null, behind: 0, security: false, actionNeeded: false, releases: [] }
		// As tests/setup.ts leaves it: GitHub answers 503.
		expect(await apiJson<UpdateResponse>('/update')).toEqual(unknown)
		stub = github(() => { throw new Error('offline') })
		expect(await apiJson<UpdateResponse>('/update')).toEqual(unknown)
		stub.restore()
		stub = github(() => new Response('<!doctype html><title>Sign in</title>'))
		expect(await apiJson<UpdateResponse>('/update')).toEqual(unknown)
	})

	it('is for a full token: not for a links token, and not without one', async () => {
		stub = github(() => new Response(ahead))
		const full = await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'An AI', scope: 'full' } })
		const links = await apiJson<CreateTokenResponse>('/tokens', { method: 'POST', json: { name: 'A shortcut', scope: 'links' } })
		expect((await api('/update', { bearer: full.token })).status).toBe(200)
		expect((await api('/update', { bearer: links.token })).status).toBe(403)
		expect((await call('/api/update')).status).toBe(401)
		expect(stub.asked).toHaveLength(1)
	})

	it('is in the guide: asked once a conversation, a security fix said first, and used before an update', async () => {
		const guide = await (await call('/llms.txt')).text()
		for (const part of ['`GET /api/update` once a conversation', 'If `security` is true, say first that a fix for their site is waiting', '- When `GET /api/update` shows a newer FluxBio, offer to update']) expect(guide).toContain(part)
		const topic = await (await call('/api/guide/update')).text()
		for (const part of ['`{ version, latest, behind, security, actionNeeded, releases }`', 'a fix is waiting if `security` is true', 'takes a step beyond deploying', "don't call the site up to date"]) expect(topic).toContain(part)
	})
})

describe('reading the changelog for what is newer', () => {
	it('reads the real CHANGELOG.md the way the build does', () => {
		const built = parseChangelog(changelog).filter((release) => release.version)
		const { latest, releases } = releasesSince(changelog, '0.2.1')
		expect(latest).toBe(built[0]!.version)
		expect(releases.map((release) => [release.version, release.date])).toEqual(built.map((release) => [release.version, release.date]))
		for (const [index, release] of releases.entries()) {
			expect(release.changes).toEqual(built[index]!.sections.map((section) => ({ category: section.category, entries: section.items.map((item) => item.source) })))
		}
	})

	it('stops at the release the site runs, and at the days from before versions', () => {
		expect(releasesSince(ahead, next(0, 1)).releases.map((release) => release.version)).toEqual([next(1, 1), next(1, 0)])
		expect(releasesSince(ahead, next(1, 1))).toEqual({ latest: next(1, 1), releases: [] })
		// A site built from a branch ahead of the project is behind by nothing.
		expect(releasesSince(ahead, next(2, 0))).toEqual({ latest: next(1, 1), releases: [] })
		// Every release since versions began, and none of the dated headings below them.
		expect(releasesSince(ahead, '0.0.1').releases.at(-1)!.version).toBe('0.3.0')
	})

	it("counts a file it can't read as unread, not as no news", () => {
		expect(releasesSince('', VERSION)).toEqual({ latest: null, releases: [] })
		expect(releasesSince('# Changelog\n\n## Unreleased\n\n### New\n- x\n', VERSION)).toEqual({ latest: null, releases: [] })
		expect(releasesSince('## v9.0.0 (2027-01-01)\n\n### New\n- x\n', VERSION)).toEqual({ latest: null, releases: [] })
		expect(updateFrom(null).latest).toBeNull()
	})

	it('orders versions by number, not by spelling', () => {
		expect(newerVersion('0.3.10', '0.3.9')).toBe(true)
		expect(newerVersion('0.10.0', '0.9.9')).toBe(true)
		expect(newerVersion('1.0.0', '0.99.99')).toBe(true)
		expect(newerVersion('0.3.0', '0.3.0')).toBe(false)
		expect(newerVersion('0.3.0', '0.3.1')).toBe(false)
	})

	it('counts every release a site is behind and sends the newest of them', () => {
		const many = Array.from({ length: RELEASES_SENT + 5 }, (_, index) => `## 0.3.${RELEASES_SENT + 5 - index} - 2027-01-01\n\n### Fixed\n- Fix ${index}.\n`).join('\n')
		const update = updateFrom(`${many}\n## 0.3.0 - 2026-11-19\n\n### New\n- x\n`, '0.3.0')
		expect(update.behind).toBe(RELEASES_SENT + 5)
		expect(update.releases).toHaveLength(RELEASES_SENT)
		expect(update.releases[0]!.version).toBe(`0.3.${RELEASES_SENT + 5}`)
		// An "Action needed" in one that wasn't sent still counts.
		expect(updateFrom(`${many}\n## 0.3.0 - 2026-11-19\n`.replace('- Fix 44.', '- Fix 44.\n\n### Action needed\n- Do it.'), '0.3.0').actionNeeded).toBe(true)
	})
})
