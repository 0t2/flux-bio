import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
import { openApiDocument } from './vite.openapi.ts'

// Tests import the Worker directly, so they only need the bindings it uses.
export default defineConfig({
	plugins: [
		openApiDocument(),
		cloudflareTest({
			miniflare: {
				compatibilityDate: '2026-10-15',
				d1Databases: ['DB'],
				kvNamespaces: ['KV'],
				// Writes are accepted and dropped; there is no local SQL binding, so stats insights are null in tests.
				analyticsEngineDatasets: { ANALYTICS: { dataset: 'fluxbio_test' } },
				bindings: {
					ADMIN_PASSWORD: 'test-admin-token-0123',
					TEST_SITE: 'false',
					WORKER_NAME: 'flux-bio-test',
				},
			},
		}),
	],
	test: {
		// Without this, Vitest hands every CSS file to the tests as an empty string, even with ?raw.
		css: true,
		include: ['tests/**/*.test.ts'],
		setupFiles: ['tests/setup.ts'],
	},
})
