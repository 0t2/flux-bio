import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { openApiDocument } from './vite.openapi.ts'

export default defineConfig({
	plugins: [react(), cloudflare(), openApiDocument()],
	environments: {
		// The dashboard SPA lives at /admin/; the Worker entry comes from cloudflare.config.ts.
		client: {
			build: {
				rollupOptions: {
					input: { admin: 'admin/index.html' },
				},
			},
		},
	},
})
