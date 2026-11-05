import { describe, expect, it } from 'vitest'
import connectAi from '../src/admin/pages/settings/ConnectAi.tsx?raw'
import editor from '../src/admin/pages/EditorPage.tsx?raw'
import pagesPage from '../src/admin/pages/PagesPage.tsx?raw'
import setupPage from '../src/admin/pages/SetupPage.tsx?raw'
import styles from '../src/admin/styles.css?raw'

const rule = (selector: string) => styles.slice(styles.indexOf(`\n${selector} {`)).split('}')[0] ?? ''
const px = (block: string, property: string) => Number(block.match(new RegExp(`\\n\\s*${property}: (\\d+)px`))?.[1])

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
