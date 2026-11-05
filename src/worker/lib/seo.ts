import type { Locale } from '../../shared/content'
import { esc } from '../../templates/html'

/** One public page: where it lives and the languages it can be read in besides `locale`. */
export interface SitemapPage {
	/** Path of the page's canonical address, e.g. "/" or "/shop". */
	path: string
	updatedAt?: number | null
	locale: Locale
	languages: readonly Locale[]
}

/**
 * The page in each language, for hreflang. The plain address serves the page
 * language, since crawlers send no Accept-Language, and is also what anyone else
 * gets. Empty when there is only one language: nothing to tell apart.
 */
export function languageUrls(url: string, locale: Locale, languages: readonly Locale[]): { hreflang: string; href: string }[] {
	if (!languages.length) return []
	return [
		{ hreflang: locale, href: url },
		...languages.map((code) => ({ hreflang: code, href: `${url}?lang=${code}` })),
		{ hreflang: 'x-default', href: url },
	]
}

/** Each language is a <url> of its own that lists all of them, as hreflang in a sitemap has to be. */
export function sitemapXml(origin: string, pages: readonly SitemapPage[]): string {
	const urls = pages.flatMap((page) => {
		const url = `${origin}${page.path}`
		const alternates = languageUrls(url, page.locale, page.languages)
		const links = alternates.map(({ hreflang, href }) => `<xhtml:link rel="alternate" hreflang="${esc(hreflang)}" href="${esc(href)}"/>`).join('')
		const lastmod = page.updatedAt ? `<lastmod>${new Date(page.updatedAt).toISOString()}</lastmod>` : ''
		const locs = alternates.length ? alternates.filter(({ hreflang }) => hreflang !== 'x-default').map(({ href }) => href) : [url]
		return locs.map((loc) => `<url><loc>${esc(loc)}</loc>${lastmod}${links}</url>`)
	})
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}

/**
 * Crawlers stay out of what is no use in search. /api/openapi.json stays open:
 * some AI tools honour robots.txt when an owner points them at it. Draft
 * previews aren't listed, or crawlers could never read their noindex header.
 * With pages switched off there is nothing to find, so no sitemap is named.
 */
export function robotsTxt(origin: string, pages = true, testSite = false): string {
	if (testSite) return 'User-agent: *\nDisallow: /\n'
	const rules = ['Allow: /api/openapi.json', 'Disallow: /admin/', 'Disallow: /api/', 'Disallow: /_c/']
	return `User-agent: *\n${rules.join('\n')}\n${pages ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`
}
