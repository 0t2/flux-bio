// Finds the dashboard's translation keys in source files, and the Chinese text
// that isn't marked for translation yet. Used by tests/i18n.test.ts and
// scripts/i18n.mjs. Pure functions over { path: source text }.

const HAN = /[㐀-鿿豈-﫿]/
// t('…'), tr(…), msg(…) and fill(…) with a plain string as the first argument.
const CALL = /\b(?:t|tr|msg|fill)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.|\$(?!\{))*)`)/g

const unescape = (text: string) => text.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n')

/** Comments out, so they neither count as keys nor as untranslated text. `image/*` in an accept attribute is no comment. */
function stripComments(source: string): string {
	return source.replace(/(?<!\w)\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (line, before: string) => before + ' '.repeat(line.length - before.length))
}

export function findKeys(sources: Record<string, string>): Set<string> {
	const keys = new Set<string>()
	for (const source of Object.values(sources)) {
		for (const match of stripComments(source).matchAll(CALL)) keys.add(unescape(match[1] ?? match[2] ?? match[3] ?? ''))
	}
	keys.delete('')
	return keys
}

/**
 * Lines with Chinese text outside t()/msg() calls and comments. A line opts out
 * with an `i18n-ignore` comment, a block with `i18n-ignore-start` … `i18n-ignore-end`.
 */
export function findUntranslated(sources: Record<string, string>): string[] {
	const found: string[] = []
	for (const [path, source] of Object.entries(sources)) {
		const lines = source.split('\n')
		const code = stripComments(source).replace(CALL, (call) => call.replace(/[^\n]/g, ' ')).split('\n')
		let skipping = false
		code.forEach((line, index) => {
			const original = lines[index]!
			if (original.includes('i18n-ignore-start')) skipping = true
			if (HAN.test(line) && !skipping && !original.includes('i18n-ignore')) found.push(`${path}:${index + 1}: ${original.trim()}`)
			if (original.includes('i18n-ignore-end')) skipping = false
		})
	}
	return found
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')

/** What a language file lacks, has too many of, or gets wrong. */
export function checkLocale(keys: Set<string>, words: Record<string, string>): { missing: string[]; extra: string[]; broken: string[] } {
	const missing = [...keys].filter((key) => typeof words[key] !== 'string' || !words[key]!.trim())
	const extra = Object.keys(words).filter((key) => !keys.has(key))
	const broken = Object.entries(words)
		.filter(([key, value]) => keys.has(key) && value.trim() && placeholders(key) !== placeholders(value))
		.map(([key]) => key)
	return { missing, extra, broken }
}
