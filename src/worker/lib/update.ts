import type { ReleaseJson, UpdateResponse } from '../../shared/api'
import { VERSION } from './version'

// Whether a newer FluxBio is out. A site is its owner's copy of the code and nothing tells it when the project moves on,
// so an owner would never hear of a security fix. GET /api/update reads the project's changelog from GitHub and says
// what this site is behind by. It runs only when the owner's AI asks or the owner opens Settings, never for a visitor, and sends GitHub nothing
// about the site but the request itself.

/** FluxBio's changelog where the project keeps it. A release there is a "## <version> - <date>" heading. */
export const CHANGELOG_URL = 'https://raw.githubusercontent.com/0t2/flux-bio/main/CHANGELOG.md'
/** How many of the releases a site is behind are sent, newest first. `behind` counts them all. */
export const RELEASES_SENT = 40

/** Whether version `a` comes after `b`: 0.3.10 after 0.3.9. */
export function newerVersion(a: string, b: string): boolean {
	const left = a.split('.').map(Number), right = b.split('.').map(Number)
	for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return (left[i] ?? 0) > (right[i] ?? 0)
	return false
}

/**
 * The newest release in a changelog and those after `version`, newest first. It stops at the first heading that isn't
 * newer, so the cost is what the site is behind by, not the length of the file, and at one it can't read: the days from
 * before versions, or a file from a time when headings are written another way, which then counts as unread.
 */
export function releasesSince(changelog: string, version: string): { latest: string | null; releases: ReleaseJson[] } {
	const releases: ReleaseJson[] = []
	let latest: string | null = null
	let release: ReleaseJson | null = null
	let section: ReleaseJson['changes'][number] | null = null
	for (const line of changelog.split(/\r?\n/)) {
		if (line.startsWith('## ')) {
			const heading = /^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})\s*$/.exec(line)
			if (!heading) break
			latest ??= heading[1]!
			if (!newerVersion(heading[1]!, version)) break
			release = { version: heading[1]!, date: heading[2]!, changes: [] }
			releases.push(release)
			section = null
		} else if (release && line.startsWith('### ')) {
			section = { category: line.slice(4).trim(), entries: [] }
			release.changes.push(section)
		} else if (section && line.startsWith('- ')) {
			section.entries.push(line.slice(2).trim())
		}
	}
	return { latest, releases }
}

const has = (releases: ReleaseJson[], category: string) => releases.some((release) => release.changes.some((section) => section.category === category))

export function updateFrom(changelog: string | null, version = VERSION): UpdateResponse {
	const { latest, releases } = changelog === null ? { latest: null, releases: [] } : releasesSince(changelog, version)
	return {
		version,
		latest,
		behind: releases.length,
		security: has(releases, 'Security'),
		actionNeeded: has(releases, 'Action needed'),
		releases: releases.slice(0, RELEASES_SENT),
	}
}

export async function checkUpdate(): Promise<UpdateResponse> {
	let changelog: string | null = null
	try {
		// Cloudflare keeps the file for ten minutes, so asking again costs GitHub nothing.
		const response = await fetch(CHANGELOG_URL, { cf: { cacheTtl: 600, cacheEverything: true }, signal: AbortSignal.timeout(4000) })
		if (response.ok) changelog = await response.text()
	} catch {
		// Offline, or GitHub is: `latest` is null, which is not the same as being up to date.
	}
	return updateFrom(changelog)
}
