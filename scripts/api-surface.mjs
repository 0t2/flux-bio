// What the JSON API promises to the agents and integrations that call it, as one sorted list of names:
// every route, its parameters and the values they take, the fields of each request body and of a page's
// content (from the OpenAPI document), and the fields of each response (the interfaces in src/shared/api.ts).
//   pnpm api:surface    writes tests/api-surface.json, and says what was added and what is gone
// tests/api-surface.test.mjs fails while the file isn't what the code says, so a change to the API always shows in a
// pull request's diff. Adding is free. Taking a name away, which is what a rename is too, breaks whoever used it:
// the test then asks for a release with an "Action needed" that says so (AGENTS.md, "The changelog and the version").
// A change to a field that breaks whoever used it takes a line away too, so the same rule holds it:
//   requests    "<field> optional" where a field may be left out, which goes when it becomes required, and
//               "<field>: <type>" for each JSON type it takes, which goes when it stops taking one
//   responses   "<field> always" where a field is always there, which goes when it may be missing, and
//               "<field>: <type as written>", which goes when the type changes at all
// Taking more in a request only adds lines. A reader of a response is broken by a type it never saw, so there
// any change counts.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SURFACE_FILE = 'tests/api-surface.json'
/** A longer list of values is a catalogue, such as the fonts: its members come and go without breaking anyone. */
const VALUES_LISTED = 80

const resolveRef = (rootSchema, ref) => ref.slice(2).split('/').reduce((node, key) => node?.[key], rootSchema)

/** The property that tells the members of a union apart, as "<kind=link>", if this member has one. */
function memberTag(member) {
	for (const [name, property] of Object.entries(member?.properties ?? {})) if (property && 'const' in property) return `<${name}=${property.const}>`
	return ''
}

/** The kinds of JSON value. A whole number is a kind of its own, so that a field taking any number after only whole ones took more, not something else. */
const JSON_TYPES = ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']
const typeOfValue = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value)

/**
 * The kinds of JSON value a schema takes. A schema that says nothing takes them all. One named elsewhere gives none:
 * its "=Name" line is its type, and goes when it does.
 */
function acceptedTypes(schema, known = new Map(), rootSchema = schema, open = new Set()) {
	if (!schema || typeof schema !== 'object') return JSON_TYPES
	if (schema !== rootSchema && known.size && schema.properties && known.has(JSON.stringify(schema))) return []
	if (typeof schema.$ref === 'string') {
		if ((!schema.$ref.startsWith('#/$defs/') && !schema.$ref.startsWith('#/definitions/')) || open.has(schema.$ref)) return []
		open.add(schema.$ref)
		const types = acceptedTypes(resolveRef(rootSchema, schema.$ref), known, rootSchema, open)
		open.delete(schema.$ref)
		return types
	}
	const of = (member) => acceptedTypes(member, known, rootSchema, open)
	if (schema.type !== undefined) return [...new Set([schema.type, schema.nullable ? 'null' : []].flat().flatMap((type) => (type === 'number' ? ['integer', 'number'] : [type])))].sort()
	if ('const' in schema) return [typeOfValue(schema.const)]
	if (Array.isArray(schema.enum)) return [...new Set(schema.enum.map(typeOfValue))].sort()
	const either = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
	if (either.length) return [...new Set(either.flatMap(of))].sort()
	if (schema.allOf?.length) return schema.allOf.map(of).reduce((all, types) => all.filter((type) => types.includes(type)))
	if (schema.properties || schema.additionalProperties) return ['object']
	if (schema.items) return ['array']
	return JSON_TYPES
}

/**
 * Every name and listed value a JSON Schema holds, each as `prefix` and the path to it, and for each field whether it
 * may be left out and the kinds of value it takes. `known` names schemas that have lines of their own, by their JSON:
 * where one turns up inside another, as a page's content does in a backup, it is named there and not unfolded again.
 */
export function schemaNames(schema, prefix, out = new Set(), known = new Map(), rootSchema = schema, open = new Set()) {
	if (!schema || typeof schema !== 'object') return out
	if (schema !== rootSchema && known.size && schema.properties) {
		const name = known.get(JSON.stringify(schema))
		if (name) return out.add(`${prefix}=${name}`)
	}
	const types = (inner, at) => {
		for (const type of acceptedTypes(inner, known, rootSchema)) out.add(`${at}: ${type}`)
	}
	if (typeof schema.$ref === 'string') {
		// Another document's schema is named, not unfolded: it has its own lines. A schema inside itself stops here.
		if (!schema.$ref.startsWith('#/$defs/') && !schema.$ref.startsWith('#/definitions/')) return out.add(`${prefix}=${schema.$ref.split('/').at(-1)}`)
		if (open.has(schema.$ref)) return out
		open.add(schema.$ref)
		schemaNames(resolveRef(rootSchema, schema.$ref), prefix, out, known, rootSchema, open)
		open.delete(schema.$ref)
		return out
	}
	if ('const' in schema) out.add(`${prefix}=${schema.const}`)
	if (Array.isArray(schema.enum) && schema.enum.length <= VALUES_LISTED) for (const value of schema.enum) out.add(`${prefix}=${value}`)
	for (const [name, property] of Object.entries(schema.properties ?? {})) {
		out.add(`${prefix}.${name}`)
		if (!schema.required?.includes(name)) out.add(`${prefix}.${name} optional`)
		types(property, `${prefix}.${name}`)
		schemaNames(property, `${prefix}.${name}`, out, known, rootSchema, open)
	}
	if (schema.items) {
		types(schema.items, `${prefix}[]`)
		schemaNames(schema.items, `${prefix}[]`, out, known, rootSchema, open)
	}
	if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
		types(schema.additionalProperties, `${prefix}.*`)
		schemaNames(schema.additionalProperties, `${prefix}.*`, out, known, rootSchema, open)
	}
	for (const key of ['anyOf', 'oneOf', 'allOf']) {
		for (const member of schema[key] ?? []) {
			const resolved = typeof member?.$ref === 'string' && member.$ref.startsWith('#/$defs/') ? resolveRef(rootSchema, member.$ref) : member
			schemaNames(member, `${prefix}${memberTag(resolved)}`, out, known, rootSchema, open)
		}
	}
	return out
}

/** Where the bracket opened at `start` closes. Brackets inside quotes don't count. */
function closing(text, start) {
	const pairs = { '{': '}', '(': ')', '[': ']' }
	const stack = []
	for (let i = start; i < text.length; i++) {
		const char = text[i]
		if (char === "'" || char === '"' || char === '`') {
			i = text.indexOf(char, i + 1)
			if (i < 0) break
		} else if (pairs[char]) stack.push(pairs[char])
		else if (char === stack.at(-1)) {
			stack.pop()
			if (!stack.length) return i
		}
	}
	throw new Error(`src/shared/api.ts: a bracket opened at character ${start} never closes.`)
}

/**
 * The type written from `start`: where it ends, and its text on one line. It runs to the end of the line, or over the
 * next ones while a bracket is open or a union goes on. With a name in `inside`, the properties of the object types
 * in it are read into `out` under that name, and the text has `{…}` for each: its fields have lines of their own, so
 * one more of them changes no line. An object type inside other brackets is not read, and stays in the text as written.
 */
function typeAt(body, start, inside, out) {
	let written = ''
	let i = start
	for (; i < body.length; i++) {
		const char = body[i]
		let end = i
		if (char === "'" || char === '"' || char === '`') {
			end = body.indexOf(char, i + 1)
			if (end < 0) throw new Error(`src/shared/api.ts: a quote opened at character ${i} never closes.`)
		} else if (char === '{' && inside !== null) {
			end = closing(body, i)
			typeNames(body.slice(i + 1, end), `${inside}${body.startsWith('[]', end + 1) ? '[]' : ''}`, out)
			written += '{…}'
			i = end
			continue
		} else if (char === '/' && body[i + 1] === '/') {
			// A comment after a field is no part of its type.
			const line = body.indexOf('\n', i)
			i = (line < 0 ? body.length : line) - 1
			continue
		} else if (char === '(' || char === '[' || char === '{') end = closing(body, i)
		else if (char === ';') break
		else if (char === '\n' && !/^\s*[|&]/.test(body.slice(i + 1)) && !/[|&:=]\s*$/.test(body.slice(0, i))) break
		written += body.slice(i, end + 1)
		i = end
	}
	// One line: spaces and line breaks become one space, except inside quotes, and a union's leading bar goes.
	const type = written.replace(/('[^']*'|"[^"]*"|`[^`]*`)|\s+/g, (_, quoted) => quoted ?? ' ').trim().replace(/^[|&] /, '').replace(/\s*,$/, '')
	return { end: i, type }
}

/**
 * The properties written between an interface's or an object type's braces, with those of the object types inside
 * them. Each also has "always" unless it is written with a "?", and its type as written.
 */
function typeNames(body, prefix, out) {
	let i = 0
	while (i < body.length) {
		const rest = body.slice(i)
		const blank = /^[\s;,]+/.exec(rest)
		if (blank) {
			i += blank[0].length
			continue
		}
		// Anything else between the braces, a method or an index signature, is passed over to where it ends.
		const property = /^(?:readonly\s+)?(\w+)(\??)\s*:/.exec(rest)
		const inside = property ? `${prefix}.${property[1]}` : null
		if (property) {
			out.add(inside)
			i += property[0].length
		}
		const { end, type } = typeAt(body, i, inside, out)
		i = end
		if (property) {
			if (!property[2]) out.add(`${inside} always`)
			out.add(`${inside}: ${type}`)
		}
	}
	return out
}

/**
 * The fields of every response: each exported interface in src/shared/api.ts, with what it extends. A type the file
 * gives a name to (`export type Role = …`) has a line with what it stands for, since fields only say its name.
 */
export function responseNames(source, only = null) {
	const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
	// From a file that isn't the API's own, only the types the API's responses name are wanted.
	const wanted = (name) => !only || only.includes(name)
	const own = new Map()
	const parents = new Map()
	for (const match of code.matchAll(/^export interface (\w+)(?: extends ([\w, ]+))? \{/gm)) {
		const open = match.index + match[0].length - 1
		own.set(match[1], typeNames(code.slice(open + 1, closing(code, open)), '', new Set()))
		parents.set(match[1], match[2] ? match[2].split(',').map((name) => name.trim()) : [])
	}
	// An interface written in a way the pattern above doesn't know, with a type parameter or extending an Omit<…>,
	// would be left out without a word, and its fields with it.
	const declared = [...code.matchAll(/^export interface (\w+)/gm)].map((match) => match[1])
	const unread = declared.filter((name) => wanted(name) && !own.has(name))
	if (unread.length) throw new Error(`src/shared/api.ts: scripts/api-surface.mjs can't read how ${unread.map((name) => `"${name}"`).join(', ')} ${unread.length === 1 ? 'is' : 'are'} declared, so ${unread.length === 1 ? 'its' : 'their'} fields would be missing from the list.`)
	const out = new Set()
	for (const match of code.matchAll(/^export type (\w+) =/gm)) {
		if (!wanted(match[1])) continue
		const fields = new Set()
		out.add(`type ${match[1]}: ${typeAt(code, match.index + match[0].length, '', fields).type}`)
		for (const field of fields) out.add(`type ${match[1]}${field}`)
	}
	const add = (name, from, seen = new Set()) => {
		if (seen.has(from)) return
		seen.add(from)
		for (const field of own.get(from) ?? []) out.add(`type ${name}${field}`)
		for (const parent of parents.get(from) ?? []) add(name, parent, seen)
	}
	for (const name of own.keys()) {
		if (!wanted(name)) continue
		if (!own.get(name).size && !parents.get(name).length) throw new Error(`src/shared/api.ts: no fields read from "${name}". scripts/api-surface.mjs can't read how it is written.`)
		add(name, name)
	}
	return out
}

/** The list, sorted. It is built from the code, so it needs no deployment. */
export async function surface() {
	const { module: openapi } = await runnerImport(join(root, 'src/worker/lib/openapi.ts'))
	const out = new Set()
	const document = openapi.openApiDocument()
	const known = new Map(Object.entries(document.components.schemas).map(([name, schema]) => [JSON.stringify(schema), name]))
	for (const op of openapi.OPERATIONS) {
		const name = `${op.method.toUpperCase()} ${op.path}`
		out.add(name)
		// Who may call it, one line for each that may: taking a route away from tokens breaks them as much as removing
		// it, and then a line goes, while letting more callers in only adds one.
		out.add(`${name} for=owner`)
		if (!op.owner) out.add(`${name} for=full-token`)
		if (op.linksToken || op.open) out.add(`${name} for=links-token`)
		if (op.open) out.add(`${name} for=anyone`)
		// Which type in src/shared/api.ts it answers with: the fields are that type's lines, further down.
		if (op.returns) out.add(`${name} returns=${op.returns}`)
		// The document leaves owner-only routes out, since no token can call them. An agent holding the admin
		// password can, and the hand-over and pnpm reset-password do: their parameters and bodies are promised too.
		const described = document.paths[op.path]?.[op.method] ?? openapi.operationObject(op)
		for (const parameter of described.parameters ?? []) {
			out.add(`${name} ${parameter.in}:${parameter.name}`)
			if (!parameter.required) out.add(`${name} ${parameter.in}:${parameter.name} optional`)
			for (const type of acceptedTypes(parameter.schema)) out.add(`${name} ${parameter.in}:${parameter.name}: ${type}`)
			for (const value of parameter.schema?.enum ?? []) out.add(`${name} ${parameter.in}:${parameter.name}=${value}`)
		}
		if (described.requestBody && !described.requestBody.required) out.add(`${name} body optional`)
		for (const [type, body] of Object.entries(described.requestBody?.content ?? {})) {
			if (type === 'application/json') schemaNames(body.schema, `${name} body`, out, known)
			else out.add(`${name} body=${type}`)
		}
		for (const type of Object.keys(described.responses?.['200']?.content ?? {})) out.add(`${name} returns=${type}`)
	}
	for (const [name, schema] of Object.entries(document.components.schemas)) schemaNames(schema, name, out)
	for (const name of responseNames(readFileSync(join(root, 'src/shared/api.ts'), 'utf8'))) out.add(name)
	// The types a response names that are written in another file, which api.ts only imports.
	for (const [file, names] of Object.entries(TYPES_ELSEWHERE)) for (const name of responseNames(readFileSync(join(root, file), 'utf8'), names)) out.add(name)
	// And those made from a zod schema, read from the schema. Their lines are a request's (`optional`, a line for each
	// kind of value), so a field renamed or removed is seen, though not one that may now be missing from a response.
	for (const [file, schemas] of Object.entries(SCHEMAS_ELSEWHERE)) {
		const { module } = await runnerImport(join(root, file))
		for (const [name, schema] of Object.entries(schemas)) schemaNames(openapi.jsonSchema(module[schema]), `type ${name}`, out, known)
	}
	const names = [...out]
	// A route that says it answers with a type the list has no lines for says nothing.
	for (const op of openapi.OPERATIONS) {
		if (op.returns && !names.some((name) => name.startsWith(`type ${op.returns}.`) || name.startsWith(`type ${op.returns}:`))) {
			throw new Error(`${op.method.toUpperCase()} ${op.path} returns "${op.returns}", and src/shared/api.ts exports no such interface or type.`)
		}
	}
	return names.sort()
}

/** Types in the API's responses that src/shared/api.ts imports: which file writes each as an interface or a type. */
const TYPES_ELSEWHERE = {
	'src/templates/msg.ts': ['Params', 'Message'],
	'src/shared/community.ts': ['BaseThemeName'],
	'src/shared/fonts.ts': ['GoogleFont'],
	'src/shared/translations.ts': ['Untranslated'],
	'src/shared/validate.ts': ['Problem'],
}
/** And which zod schema each of the others is made from. */
const SCHEMAS_ELSEWHERE = {
	'src/shared/content.ts': { Settings: 'SettingsSchema', ThemePreset: 'ThemePresetSchema', SavedTheme: 'SavedThemeSchema' },
	'src/shared/community.ts': { CommunityTheme: 'CommunityThemeSchema' },
	'src/shared/backup.ts': { Backup: 'BackupSchema' },
}

export const readSurface = (text) => JSON.parse(text)
export const writeSurface = (names) => `${JSON.stringify(names, null, '\t')}\n`

/** The newest release in CHANGELOG.md: its version, whether it has something for an owner to do, and what that says. */
export function newestRelease(changelog) {
	const lines = changelog.split(/\r?\n/)
	const start = lines.findIndex((line) => line.startsWith('## '))
	if (start < 0) return { version: null, actionNeeded: false, action: '' }
	const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
	const section = lines.slice(start + 1, end < 0 ? undefined : end)
	const from = section.findIndex((line) => line.trim() === '### Action needed')
	const to = section.findIndex((line, index) => index > from && line.startsWith('### '))
	return { version: lines[start].slice(3).split(' - ')[0].trim(), actionNeeded: from >= 0, action: from < 0 ? '' : section.slice(from + 1, to < 0 ? undefined : to).join('\n') }
}

/** The members of a union written at the top of a type, `string | null` or `'a' | 'b'[]`: split where no bracket or quote is open. */
function unionMembers(type) {
	const members = []
	let depth = 0
	let quote = null
	let from = 0
	for (let i = 0; i < type.length; i++) {
		const char = type[i]
		if (quote) quote = char === quote ? null : quote
		else if (char === "'" || char === '"' || char === '`') quote = char
		else if ('([{<'.includes(char)) depth++
		else if (')]}>'.includes(char)) depth--
		else if (!depth && type.startsWith(' | ', i)) {
			members.push(type.slice(from, i))
			from = i + 3
			i += 2
		}
	}
	return [...members, type.slice(from)]
}

/**
 * A line as it is compared. A response's type is kept as written, and `null | string` for `string | null` is the same
 * type written another way: so a union's members are put in one order before two lists are compared.
 */
export function canonical(name) {
	const at = name.indexOf(': ')
	return name.startsWith('type ') && at > 0 ? `${name.slice(0, at)}: ${unionMembers(name.slice(at + 2)).sort().join(' | ')}` : name
}

/** Words in a line of the list that say how it is written, not what is promised. */
const NOT_NAMES = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'api', 'body', 'query', 'path', 'header', 'type', 'for', 'returns', 'optional', 'always', 'string', 'number', 'integer', 'boolean', 'null', 'object', 'array', 'true', 'false', 'undefined'])

/** Whether what an "Action needed" says in `code` names a line of the list: its route, or a word of it. */
function namedIn(name, spans) {
	const route = /^[A-Z]+ (\/api\/\S*)/.exec(name)?.[1]
	const words = (name.match(/[A-Za-z_][\w-]*/g) ?? []).filter((word) => word.length > 1 && !NOT_NAMES.has(word))
	return spans.some((span) => (route && span.includes(route)) || words.some((word) => new RegExp(`(^|[^\\w-])${word}($|[^\\w-])`).test(span)))
}

const numbers = (version) => (/^\d+\.\d+\.\d+$/.test(version ?? '') ? version.split('.').map(Number) : null)
/** Whether release `a` comes after `b`. Versions that aren't three numbers are only told apart. */
function newer(a, b) {
	const [x, y] = [numbers(a), numbers(b)]
	if (!x || !y) return a !== b
	return x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2]
}

/**
 * Why names may not go from `before` to `after` as things are, or null when they may: nothing went, or the change
 * comes with a release of its own, newer than the one before, whose "Action needed" names in `code` something that
 * went. An "Action needed" about something else is no word to whoever used what is gone.
 */
export function removalProblem({ before, after, versionBefore, changelog }) {
	const kept = new Set(after.map(canonical))
	const gone = before.filter((name) => !kept.has(canonical(name)))
	if (!gone.length) return null
	const release = newestRelease(changelog)
	const released = Boolean(release.version) && newer(release.version, versionBefore)
	const spans = [...release.action.matchAll(/`([^`]+)`/g)].map((match) => match[1])
	if (released && release.actionNeeded && gone.some((name) => namedIn(name, spans))) return null
	const why = !released
		? `CHANGELOG.md has no release for it yet: ${versionBefore} is still the newest.`
		: !release.actionNeeded
			? `${release.version} in CHANGELOG.md has no "Action needed".`
			: `the "Action needed" of ${release.version} in CHANGELOG.md names none of them. Say there, in \`code\`, what went and what to use instead.`
	return [
		`${gone.length} name${gone.length > 1 ? 's' : ''} in the API ${gone.length > 1 ? 'are' : 'is'} gone, and ${why}`,
		...gone.slice(0, 40).map((name) => `  - ${name}`),
		...(gone.length > 40 ? [`  … and ${gone.length - 40} more`] : []),
		'An agent, a shortcut or an integration that uses one stops working when a site updates. Either keep the old name working,',
		'or make this a release with an "Action needed" that says what to change (the next minor: AGENTS.md, "The changelog and the version").',
	].join('\n')
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

/**
 * The list and the version as they were where this work started: where the branch left main, which on main itself is
 * the commit being built, so there the commit before it as well. Empty without git or without that history, as in a
 * folder downloaded as an archive, and a commit from before the list was kept is passed over.
 */
export function surfacesBefore() {
	const commits = []
	try {
		const head = git('rev-parse', 'HEAD').trim()
		commits.push(git('merge-base', 'HEAD', 'origin/main').trim())
		if (commits[0] === head) commits.push(git('rev-parse', 'HEAD~1').trim())
	} catch {}
	return commits.flatMap((commit) => {
		try { return [{ commit, before: readSurface(git('show', `${commit}:${SURFACE_FILE}`)), versionBefore: JSON.parse(git('show', `${commit}:package.json`)).version }] }
		catch { return [] }
	})
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const file = join(root, SURFACE_FILE)
	let old = []
	try { old = readSurface(readFileSync(file, 'utf8')) } catch {}
	const names = await surface()
	writeFileSync(file, writeSurface(names))
	const had = new Set(old), has = new Set(names)
	const added = names.filter((name) => !had.has(name)), gone = old.filter((name) => !has.has(name))
	for (const name of added) console.log(`+ ${name}`)
	for (const name of gone) console.log(`- ${name}`)
	console.log(`${SURFACE_FILE}: ${names.length} names${added.length || gone.length ? `, ${added.length} added and ${gone.length} gone` : ', unchanged'}.`)
	if (gone.length) console.log('Names that go break whoever uses them: that takes a release with an "Action needed" (AGENTS.md, "The changelog and the version").')
}
