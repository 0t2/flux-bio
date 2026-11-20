// The names the JSON API promises (scripts/api-surface.mjs), held to the code and to the changelog: a name can be
// added freely, and can only go in a release that tells owners what to change. A field that starts asking for more,
// or giving something else, loses a line too.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { newestRelease, readSurface, removalProblem, responseNames, schemaNames, surface, SURFACE_FILE, surfacesBefore } from '../scripts/api-surface.mjs'

const recorded = readSurface(readFileSync(SURFACE_FILE, 'utf8'))
const changelog = readFileSync('CHANGELOG.md', 'utf8')

test('tests/api-surface.json is what the code says the API is', async () => {
	const now = await surface()
	const had = new Set(recorded), has = new Set(now)
	const added = now.filter((name) => !had.has(name)), gone = recorded.filter((name) => !has.has(name))
	assert.deepEqual(
		{ added, gone },
		{ added: [], gone: [] },
		`The API changed and ${SURFACE_FILE} didn't. Run \`pnpm api:surface\` and commit the file${gone.length ? '. Names are gone: read what it prints' : ''}.`,
	)
	// The list is only worth holding if it reads everything: a route, who may call it, a parameter and its values,
	// a body's fields, a block's fields by kind, a response's fields with those it inherits and those inside it,
	// and for each field whether it may be left out or is always there, and its type.
	for (const name of [
		'GET /api/stats query:days optional',
		'PUT /api/pages/{id}/draft header:If-Match: string',
		'PUT /api/settings body.plan optional',
		'PUT /api/settings body.plan: string',
		'PUT /api/settings body.languages[]: string',
		'PATCH /api/links/{id} body.expiresAt: integer',
		'PATCH /api/links/{id} body.expiresAt: null',
		'POST /api/import body.pages[].published: null',
		'PageContent.items[]<kind=link>.hideUrl optional',
		'PageContent.items[]<kind=hours>.week: array',
		'type StateResponse.version always',
		'type StateResponse.role: Role',
		"type Role: 'admin' | 'token'",
		'type UpdateResponse.latest: string | null',
		'type RecentEventJson.labelKey: string',
		'type UsageResponse.account: {…} | null',
		'type UsageResponse.database.limit: number',
		'GET /api/state',
		'POST /api/links for=links-token',
		'DELETE /api/data for=owner',
		'GET /api/stats query:days=90',
		'PUT /api/pages/{id}/draft header:If-Match',
		'PUT /api/pages/{id}/draft body=PageContent',
		'PUT /api/settings body.plan=paid',
		'POST /api/import body.pages[].draft=PageContent',
		'PageContent.items[]<kind=hours>.address',
		'PageContent.appearance.theme=liquid',
		'type StateResponse.version',
		'type RecentEventJson.labelKey',
		'type InsightsJson.places[].region',
		'type UsageResponse.database.limit',
	]) assert.ok(has.has(name), `"${name}" is missing from the list: scripts/api-surface.mjs no longer reads that part of the API.`)
	// A field the API asks for, and one a response may leave out, have no such line.
	for (const name of ['PUT /api/pages/{id}/draft header:If-Match optional', 'POST /api/import body.pages[].draft optional', 'type PageJson.untranslated always'])
		assert.ok(!has.has(name), `"${name}" is in the list, and shouldn't be.`)
})

test('no name has gone from the API without a release that says so', (t) => {
	const earlier = surfacesBefore()
	if (!earlier.length) return t.skip('no git history with the list in it to compare with')
	for (const from of earlier) {
		const problem = removalProblem({ before: from.before, after: recorded, versionBefore: from.versionBefore, changelog })
		assert.equal(problem, null, `Since ${from.commit.slice(0, 7)}: ${problem}`)
	}
})

const release = (heading, body) => `# Changelog\n\nWords.\n\n## ${heading}\n\n${body}\n\n## 0.3.0 - 2026-11-19\n\n### New\n- An entry.\n`

test('a name may go only in a new release with an "Action needed"', () => {
	const before = ['GET /api/a', 'GET /api/b', 'type A.x']
	const args = { before, versionBefore: '0.3.0' }
	// Adding, and changing nothing, need no release at all.
	assert.equal(removalProblem({ ...args, after: [...before, 'GET /api/c'], changelog: release('0.3.0 - 2026-11-19', '### New\n- An entry.') }), null)
	// A removal with its own release and an "Action needed".
	assert.equal(removalProblem({ ...args, after: ['GET /api/a', 'type A.x'], changelog: release('0.4.0 - 2026-11-20', '### Action needed\n- Use `a`.\n\n### Changed\n- An entry.') }), null)
	// The same removal with a release that only says "Changed", with no new release, and a rename, which is a removal too.
	assert.match(removalProblem({ ...args, after: ['GET /api/a', 'type A.x'], changelog: release('0.3.1 - 2026-11-20', '### Changed\n- An entry.') }), /1 name in the API is gone, and 0\.3\.1 in CHANGELOG\.md has no "Action needed"\.\n  - GET \/api\/b\n/)
	assert.match(removalProblem({ ...args, after: ['GET /api/a', 'type A.x'], changelog: release('0.3.0 - 2026-11-19', '### Action needed\n- Old.') }), /no release for it yet: 0\.3\.0 is still the newest/)
	assert.match(removalProblem({ ...args, after: ['GET /api/a', 'GET /api/b', 'type A.y'], changelog: release('0.3.1 - 2026-11-20', '### Fixed\n- An entry.') }), /  - type A\.x\n/)
	assert.deepEqual(newestRelease(release('0.4.0 - 2026-11-20', '### Action needed\n- Do it.')), { version: '0.4.0', actionNeeded: true })
	assert.deepEqual(newestRelease(changelog).version, JSON.parse(readFileSync('package.json', 'utf8')).version)
})

test('a field that asks for more, or gives something else, is a name gone', () => {
	const body = (properties, required = []) => [...schemaNames({ type: 'object', required, properties }, 'PUT /api/x body')]
	const response = (fields) => [...responseNames(`export interface X {\n${fields}\n}\n`)]
	const patch = release('0.3.1 - 2026-11-20', '### Changed\n- An entry.')
	const minor = release('0.4.0 - 2026-11-20', '### Action needed\n- Send `plan`.\n\n### Changed\n- An entry.')
	const breaking = {
		'a request field becomes required': [body({ plan: { type: 'string' } }), body({ plan: { type: 'string' } }, ['plan']), 'PUT /api/x body.plan optional'],
		'a request field stops taking a type': [body({ at: { type: ['integer', 'null'] } }), body({ at: { type: 'integer' } }), 'PUT /api/x body.at: null'],
		'a request field stops taking fractions': [body({ dim: { type: 'number' } }), body({ dim: { type: 'integer' } }), 'PUT /api/x body.dim: number'],
		'a list stops taking a type': [body({ ids: { type: 'array', items: { type: ['string', 'integer'] } } }), body({ ids: { type: 'array', items: { type: 'string' } } }), 'PUT /api/x body.ids[]: integer'],
		'a response field may be missing': [response('\tid: string'), response('\tid?: string'), 'type X.id always'],
		'a response type takes in more': [response('\tlatest: string'), response('\tlatest: string | null'), 'type X.latest: string'],
		'a response type changes inside a list': [response('\trows: { at: number }[]'), response('\trows: { at: string }[]'), 'type X.rows[].at: number'],
	}
	for (const [what, [before, after, gone]] of Object.entries(breaking)) {
		const args = { before, after, versionBefore: '0.3.0' }
		const problem = removalProblem({ ...args, changelog: patch })
		assert.ok(problem?.startsWith('1 name in the API is gone, and 0.3.1 in CHANGELOG.md has no "Action needed".\n'), `${what}: ${problem}`)
		assert.ok(problem.includes(`\n  - ${gone}\n`), `${what}: ${problem}`)
		assert.equal(removalProblem({ ...args, changelog: minor }), null, what)
	}
	// The other way round takes nothing from a caller: a field that may now be left out, a request that takes more,
	// a response field that is now always there, and one more field in an object a response holds.
	const free = {
		'a request field becomes optional': [body({ plan: { type: 'string' } }, ['plan']), body({ plan: { type: 'string' } })],
		'a request field takes one more type': [body({ at: { type: 'integer' } }), body({ at: { anyOf: [{ type: 'integer' }, { type: 'null' }] } })],
		'a request field takes fractions too': [body({ dim: { type: 'integer' } }), body({ dim: { type: 'number' } })],
		'a request field takes anything': [body({ qr: { type: 'object' } }), body({ qr: {} })],
		'a response field is always there': [response('\tid?: string'), response('\tid: string')],
		'a response object gets a field': [response('\tpage: { id: string } | null'), response('\tpage: {\n\t\tid: string\n\t\thandle: string\n\t} | null')],
	}
	for (const [what, [before, after]] of Object.entries(free)) assert.equal(removalProblem({ before, after, versionBefore: '0.3.0', changelog: release('0.3.0 - 2026-11-19', '### New\n- An entry.') }), null, what)
})

test('a schema is read into names: fields, lists, values, unions by what tells them apart, and schemas named elsewhere', () => {
	const item = { type: 'object', properties: { id: { type: 'string' } } }
	const names = schemaNames(
		{
			type: 'object',
			required: ['plan', 'item'],
			properties: {
				plan: { enum: ['free', 'paid'] },
				font: { enum: Array.from({ length: 200 }, (_, index) => `f${index}`) },
				tags: { type: 'array', items: { type: 'string', enum: ['a'] } },
				item: item,
				byName: { type: 'object', additionalProperties: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] } },
				blocks: {
					type: 'array',
					items: { anyOf: [{ properties: { kind: { const: 'link' }, url: { type: 'string' } }, required: ['kind', 'url'] }, { properties: { kind: { const: 'heading' }, title: { type: 'string' } }, required: ['kind'] }] },
				},
				nested: { $ref: '#/$defs/node' },
				content: { $ref: '#/components/schemas/PageContent' },
				expiresAt: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
				size: { type: ['number', 'string'] },
				level: { enum: [1, 'high', null] },
				note: { type: 'string', nullable: true },
				backup: { anyOf: [item, { type: 'null' }] },
			},
			$defs: { node: { properties: { child: { $ref: '#/$defs/node' }, value: {} } } },
		},
		'body',
		new Set(),
		new Map([[JSON.stringify(item), 'Item']]),
	)
	const expected = [
		// Asked for, so no "optional". Its type is that of its values.
		'body.plan', 'body.plan=free', 'body.plan=paid', 'body.plan: string',
		// Too many values to list, but they are still strings.
		'body.font', 'body.font optional', 'body.font: string',
		'body.tags', 'body.tags optional', 'body.tags: array', 'body.tags[]: string', 'body.tags[]=a',
		// A schema with lines of its own is named, which is its type.
		'body.item', 'body.item=Item',
		'body.content', 'body.content optional', 'body.content=PageContent',
		'body.backup', 'body.backup optional', 'body.backup=Item', 'body.backup: null',
		// A number may be whole or not.
		'body.byName', 'body.byName optional', 'body.byName: object', 'body.byName.*: object',
		'body.byName.*.count', 'body.byName.*.count: integer', 'body.byName.*.count: number',
		'body.blocks', 'body.blocks optional', 'body.blocks: array', 'body.blocks[]: object',
		'body.blocks[]<kind=link>.kind', 'body.blocks[]<kind=link>.kind=link', 'body.blocks[]<kind=link>.kind: string',
		'body.blocks[]<kind=link>.url', 'body.blocks[]<kind=link>.url: string',
		'body.blocks[]<kind=heading>.kind', 'body.blocks[]<kind=heading>.kind=heading', 'body.blocks[]<kind=heading>.kind: string',
		'body.blocks[]<kind=heading>.title', 'body.blocks[]<kind=heading>.title optional', 'body.blocks[]<kind=heading>.title: string',
		// A schema inside itself is read once. One that says nothing takes anything.
		'body.nested', 'body.nested optional', 'body.nested: object',
		'body.nested.child', 'body.nested.child optional', 'body.nested.child: object',
		'body.nested.value', 'body.nested.value optional',
		...['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'].map((type) => `body.nested.value: ${type}`),
		// More than one type, however the schema says so.
		'body.expiresAt', 'body.expiresAt optional', 'body.expiresAt: integer', 'body.expiresAt: null',
		'body.size', 'body.size optional', 'body.size: integer', 'body.size: number', 'body.size: string',
		'body.level', 'body.level optional', 'body.level=1', 'body.level=high', 'body.level=null', 'body.level: integer', 'body.level: null', 'body.level: string',
		'body.note', 'body.note optional', 'body.note: null', 'body.note: string',
	]
	assert.deepEqual([...names].sort(), expected.sort())
})

test('response types are read into names, however they are written', () => {
	const names = responseNames(`
/** A comment with { braces } and a: colon. */
export interface Base {
	labelKey?: string
}
export interface Row extends Base {
	// not: a field
	readonly id: string
	kind: 'view' | 'click'
	where:
		| 'a;b'
		| 'c'
	place: { country: string; region: string }[]
	nested: {
		count: number
		/** Inside. */
		deeper: { on: boolean }
	}
	byDay: Record<string, { views: number }>
	pick(value: { ignored: string }): void
	errors: ({ index: number } & Pick<Base, 'labelKey'>)[]
	note?: string | null // "why", if it says
	page: {
		id: string
		handle?: string
	} | null
	last: string
}
export type Role = 'admin' | 'token'
`)
	const expected = [
		// Written with a "?", so not "always": here and where it is inherited.
		'type Base.labelKey', 'type Base.labelKey: string',
		'type Row.labelKey', 'type Row.labelKey: string',
		'type Row.note', 'type Row.note: string | null',
		'type Row.id', 'type Row.id always', 'type Row.id: string',
		'type Row.kind', 'type Row.kind always', "type Row.kind: 'view' | 'click'",
		// Over several lines or one, a type is the same line.
		'type Row.where', 'type Row.where always', "type Row.where: 'a;b' | 'c'",
		// An object type's fields have their own lines, and it says {…} for them.
		'type Row.place', 'type Row.place always', 'type Row.place: {…}[]',
		'type Row.place[].country', 'type Row.place[].country always', 'type Row.place[].country: string',
		'type Row.place[].region', 'type Row.place[].region always', 'type Row.place[].region: string',
		'type Row.nested', 'type Row.nested always', 'type Row.nested: {…}',
		'type Row.nested.count', 'type Row.nested.count always', 'type Row.nested.count: number',
		'type Row.nested.deeper', 'type Row.nested.deeper always', 'type Row.nested.deeper: {…}',
		'type Row.nested.deeper.on', 'type Row.nested.deeper.on always', 'type Row.nested.deeper.on: boolean',
		'type Row.byDay', 'type Row.byDay always', 'type Row.byDay: Record<string, {…}>',
		'type Row.byDay.views', 'type Row.byDay.views always', 'type Row.byDay.views: number',
		'type Row.page', 'type Row.page always', 'type Row.page: {…} | null',
		'type Row.page.id', 'type Row.page.id always', 'type Row.page.id: string',
		'type Row.page.handle', 'type Row.page.handle: string',
		// Inside other brackets an object type isn't read, and stays as written.
		'type Row.errors', 'type Row.errors always', "type Row.errors: ({ index: number } & Pick<Base, 'labelKey'>)[]",
		'type Row.last', 'type Row.last always', 'type Row.last: string',
		// A type with a name of its own: fields only say the name, so what it stands for has a line.
		"type Role: 'admin' | 'token'",
	]
	assert.deepEqual([...names].sort(), expected.sort())
	assert.throws(() => responseNames('export interface Odd {\n\t[key: string]: number\n}\n'), /no fields read from "Odd"/)

	// A type that changes is another line, and a "?" takes "always" away. How the same type is laid out changes nothing.
	const field = (written) => [...responseNames(`export interface X {\n\tlatest${written}\n\tnext: number\n}\n`)].filter((name) => name.startsWith('type X.latest'))
	assert.deepEqual(field(': string'), ['type X.latest', 'type X.latest always', 'type X.latest: string'])
	assert.deepEqual(field(': string | null'), ['type X.latest', 'type X.latest always', 'type X.latest: string | null'])
	assert.deepEqual(field(':\n\t\t| string\n\t\t| null;'), field(': string | null'))
	assert.deepEqual(field('?: string'), ['type X.latest', 'type X.latest: string'])
	assert.deepEqual(field(": 'a  b' |  'c'"), ['type X.latest', 'type X.latest always', "type X.latest: 'a  b' | 'c'"])
})
