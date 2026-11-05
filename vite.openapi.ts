import { runnerImport, type Plugin } from 'vite'

const ID = 'virtual:fluxbio-openapi'
const SOURCE = './src/worker/lib/openapi.ts'

/**
 * Builds the OpenAPI document (src/worker/lib/openapi.ts) in Node when the
 * Worker is bundled, so the Worker never spends request CPU on it.
 */
export function openApiDocument(): Plugin {
	return {
		name: 'fluxbio-openapi',
		resolveId: (source) => (source === ID ? `\0${ID}` : undefined),
		async load(id) {
			if (id !== `\0${ID}`) return
			const { module, dependencies } = await runnerImport<typeof import('./src/worker/lib/openapi')>(SOURCE)
			for (const file of dependencies) this.addWatchFile(file)
			return `export default ${JSON.stringify(module.openApiDocument())}`
		},
	}
}
