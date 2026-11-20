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
		expect(await (await call('/api/guide/update')).text()).toContain('`worker.json` and `sites.json`')
	})
})
