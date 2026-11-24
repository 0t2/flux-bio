import { describe, expect, it } from 'vitest'
import qrCss from '../src/admin/qr.css?raw'
import stylesCss from '../src/admin/styles.css?raw'
import componentsCss from '../src/admin/styles/components.css?raw'
import editorCss from '../src/admin/styles/editor.css?raw'
import libraryCss from '../src/admin/styles/library.css?raw'
import responsiveCss from '../src/admin/styles/responsive.css?raw'
import settingsCss from '../src/admin/styles/settings.css?raw'
import shellCss from '../src/admin/styles/shell.css?raw'
import statsCss from '../src/admin/styles/stats.css?raw'
import tokensCss from '../src/admin/styles/tokens.css?raw'

// The dashboard's stylesheet is in cascade layers (src/admin/styles.css), and between layers the later one wins
// whatever the selectors say. A rule that changes a component in one place, ".option.theme .lib-mini", used to win
// by being the more exact selector. In a layer before the component's own rule it never applies: the theme
// thumbnails on 外觀 came out full height, and nothing failed. These hold every such rule to where it works.

const LAYERED: Record<string, string> = { tokens: tokensCss, shell: shellCss, components: componentsCss, editor: editorCss, responsive: responsiveCss }
// In no layer, so over every layer.
const PAGE_SHEETS: Record<string, string> = { library: libraryCss, settings: settingsCss, stats: statsCss, qr: qrCss }

interface Rule {
	selector: string
	file: string
	/** Its layer's place in the order, the page stylesheets after them all. */
	layer: number
	declarations: Map<string, string>
}

/** The style rules of a stylesheet, those inside @media and the like included. No nesting: the dashboard uses none. */
function rulesOf(css: string, file: string, layer: number): Rule[] {
	const rules: Rule[] = []
	const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
	const read = (from: number, to: number): void => {
		let at = from
		while (at < to) {
			const open = text.indexOf('{', at)
			if (open < 0 || open >= to) return
			let depth = 1
			let close = open + 1
			for (; close < to && depth > 0; close++) {
				if (text[close] === '{') depth++
				else if (text[close] === '}') depth--
			}
			const prelude = text.slice(at, open).trim()
			const body = text.slice(open + 1, close - 1)
			if (/^@(media|supports|container|layer)\b/.test(prelude)) read(open + 1, close - 1)
			else if (!prelude.startsWith('@')) {
				const declarations = new Map<string, string>()
				// A ";" inside url(…) or a string is part of a value.
				for (const part of body.split(/;(?![^()]*\))(?=(?:[^"']|"[^"]*"|'[^']*')*$)/)) {
					const colon = part.indexOf(':')
					if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
				}
				for (const selector of prelude.split(/,(?![^()]*\))/)) rules.push({ selector: selector.trim().replace(/\s+/g, ' '), file, layer, declarations })
			}
			at = close
		}
	}
	read(0, text.length)
	return rules
}

/** How exact a selector is: ids, then classes, attributes and pseudo-classes, then element names. */
function specificity(selector: string): [number, number, number] {
	let rest = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '').replace(/:(?:is|not|has)\(/g, ' (')
	const count = (pattern: RegExp) => {
		const found = rest.match(pattern)?.length ?? 0
		rest = rest.replace(pattern, ' ')
		return found
	}
	const attributes = count(/\[[^\]]*\]/g)
	const pseudoElements = count(/::[\w-]+/g)
	const ids = count(/#[\w-]+/g)
	const classes = count(/\.[\w-]+/g)
	const pseudoClasses = count(/:[\w-]+(?:\([^)]*\))?/g)
	const elements = rest.match(/[a-zA-Z][\w-]*/g)?.length ?? 0
	return [ids, classes + attributes + pseudoClasses, elements + pseudoElements]
}
const moreExact = (a: string, b: string): boolean => {
	const [x, y] = [specificity(a), specificity(b)]
	return x[0] - y[0] > 0 || (x[0] === y[0] && (x[1] - y[1] > 0 || (x[1] === y[1] && x[2] - y[2] > 0)))
}

/** The last part of a selector, the one that names the element a rule styles. */
function subject(selector: string): { classes: string[]; element: string; pseudoElement: string } {
	const last = selector.replace(/\((?:[^()]|\([^()]*\))*\)/g, '').split(/\s*[>+~]\s*|\s+/).pop() ?? ''
	return { classes: last.match(/\.[\w-]+/g) ?? [], element: /^[a-zA-Z][\w-]*/.exec(last)?.[0] ?? '', pseudoElement: /::[\w-]+/.exec(last)?.[0] ?? '' }
}
/** A selector that is one class and nothing else: a component's own rule, as ".lib-mini" is. */
const plainClass = (selector: string): string | null => /^\.[\w-]+$/.exec(selector)?.[0] ?? null

const order = /@layer ([^;]+);/.exec(stylesCss)?.[1]?.split(',').map((name) => name.trim()) ?? []
const layered = order.flatMap((name, n) => rulesOf(LAYERED[name] ?? '', `styles/${name}.css`, n))
const pages = Object.entries(PAGE_SHEETS).flatMap(([name, css]) => rulesOf(css, name === 'qr' ? 'qr.css' : `styles/${name}.css`, order.length))

/** Rules that say how a component looks in one place, in a layer where the component's own rule, a later one, always wins. */
function shadowed(rules: Rule[]): string[] {
	const own = new Map<string, Rule[]>()
	for (const rule of rules) {
		const name = plainClass(rule.selector)
		if (name) own.set(name, [...(own.get(name) ?? []), rule])
	}
	const found = new Set<string>()
	for (const narrow of rules) {
		const { classes, pseudoElement } = subject(narrow.selector)
		if (pseudoElement) continue
		for (const name of classes) {
			for (const wide of own.get(name) ?? []) {
				if (wide.layer <= narrow.layer || !moreExact(narrow.selector, wide.selector)) continue
				for (const [property, value] of narrow.declarations) {
					const wins = wide.declarations.get(property)
					if (wins !== undefined && wins !== value) found.add(`${narrow.file}: "${narrow.selector}" sets ${property}, and "${wide.selector}" in ${wide.file}, a later layer, sets it over that`)
				}
			}
		}
	}
	return [...found]
}

describe("the dashboard's cascade layers", () => {
	it('are the five files of src/admin/styles.css, each imported into the layer of its name, in the order declared', () => {
		expect(order).toEqual(['tokens', 'shell', 'components', 'editor', 'responsive'])
		const imported = [...stylesCss.matchAll(/@import '\.\/styles\/([\w-]+)\.css' layer\(([\w-]+)\);/g)].map((match) => [match[1], match[2]])
		expect(imported).toEqual(order.map((name) => [name, name]))
		for (const name of order) expect(LAYERED[name]?.length).toBeGreaterThan(0)
		expect(layered.length).toBeGreaterThan(400)
		expect(pages.length).toBeGreaterThan(400)
	})

	it('read selectors as a browser weighs them', () => {
		expect(specificity('.option.theme .lib-mini')).toEqual([0, 3, 0])
		expect(specificity('button:disabled')).toEqual([0, 1, 1])
		expect(specificity('.btn.publish:hover:not(:disabled)')).toEqual([0, 4, 0])
		expect(specificity(".nav-link[aria-current='page'] svg")).toEqual([0, 2, 1])
		expect(specificity(':where(.a, .b) p::before')).toEqual([0, 0, 2])
		expect(subject('.editor-grid > .preview-col')).toEqual({ classes: ['.preview-col'], element: '', pseudoElement: '' })
		expect(moreExact('.custom-field .textarea', '.textarea')).toBe(true)
		expect(moreExact('.textarea', '.custom-field .textarea')).toBe(false)
	})

	it('find a rule that a later layer leaves without effect', () => {
		const tabs = [
			...rulesOf('.editor-tabs .link-tabs { margin: 0; }', 'styles/shell.css', 1),
			...rulesOf('@media (max-width: 760px) { .link-tabs { margin: -4px 0 20px; color: red; } }', 'styles/components.css', 2),
		]
		expect(shadowed(tabs)).toEqual(['styles/shell.css: ".editor-tabs .link-tabs" sets margin, and ".link-tabs" in styles/components.css, a later layer, sets it over that'])
		// In the component's own layer, or after it, the more exact selector wins as it always did.
		expect(shadowed(tabs.map((rule) => ({ ...rule, layer: 2 })))).toEqual([])
		expect(shadowed(tabs.map((rule) => ({ ...rule, layer: 3 - rule.layer })))).toEqual([])
	})

	it('keep every rule that changes a component in one place where it applies: in the layer of the component’s own rule, or a later one', () => {
		expect(shadowed([...layered, ...pages])).toEqual([])
	})
})
