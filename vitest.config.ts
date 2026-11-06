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
				// A second site beside the main one, as sites.json would make it (tests/sites.test.ts). Every other test runs at
				// bio.example, which is the main site's, so they see what a Worker with one site sees.
				d1Databases: ['DB', 'DB_LINK'],
				kvNamespaces: ['KV', 'KV_LINK'],
				// Writes are accepted and dropped; there is no local SQL binding, so stats insights are null in tests.
				analyticsEngineDatasets: { ANALYTICS: { dataset: 'fluxbio_test' } },
				bindings: {
					ADMIN_PASSWORD: 'test-admin-token-0123',
					TEST_SITE: 'false',
					WORKER_NAME: 'flux-bio-test',
					SITES: JSON.stringify({ main: ['bio.example'], link: ['link.example'] }),
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
