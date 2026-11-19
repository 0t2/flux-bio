// The names the JSON API promises (scripts/api-surface.mjs), held to the code and to the changelog: a name can be
// added freely, and can only go in a release that tells owners what to change.
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
	// a body's fields, a block's fields by kind, a response's fields with those it inherits and those inside it.
	for (const name of [
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
})

test('no name has gone from the API without a release that says so', (t) => {
	const earlier = surfacesBefore()
	if (!earlier.length) return t.skip('no git history with the list in it to compare with')
	for (const from of earlier) {
		const problem = removalProblem({ before: from.before, after: recorded, versionBefore: from.versionBefore, changelog })
		assert.equal(problem, null, `Since ${from.commit.slice(0, 7)}: ${problem}`)
	}
})

test('a name may go only in a new release with an "Action needed"', () => {
	const release = (heading, body) => `# Changelog\n\nWords.\n\n## ${heading}\n\n${body}\n\n## 0.3.0 - 2026-11-19\n\n### New\n- An entry.\n`
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

test('a schema is read into names: fields, lists, values, unions by what tells them apart, and schemas named elsewhere', () => {
	const item = { type: 'object', properties: { id: { type: 'string' } } }
	const names = schemaNames(
		{
			type: 'object',
			properties: {
				plan: { enum: ['free', 'paid'] },
				font: { enum: Array.from({ length: 200 }, (_, index) => `f${index}`) },
				tags: { type: 'array', items: { type: 'string', enum: ['a'] } },
				item: item,
				byName: { type: 'object', additionalProperties: { type: 'object', properties: { count: { type: 'number' } } } },
				blocks: { type: 'array', items: { anyOf: [{ properties: { kind: { const: 'link' }, url: {} } }, { properties: { kind: { const: 'heading' }, title: {} } }] } },
				nested: { $ref: '#/$defs/node' },
				content: { $ref: '#/components/schemas/PageContent' },
			},
			$defs: { node: { properties: { child: { $ref: '#/$defs/node' }, value: {} } } },
		},
		'body',
		new Set(),
		new Map([[JSON.stringify(item), 'Item']]),
	)
	assert.deepEqual([...names].sort(), [
		'body.blocks',
		'body.blocks[]<kind=heading>.kind',
		'body.blocks[]<kind=heading>.kind=heading',
		'body.blocks[]<kind=heading>.title',
		'body.blocks[]<kind=link>.kind',
		'body.blocks[]<kind=link>.kind=link',
		'body.blocks[]<kind=link>.url',
		'body.byName',
		'body.byName.*.count',
		'body.content',
		'body.content=PageContent',
		'body.font',
		'body.item',
		'body.item=Item',
		'body.nested',
		'body.nested.child',
		'body.nested.value',
		'body.plan',
		'body.plan=free',
		'body.plan=paid',
		'body.tags',
		'body.tags[]=a',
	])
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
	last: string
}
export type Role = 'admin' | 'token'
`)
	assert.deepEqual([...names].sort(), [
		'type Base.labelKey',
		'type Row.byDay',
		'type Row.byDay.views',
		'type Row.id',
		'type Row.kind',
		'type Row.labelKey',
		'type Row.last',
		'type Row.nested',
		'type Row.nested.count',
		'type Row.nested.deeper',
		'type Row.nested.deeper.on',
		'type Row.place',
		'type Row.place[].country',
		'type Row.place[].region',
		'type Row.where',
	])
	assert.throws(() => responseNames('export interface Odd {\n\t[key: string]: number\n}\n'), /no fields read from "Odd"/)
})
