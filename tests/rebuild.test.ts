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
		for (const part of ['Set `WORKER_NAME` in `cloudflare.config.ts` to `', 'cf workers versions list --worker-id', 'save it as `sites.json`', '`pnpm exec cf deploy --dry-run`', 'Never pass `--secrets-file`']) {
			expect(topic).toContain(part)
		}
		expect(topic).not.toContain('\\`')
	})

	it('says which other sites a deploy without sites.json would take offline', () => {
		const one = guideTopic('rebuild', guideNames('https://bio.example', 'my-worker'))!
		expect(one).toContain('to `my-worker`')
		expect(one).not.toContain('Here it matters')
		const two = guideTopic('rebuild', guideNames('https://bio.example', 'my-worker', { id: 'main', others: ['link.example'] }))!
		expect(two).toContain('this Worker also holds link.example, and a deploy without that file takes every site but the first offline')
		expect(two).toContain('though `sites.json` in it is worth keeping')
		// A test site's guide still names the live Worker: the folder is one, and --mode staging adds the rest.
		expect(guideTopic('rebuild', guideNames('https://bio.example', 'my-worker-staging'))).toContain('to `my-worker`.')
	})

	it('is where the update topic and the main guide send an agent', async () => {
		expect(await (await call('/api/guide/update')).text()).toContain('if that folder is gone, see "Rebuild the FluxBio folder" first')
		expect(await (await call('/llms.txt')).text()).toContain('| `rebuild` |')
	})
})
