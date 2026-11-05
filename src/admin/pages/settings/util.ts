import { ApiError } from '../../api'

export const REPO_URL = 'https://github.com/0t2/flux-bio'
export const API_DOCS_URL = `${REPO_URL}/blob/main/AGENTS.md`

/** The message for a failed action: the API's or ours, never a browser's English one. */
export function errorText(error: unknown, fallback: string): string {
	return error instanceof ApiError ? error.message : fallback
}
