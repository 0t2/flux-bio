import { describe, expect, it } from 'vitest'
import { guideNames } from '../src/worker/lib/agent'
import { guideTopic } from '../src/worker/lib/agentTopics'
import { call } from './helpers'

describe('the guide for a folder that is gone', () => {
	it('is read without a token, and names this Worker', async () => {
		const res = await call('/api/guide/rebuild')
		expect(res.status).toBe(200)
		const topic = await res.text()
		expect(topic).toContain('# FluxBio guide: Rebuild the FluxBio folder')
		// The steps that keep a deploy from harming the site: the same Worker, the same sites, the same password.
		for (const part of ['Write the Worker\'s name in `worker.json`', '`pnpm run deploy --dry-run` uploads nothing', 'save the `sites.json` it prints, exactly as printed', 'Never pass `--secrets-file`', 'never with `cf deploy` by hand']) {
			expect(topic).toContain(part)
		}
		expect(topic).not.toContain('\\`')
	})

	it('says which other sites a deploy without sites.json would take offline', () => {
		const one = guideTopic('rebuild', guideNames('https://bio.example', 'my-worker'))!
		expect(one).toContain('`{ "name": "my-worker" }`')
		expect(one).not.toContain('It will here')
		expect(one).toContain('though `worker.json` in it is worth keeping')
		const two = guideTopic('rebuild', guideNames('https://bio.example', 'my-worker', { id: 'main', others: ['link.example'] }))!
		expect(two).toContain('It will here: this Worker also holds link.example.')
		expect(two).toContain('though `worker.json` and `sites.json` in it are worth keeping')
		// A test site's guide still names the live Worker: the folder is one, and --mode staging adds the rest.
		expect(guideTopic('rebuild', guideNames('https://bio.example', 'my-worker-staging'))).toContain('`{ "name": "my-worker" }`')
	})

	it('is where the update topic and the main guide send an agent', async () => {
		expect(await (await call('/api/guide/update')).text()).toContain('if that folder is gone, see "Rebuild the FluxBio folder" first')
		expect(await (await call('/llms.txt')).text()).toContain('| `rebuild` |')
	})
})

describe('the commands the guide gives for the folder', () => {
	it('deploy through the checks, and never tell anyone to edit cloudflare.config.ts', async () => {
		for (const id of ['update', 'rebuild', 'password', 'test-site', 'domain']) {
			const topic = await (await call(`/api/guide/${id}`)).text()
			// `cf deploy` by hand checks nothing: the only mention left says not to use it.
			expect(topic.replaceAll('with `cf deploy`', ''), id).not.toMatch(/pnpm exec cf deploy/)
			expect(topic, id).not.toContain('WORKER_NAME')
		}
		const password = await (await call('/api/guide/password')).text()
		expect(password).toContain('`pnpm reset-password --site https://')
		const update = await (await call('/api/guide/update')).text()
		expect(update).toContain('`worker.json` and `sites.json`')
		// The folder's code is brought up by a command that checks for the owner's changes, with --overwrite only on their yes.
		for (const part of ['run `pnpm update:code` in it', 'pass `--overwrite` only on their yes', 'A folder from before 0.4.3 has no such command']) expect(update).toContain(part)
	})
})

describe('the password command a site gives', () => {
	it('says --mode staging on a test site, whose Worker is not the live one, and sends a local site to .dev.vars', () => {
		const live = guideTopic('password', guideNames('https://bio.example', 'my-worker'))!
		expect(live).toContain('`pnpm reset-password --site https://bio.example`')
		// Run as given without it, the command would be for the live Worker: it is refused, and this is why it isn't given so.
		const test = guideTopic('password', guideNames('https://test.example', 'my-worker-staging'))!
		expect(test).toContain('`pnpm reset-password --site https://test.example --mode staging`')
		expect(guideTopic('password', guideNames('http://localhost:5173', 'my-worker'))).toContain('its password is `ADMIN_PASSWORD` in `.dev.vars`')
		// The command reads which Worker serves a site out of this topic, so the name has to stay in it.
		expect(live).toMatch(/--worker my-worker[\s`']/)
		expect(test).toMatch(/--worker my-worker-staging[\s`']/)
	})
})

// A test site and the copy on a computer serve the guide too, and so does each site of a Worker that holds several.
describe('the guide a site that is not the one live site serves', () => {
	const single = guideNames('https://bio.example', 'my-worker')
	const main = guideNames('https://bio.example', 'my-worker', { id: 'main', others: ['link.example'] })
	const link = guideNames('https://link.example', 'my-worker', { id: 'link', others: ['bio.example'] })
	const test = guideNames('https://test.example', 'my-worker-staging')
	const local = guideNames('http://localhost:5173', 'my-worker')
	const topic = (id: string, names: ReturnType<typeof guideNames>) => guideTopic(id, names)!

	it('removes one site of several without touching the Worker or the first site’s database', () => {
		const text = topic('remove', link)
		expect(text).toContain('This Worker holds more than one site: link.example and bio.example. Ask which they mean')
		expect(text).toContain('`pnpm run deploy --drop-site link`')
		expect(text).toContain('the database named `my-worker-link` and the namespace named `my-worker-kv-link`, the `FLUXBIO_TOKEN_LINK` line')
		expect(text).toContain('`~/.claude/skills/fluxbio-link`')
		expect(text).toContain('Not the Worker, and not the database named `my-worker`')
		// The first site can't go by itself, and its guide doesn't offer that.
		expect(topic('remove', main)).toContain("It is the Worker's first site")
		expect(topic('remove', main)).not.toContain('--drop-site')
		// Removing everything names every site's database, and the test site's.
		for (const text of [topic('remove', main), topic('remove', link)]) {
			expect(text).toContain('named `my-worker-<its id>` and `my-worker-kv-<its id>`')
			expect(text).toContain('They take every one of these sites offline')
		}
		expect(topic('remove', single)).toContain('If the lists show a `my-worker-staging`, that is their test site')
		expect(topic('remove', single)).not.toContain('more than one site')
	})

	it('removes a test site as a test site, and leaves the live one and the owner’s computer alone', () => {
		const text = topic('remove', test)
		expect(text).toContain('removing it is step 6 of "Test site": the Worker `my-worker-staging`')
		expect(text).not.toContain('FLUXBIO_DIR')
		expect(text).not.toContain('workers delete')
		expect(topic('remove', local)).toContain('Stop `pnpm dev` and delete the folder')
	})

	it('deploys the test site from the test site’s guide, never the live one, and keeps the live site’s skill', () => {
		const update = topic('update', test)
		expect(update).toContain('**This is the test site.**')
		expect(update).toContain('`pnpm deploy:images --site https://test.example --mode staging`')
		expect(update).toContain('`pnpm run deploy --mode staging`')
		expect(update).not.toContain('/skill.md')
		expect(update).toContain("Leave the skill on their computer alone: it is the live site's")
		expect(topic('quota', test)).toContain('`pnpm deploy:images --site https://test.example --mode staging`')
		// The live site's own guide gives the plain commands and its own skill.
		const live = topic('update', single)
		expect(live).toContain('`pnpm deploy:images --site https://bio.example`,')
		expect(live).toContain('`pnpm run deploy`')
		expect(live).toContain('curl -fsSL https://bio.example/skill.md -o ~/.claude/skills/fluxbio/SKILL.md')
		expect(live).not.toContain('--mode staging')
	})

	it('doesn’t deploy from the copy on a computer, or save its guide as the skill', () => {
		const update = topic('update', local)
		expect(update).toContain("**This is the copy on the owner's computer.** Step 2 alone updates it")
		expect(update).not.toContain('localhost:5173/skill.md')
		expect(topic('rebuild', local)).not.toContain('localhost:5173/skill.md')
		expect(topic('rebuild', test)).toContain('The folder is rebuilt for the live site, the Worker `my-worker`')
		expect(topic('rebuild', test)).toContain('https://<the live site>/skill.md')
	})

	it('tries a new version after the code is in the folder, not before', () => {
		const text = topic('update', single)
		const [code, trial] = [text.indexOf('2. If the folder has `.git`'), text.indexOf('ask first whether to try the new version')]
		expect(code).toBeGreaterThan(-1)
		expect(trial).toBeGreaterThan(code)
		expect(text).toContain('try again in a few minutes')
	})

	it('names the test site’s own password file, and says to keep it', () => {
		const text = topic('password', test)
		expect(text).toContain('it is in `.secrets.staging.env` there. Keep that file')
		expect(text).not.toContain('then delete both files')
		expect(topic('password', single)).toContain('then delete both files')
		expect(topic('password', main)).toContain("make a token for each site with it, at each site's own address")
	})

	it('adds a site without asking anyone for the admin password, and takes one out with --drop-site', () => {
		const text = topic('domain', single)
		expect(text).toContain('Ask the owner to open `https://<the new domain>/admin/`, sign in with the same password, and make a token for you')
		expect(text).not.toContain('Check it with the admin password')
		expect(text).toContain('`pnpm run deploy --drop-site <its id>`')
		expect(text).toContain('`{ "domains": ["links.example.com"] }`')
	})

	it('rebuilds a folder only for a Worker the rehearsal says it updates', () => {
		const text = topic('rebuild', single)
		expect(text).toContain('Go on only when it says `Checked: this updates the Worker "my-worker"`')
		expect(text).toContain('If it says it *makes* that Worker')
		// Listing Workers shows ten of them: not a way to tell the account is the wrong one.
		expect(text).not.toContain('cf workers list')
		expect(text).toContain('`pnpm reset-password --site <the test site\'s address> --mode staging`')
	})
})
