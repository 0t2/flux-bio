import { describe, expect, it } from 'vitest'
import indexHtml from '../admin/index.html?raw'
import appSource from '../src/admin/App.tsx?raw'
import { fallbackImageFormat, keepAnimatedGif, MAX_UPLOAD_BYTES } from '../src/admin/lib/imageFormat'
import imageSource from '../src/admin/lib/image.ts?raw'
import { currentAdminLocation } from '../src/admin/lib/route'
import main from '../src/admin/main.tsx?raw'
import connectAi from '../src/admin/pages/settings/ConnectAi.tsx?raw'
import editor from '../src/admin/pages/EditorPage.tsx?raw'
import pagesPage from '../src/admin/pages/PagesPage.tsx?raw'
import setupPage from '../src/admin/pages/SetupPage.tsx?raw'
import pageState from '../src/admin/state/page.tsx?raw'
import uiSource from '../src/admin/components/ui.tsx?raw'
import tokensCss from '../src/admin/styles/tokens.css?raw'
import componentsCss from '../src/admin/styles/components.css?raw'
import { emptyContent, emptyLink } from '../src/shared/content'
import { renderBioPage } from '../src/templates/render'

const styles = `${tokensCss}\n${componentsCss}`
const rule = (selector: string) => styles.slice(styles.indexOf(`\n${selector} {`)).split('}')[0] ?? ''
const px = (block: string, property: string) => Number(block.match(new RegExp(`\\n\\s*${property}: (\\d+)px`))?.[1])

describe("the dashboard's own fonts", () => {
	const sheets = [...indexHtml.matchAll(/<link\s+rel="stylesheet"([^>]*?)href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/g)].map((match) => ({
		late: /\bmedia="print"/.test(match[1]!) && /\bdata-late\b/.test(match[1]!),
		families: [...new URL(match[2]!).searchParams.getAll('family')],
	}))
	const sliced = (family: string) => /^Noto (Sans|Serif) (TC|SC|JP|KR|HK)\b/.test(family)

	it('never make the first paint wait for a font that comes as a hundred files', () => {
		// Such a font's stylesheet is tens of kilobytes; the three families the page does wait for come to about one.
		const waitedFor = sheets.filter((sheet) => !sheet.late).flatMap((sheet) => sheet.families)
		expect(waitedFor.length).toBeGreaterThan(0)
		expect(waitedFor.filter(sliced)).toEqual([])
	})

	it('still load the Chinese font, once per file: its weights as one range, turned on when the script starts', () => {
		const late = sheets.filter((sheet) => sheet.late).flatMap((sheet) => sheet.families)
		expect(late).toEqual(['Noto Sans TC:wght@400..700'])
		expect(main).toContain(`document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][data-late]')`)
		expect(main).toMatch(/sheet\.media = 'all'/)
		// Before the first render, so the page is never drawn without it once it has arrived.
		expect(main.indexOf("sheet.media = 'all'")).toBeLessThan(main.indexOf('createRoot(root)'))
	})
})

describe('a switch', () => {
	it('has a knob exactly as tall as the room inside its track, so it sits in the middle', () => {
		const track = rule('.toggle .track')
		const knob = rule('.toggle .knob')
		expect(styles).toMatch(/box-sizing: border-box/)
		expect(px(knob, 'height')).toBeGreaterThan(0)
		expect(px(track, 'height') - 2 * px(track, 'padding')).toBe(px(knob, 'height'))
		expect(px(knob, 'width')).toBe(px(knob, 'height'))
	})
})

describe('a template', () => {
	it("is written in the dashboard's language, Traditional Chinese included, not the new site's English", () => {
		for (const source of [setupPage, pagesPage]) {
			expect(source).toContain('starter: start, locale: language()')
			expect(source).not.toContain("language() !== 'zh-TW'")
		}
	})
})

describe('connecting an AI', () => {
	it('offers Claude Code, Codex and Cursor, with a prompt to paste and nothing to download', () => {
		expect(connectAi).toContain("const TOOLS = ['Claude Code', 'Codex', 'Cursor'] as const")
		expect(connectAi).toContain('<Block text={startPrompt(origin, token)} />')
		expect(connectAi).not.toMatch(/skill\.md|downloadBlob|下載/)
	})
})

describe('the page editor', () => {
	it('has the tabs 內容 and 外觀, with looks beyond those left to the AI', () => {
		expect([...editor.matchAll(/\{ href: '([^']+)', label: msg\(/g)].map((match) => match[1])).toEqual(['/', '/appearance'])
		expect(editor).not.toContain('ThemesPanel')
	})
})

describe('dashboard reliability', () => {
	it('computes the current admin path lazily for login redirects', () => {
		expect(currentAdminLocation('/admin', '')).toBe('/')
		expect(currentAdminLocation('/admin/', '')).toBe('/')
		expect(currentAdminLocation('/admin/short-links', '?q=sale')).toBe('/short-links?q=sale')
		expect(currentAdminLocation('/admin/login', '?next=%2F')).toBe('/login?next=%2F')
	})

	it('wraps the dashboard in an ErrorBoundary and keeps Router mounted across language switches', () => {
		expect(appSource).toContain('<ErrorBoundary>')
		expect(appSource).not.toContain('key={language}')
	})

	it('clears load errors on page switch, retries transient autosave failures, and memoizes PageStore', () => {
		expect(pageState).toContain('setError(null)')
		expect(pageState).toContain('RETRY_BASE_DELAY')
		expect(pageState).toContain("addEventListener('online'")
		expect(pageState).toContain('useMemo<PageStore>')
		expect(pageState).toContain('cloneDraftForEdit')
		expect(pageState).toContain('useDeferredValue(draft)')
	})

	it('stamps data-key only when keyed preview is requested, never in live or plain preview HTML', () => {
		const content = emptyContent('Mei')
		content.items = [{ ...emptyLink(), id: 'item-key-1', title: 'Docs', url: 'https://example.com', slug: 'docs' }]
		const keyed = renderBioPage(content, { mode: 'preview', keyed: true, mediaUrl: (id) => `/media/${id}` })
		const plain = renderBioPage(content, { mode: 'preview', mediaUrl: (id) => `/media/${id}` })
		const live = renderBioPage(content, { mode: 'live', mediaUrl: (id) => `/media/${id}`, linkHref: (l) => `/${l.slug}` })
		expect(keyed).toContain('data-key="item-key-1"')
		expect(plain).not.toContain('data-key=')
		expect(live).not.toContain('data-key=')
	})

	it('preserves animated GIFs within size limits and keeps PNG alpha when WebP encoding is unavailable', () => {
		expect(keepAnimatedGif({ type: 'image/gif', size: 512_000 }, { width: 600, height: 400 }, { maxWidth: 1400, maxHeight: 1400 })).toBe(true)
		expect(keepAnimatedGif({ type: 'image/gif', size: 512_000 }, { width: 400, height: 400 }, { maxWidth: 800, maxHeight: 800, square: true })).toBe(true)
		// Non-square GIFs requested as square avatars must still be cropped on canvas.
		expect(keepAnimatedGif({ type: 'image/gif', size: 512_000 }, { width: 600, height: 400 }, { maxWidth: 800, maxHeight: 800, square: true })).toBe(false)
		// GIFs past the 2 MB Worker limit still resize through canvas.
		expect(keepAnimatedGif({ type: 'image/gif', size: MAX_UPLOAD_BYTES + 1 }, { width: 400, height: 400 }, { maxWidth: 1400, maxHeight: 1400 })).toBe(false)

		expect(fallbackImageFormat('image/png')).toEqual({ type: 'image/png', quality: 1 })
		expect(fallbackImageFormat('image/webp')).toEqual({ type: 'image/png', quality: 1 })
		expect(fallbackImageFormat('image/jpeg')).toEqual({ type: 'image/jpeg', quality: 0.88 })
		expect(imageSource).toContain('keepAnimatedGif(file, bitmap, options)')
		expect(imageSource).toContain('fallbackImageFormat(file.type)')
	})

	it('keeps a persistent ARIA live region for toasts and restores focus when closing popovers', () => {
		expect(uiSource).toContain('className="toast-region" role="status" aria-live="polite" aria-atomic="true"')
		expect(uiSource).not.toContain('if (!message) return null')
		expect(uiSource).toContain('restoreTriggerFocus()')
	})
})
