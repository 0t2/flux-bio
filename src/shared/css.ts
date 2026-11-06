import { msg, type Message, type Params } from '../templates/msg'

/**
 * `appearance.css`: CSS the owner's AI writes for a page of links, on top of its theme (see the guide topic
 * "customize"). It goes into the public page, which shares its address with the dashboard, so it is checked where it
 * comes in (a draft, a backup, a saved look: refuseBadCss in content.ts) and again when a page is published
 * (publishProblems). Never on a view, where a page is one KV read and nothing else, nor when pages are read back from
 * D1. It takes well under a millisecond for the longest CSS a page may have. The page's CSP holds the same line in the
 * browser: pictures only from this site (pageImages in src/worker/routes/site.ts).
 *
 * CSS runs no scripts, but it can do two things a page must not let it: end the <style> it sits in, and load things.
 * So it may not contain "<" at all, and the only thing it may load is a picture uploaded to this site, at
 * url(/media/<id>). Everything else that could load something is refused: any other url(), the functions that take an
 * address in a string (image(), image-set(), src(), cross-fade()…), @import and @font-face (only the at-rules listed in
 * CSS_AT_RULES are allowed), old browsers' script hooks (expression(), behavior, -moz-binding), and strings that look like
 * addresses, which a newer function could one day load.
 *
 * The check reads the CSS the way a browser does (CSS Syntax Level 3): comments, strings and url() are found where a
 * browser finds them, and escapes are decoded first, so `u\72l(` is a url( as it is for a browser. Matching text
 * instead would miss things: a comment that starts inside a string would hide whatever follows it. Escapes are
 * otherwise allowed anywhere (`content:"\2192"`), since every check sees what they decode to; only the address of a
 * picture has to be written out plainly, so backups and the check for unused pictures can find it.
 *
 * Where this reads more strictly than a browser, it refuses rather than allows: a number before a name is read as two
 * tokens, and CSS with comments is read once more with them taken out, so `ur/**\/l(` is refused too, although a
 * browser would read two names there.
 */
export const CSS_LIMIT = 20_000

/** A picture uploaded here, as MEDIA_ID has it, but never "." or "..", which would climb out of /media/. */
const MEDIA_PATH = /^\/media\/(?!\.\.?$)[\w.-]{1,80}$/

/** The pictures CSS names, by id, for backups and the like. */
export const CSS_MEDIA = /\/media\/([\w.-]+)/g

/** At-rules that load nothing. Vendor prefixes are read without the prefix, so @-webkit-keyframes is @keyframes. */
export const CSS_AT_RULES = ['media', 'supports', 'keyframes', 'layer', 'container', 'property', 'scope', 'starting-style', 'counter-style', 'page']

/** Functions that take a picture or an address, or ran script in old browsers. url() has its own check. */
const LOADERS = ['src', 'image', 'image-set', 'cross-fade', 'element', 'paint', 'expression']

/** Properties that ran script in old browsers. */
const SCRIPT_HOOKS = ['behavior', '-ms-behavior', '-moz-binding']

/** "javascript:…", "https://…", "//host/…" and the like, once the tabs and line breaks an address may hide are gone. */
const ADDRESS = /^(?:(?:[a-z][a-z\d+.-]*:)?\/\/|(?:javascript|vbscript|data|blob|file|filesystem):)/

interface Token {
	type: 'function' | 'url' | 'string' | 'ident' | 'at' | 'close' | 'other'
	/** A name as a browser reads it, escapes decoded, in lowercase; a string's or a url's value. */
	value: string
	/** Where it starts, for the line number. */
	at: number
	/** The text as written, for url() and strings. */
	raw?: string
}

const withoutPrefix = (name: string) => name.replace(/^-[a-z]+-/, '')

/** Why this CSS can't go on a page, or null when it can. Only the first problem is reported. Linear in its length. */
export function cssProblem(source: string): Message | null {
	return read(source, false)
}

/** `again`: this is the CSS with its comments taken out, which mustn't make new ones. */
function read(source: string, again: boolean): Message | null {
	// What a browser reads: one kind of line break, and no NUL (the HTML parser has already made it U+FFFD).
	const s = source.replace(/\r\n?|\f/g, '\n').replace(/\0/g, '\uFFFD')
	const n = s.length
	const problem = (at: number, key: string, params: Params = {}): Message => {
		let line = 1
		for (let k = 0; k < at; k++) if (s.charCodeAt(k) === 10) line++
		return { key, params: { line, ...params } }
	}

	const lt = s.indexOf('<')
	if (lt >= 0) return problem(lt, msg('第 {line} 行：CSS 不能有「<」'))

	const code = (at: number) => (at < n ? s.charCodeAt(at) : -1)
	const isWhitespace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a
	const isHex = (c: number) => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)
	const isNameStart = (c: number) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f || c >= 0x80
	const isName = (c: number) => isNameStart(c) || (c >= 0x30 && c <= 0x39) || c === 0x2d
	const validEscape = (at: number) => code(at) === 0x5c && code(at + 1) !== 0x0a
	const startsName = (at: number) => {
		const c = code(at)
		if (c === 0x2d) return isNameStart(code(at + 1)) || code(at + 1) === 0x2d || validEscape(at + 1)
		return isNameStart(c) || validEscape(at)
	}
	/** The character a backslash at `at` stands for, and where the text goes on after it. */
	const escape = (at: number): [string, number] => {
		let j = at + 1
		if (j >= n) return ['\uFFFD', j]
		if (!isHex(code(j))) {
			const character = String.fromCodePoint(s.codePointAt(j)!)
			return [character, j + character.length]
		}
		const start = j
		while (j < n && j - start < 6 && isHex(code(j))) j++
		const value = parseInt(s.slice(start, j), 16)
		if (isWhitespace(code(j))) j++
		return [value === 0 || (value >= 0xd800 && value <= 0xdfff) || value > 0x10ffff ? '\uFFFD' : String.fromCodePoint(value), j]
	}
	const name = (at: number): [string, number] => {
		let out = ''
		let j = at
		for (;;) {
			const c = code(j)
			if (c >= 0 && isName(c)) out += s[j++]
			else if (validEscape(j)) {
				const [character, next] = escape(j)
				out += character
				j = next
			} else return [out.toLowerCase(), j]
		}
	}

	const tokens: Token[] = []
	/** Where comments start and end, to read the CSS again without them. */
	const comments: [number, number][] = []
	/** Open brackets, and where each opened. */
	const open: { close: string; at: number }[] = []
	const CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
	let i = 0
	while (i < n) {
		const c = code(i)
		const at = i
		if (c === 0x2f && code(i + 1) === 0x2a) {
			const end = s.indexOf('*/', i + 2)
			if (again) return problem(at, msg('第 {line} 行：註解和旁邊的「/」或「*」黏在一起了'))
			if (end < 0) return problem(at, msg('第 {line} 行：註解少了結尾的「*/」'))
			i = end + 2
			comments.push([at, i])
		} else if (isWhitespace(c)) {
			i++
		} else if (c === 0x22 || c === 0x27) {
			let value = ''
			let j = i + 1
			for (;;) {
				const d = code(j)
				if (d === c) {
					j++
					break
				}
				if (d < 0 || d === 0x0a) return problem(at, msg('第 {line} 行：字串少了結尾的引號'))
				if (d === 0x5c) {
					if (j + 1 >= n) j++
					else if (code(j + 1) === 0x0a) j += 2
					else {
						const [character, next] = escape(j)
						value += character
						j = next
					}
				} else value += s[j++]
			}
			tokens.push({ type: 'string', value, at, raw: s.slice(at, j) })
			i = j
		} else if (c === 0x40 && startsName(i + 1)) {
			const [word, next] = name(i + 1)
			tokens.push({ type: 'at', value: word, at })
			i = next
		} else if (startsName(i)) {
			const [word, next] = name(i)
			i = next
			if (code(i) !== 0x28) {
				tokens.push({ type: 'ident', value: word, at })
				continue
			}
			i++
			if (word === 'url') {
				let j = i
				while (isWhitespace(code(j))) j++
				// url( with a quote after it is a function whose argument is a string; without, the address is the token itself.
				if (code(j) !== 0x22 && code(j) !== 0x27) {
					let value = ''
					for (;;) {
						const d = code(j)
						if (d === 0x29) {
							j++
							break
						}
						if (isWhitespace(d)) {
							while (isWhitespace(code(j))) j++
							if (code(j) === 0x29) {
								j++
								break
							}
							return problem(at, msg('第 {line} 行：url() 的寫法不正確'))
						}
						if (d < 0 || d === 0x22 || d === 0x27 || d === 0x28 || d <= 0x08 || d === 0x0b || (d >= 0x0e && d <= 0x1f) || d === 0x7f) {
							return problem(at, msg('第 {line} 行：url() 的寫法不正確'))
						}
						if (d === 0x5c) {
							if (!validEscape(j)) return problem(at, msg('第 {line} 行：url() 的寫法不正確'))
							const [character, next] = escape(j)
							value += character
							j = next
						} else value += s[j++]
					}
					tokens.push({ type: 'url', value, at, raw: s.slice(at, j) })
					i = j
					continue
				}
			}
			tokens.push({ type: 'function', value: word, at })
			open.push({ close: ')', at })
		} else {
			const character = s[i]!
			i++
			if (CLOSE[character]) open.push({ close: CLOSE[character], at })
			else if (character === ')' || character === ']' || character === '}') {
				if (open.pop()?.close !== character) return problem(at, msg('第 {line} 行：「{bracket}」前面沒有對應的括號'), { bracket: character })
				tokens.push({ type: 'close', value: character, at })
			} else tokens.push({ type: 'other', value: character, at })
		}
	}
	const unclosed = open.pop()
	if (unclosed) return problem(unclosed.at, msg('第 {line} 行開始的括號少了結尾的「{bracket}」'), { bracket: unclosed.close })

	const picture = (token: Token) => !token.raw!.includes('\\') && MEDIA_PATH.test(token.value)
	const notAPicture = (token: Token, address: string) =>
		problem(token.at, msg('第 {line} 行：url() 只能用這個網站上傳的圖片，寫成 url(/media/<id>)，不能用 {url}'), { url: address.slice(0, 80) })
	for (let t = 0; t < tokens.length; t++) {
		const token = tokens[t]!
		switch (token.type) {
			case 'at':
				if (!CSS_AT_RULES.includes(withoutPrefix(token.value))) {
					return problem(token.at, msg('第 {line} 行：不能用 @{name}，可以用的是 {allowed}'), { name: token.value, allowed: CSS_AT_RULES.map((rule) => `@${rule}`).join(', ') })
				}
				break
			case 'url':
				if (!picture(token)) return notAPicture(token, token.value)
				break
			case 'function':
				if (token.value === 'url') {
					const [argument, close] = [tokens[t + 1], tokens[t + 2]]
					if (argument?.type !== 'string') return notAPicture(token, argument?.value ?? '')
					if (!picture(argument)) return notAPicture(argument, argument.value)
					if (close?.type !== 'close' || close.value !== ')') return problem(token.at, msg('第 {line} 行：url() 的寫法不正確'))
					t += 2
				} else if (LOADERS.includes(withoutPrefix(token.value))) {
					return problem(token.at, msg('第 {line} 行：不能用 {name}()，CSS 只能用這個網站上傳的圖片，寫成 url(/media/<id>)'), { name: token.value })
				}
				break
			case 'ident':
				if (SCRIPT_HOOKS.includes(token.value)) return problem(token.at, msg('第 {line} 行：不能用 {name}'), { name: token.value })
				break
			case 'string':
				if (ADDRESS.test(token.value.replace(/[\t\n\r]/g, '').replace(/^[\0-\x20]+/, '').toLowerCase())) {
					return problem(token.at, msg('第 {line} 行：「{text}」看起來是網址，CSS 只能用這個網站上傳的圖片'), { text: token.value.slice(0, 80) })
				}
				break
		}
	}
	if (!comments.length) return null
	let rest = ''
	let from = 0
	for (const [start, end] of comments) {
		rest += s.slice(from, start)
		from = end
	}
	return read(rest + s.slice(from), true)
}

/** The ids of the pictures CSS uses. */
export function cssMediaIds(css: string): string[] {
	return [...css.matchAll(CSS_MEDIA)].flatMap((match) => (match[1] ? [match[1]] : []))
}
