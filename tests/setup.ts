import { vi } from 'vitest'

// Publishing copies fonts from Google Fonts (src/worker/lib/fonts.ts). Tests never reach
// Google: it answers as if it were down, so pages keep loading fonts from Google, as they
// would. tests/fonts.test.ts answers with fonts instead.
const network = globalThis.fetch
vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
	const url = new URL(input instanceof Request ? input.url : String(input))
	if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') return Promise.resolve(new Response('Not in tests', { status: 503 }))
	return network(input, init)
})
