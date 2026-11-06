import { describe, expect, it } from 'vitest'
import indexHtml from '../admin/index.html?raw'
import main from '../src/admin/main.tsx?raw'
import connectAi from '../src/admin/pages/settings/ConnectAi.tsx?raw'
import editor from '../src/admin/pages/EditorPage.tsx?raw'
import pagesPage from '../src/admin/pages/PagesPage.tsx?raw'
import setupPage from '../src/admin/pages/SetupPage.tsx?raw'
import styles from '../src/admin/styles.css?raw'

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
