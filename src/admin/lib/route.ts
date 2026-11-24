export const ADMIN_BASE = '/admin'

/** Current dashboard path relative to /admin, including query string. */
export function currentAdminLocation(pathname: string, search: string): string {
	const relative = pathname.startsWith(ADMIN_BASE) ? pathname.slice(ADMIN_BASE.length) || '/' : pathname || '/'
	return `${relative}${search}`
}
