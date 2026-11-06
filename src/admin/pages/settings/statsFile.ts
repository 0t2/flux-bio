import type { StatsExportResponse } from '../../../shared/api'
import { request } from '../../api'
import { t } from '../../i18n'
import { downloadCsv } from '../../lib/format'

/** "fluxbio-stats-links.example.com-20261106.csv", in the browser's time zone. */
function statsFileName(host: string, at = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `fluxbio-stats-${host}-${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}.csv`
}

/**
 * Every view and click count as a CSV file, a thousand rows a request, oldest first. With `before` ("YYYY-MM"), only
 * the months before it: what clearing them would delete. Resolves once the file is saved.
 */
export async function downloadStats(onProgress: (rows: number) => void, before?: string): Promise<number> {
	const rows: StatsExportResponse['rows'] = []
	let cursor: string | null = null
	do {
		const query = new URLSearchParams()
		if (cursor) query.set('cursor', cursor)
		if (before) query.set('before', before)
		const page: StatsExportResponse = await request<StatsExportResponse>(`/stats/export${query.size ? `?${query}` : ''}`)
		rows.push(...page.rows)
		cursor = page.nextCursor
		onProgress(rows.length)
	} while (cursor)
	const kind = (value: string) => (value === 'view' ? t('瀏覽') : value === 'click' ? t('點擊') : value)
	downloadCsv(
		[
			[t('日期'), t('類型'), t('對象'), t('頁面'), t('短網址'), t('標題'), t('來源'), t('次數')],
			...rows.map(([day, what, target, page, slug, title, source, count]) => [day, kind(what), target, page, slug, title, source, count]),
		],
		statsFileName(location.hostname),
	)
	return rows.length
}
