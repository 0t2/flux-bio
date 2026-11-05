import { backupFileParts, type Backup } from '../../../shared/backup'
import { request } from '../../api'

export interface BackupFile {
	file: Blob
	fileName: string
	/** Images the pages use that no longer exist, and so aren't in the file. */
	missing: number
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'))
		reader.readAsDataURL(blob)
	})
}

/** An image as a data URL, or null if it is gone. Anything else stops the backup: a file missing images it could have had is worse than none. */
async function readImage(id: string): Promise<string | null> {
	const response = await fetch(`/media/${encodeURIComponent(id)}`, { credentials: 'same-origin' })
	if (response.status === 404) return null
	if (!response.ok) throw new Error(`Image ${id}: ${response.status}`)
	return blobToDataUrl(await response.blob())
}

/** "fluxbio-backup-links.example.com-20261104-0830.json", in the browser's time zone. */
export function backupFileName(host: string, at = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	const day = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`
	return `fluxbio-backup-${host}-${day}-${pad(at.getHours())}${pad(at.getMinutes())}.json`
}

/** GET /api/export with every image inside, so this one file is enough to restore from. */
export async function createBackup(onProgress: (done: number, total: number) => void): Promise<BackupFile> {
	const backup = await request<Backup>('/export')
	const ids = backup.media
	const images = new Map<string, string>()
	let next = 0
	let done = 0
	let failed = false
	onProgress(0, ids.length)
	// Six at a time, as a browser would for one host anyway. Downloads still under way when one fails
	// finish on their own, after the caller has moved on, so they must not report progress any more.
	const worker = async () => {
		while (!failed && next < ids.length) {
			const id = ids[next++]
			try {
				const image = await readImage(id)
				if (image) images.set(id, image)
			} catch (error) {
				failed = true
				throw error
			}
			if (!failed) onProgress(++done, ids.length)
		}
	}
	await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker))
	// In the export's order, whichever order the downloads finished in.
	const files = ids.flatMap((id) => {
		const image = images.get(id)
		return image ? [[id, image] as const] : []
	})
	return {
		file: new Blob(backupFileParts(backup, files), { type: 'application/json' }),
		fileName: backupFileName(location.hostname),
		missing: ids.length - files.length,
	}
}
