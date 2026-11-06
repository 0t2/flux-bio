/**
 * Pictures as static files (`pnpm deploy:images`). Before a deploy, the pictures a site's pages use are downloaded into
 * `public/media/<id>`, so they ship with the Worker as static assets. Cloudflare answers a request for a static asset
 * without running the Worker, and static asset requests are free and unlimited, so visitors then load those pictures
 * at no cost to the quota. A picture uploaded since the last such deploy has no file yet, and the Worker serves it from
 * KV as before, at `/media/<id>` either way, so nothing on a page changes.
 */
import { MEDIA_ID } from './content'

/** Where the files go, relative to the FluxBio folder. Kept out of git: they are the owner's pictures. */
export const MEDIA_ASSET_DIR = 'public/media'

/** Static assets get their content type from the extension, so only ids ending in one a browser takes as a picture ship. */
const PICTURE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif)$/i

/** An id that is safe as a file name in that folder and served with the right type. */
export function isShippableMediaId(id: string): boolean {
	return MEDIA_ID.test(id) && !id.startsWith('.') && PICTURE_EXTENSIONS.test(id)
}

export interface MediaAssetPlan {
	/** Used by the pages and not in the folder yet. */
	download: string[]
	/** In the folder and no longer used: removed, so a picture taken off every page stops shipping. */
	remove: string[]
	/** Used, but not shippable as a file: the Worker keeps serving these. */
	skipped: string[]
}

/** What to fetch and what to delete, given the ids the site's pages use and the files already there. Ids never change content. */
export function planMediaAssets(used: readonly string[], present: readonly string[]): MediaAssetPlan {
	const wanted = new Set(used.filter(isShippableMediaId))
	const have = new Set(present)
	return {
		download: [...wanted].filter((id) => !have.has(id)).sort(),
		remove: [...have].filter((id) => !wanted.has(id)).sort(),
		skipped: [...new Set(used.filter((id) => !isShippableMediaId(id)))].sort(),
	}
}
