import { describe, expect, it } from 'vitest'
import { emptyContent } from '../src/shared/content'
import { shareCardInput, shareCardKey, shareImageIsStale } from '../src/admin/lib/shareCard'

// The automatic share card is drawn and uploaded again when its key changes, which costs an upload and a KV write
// and leaves the old picture behind. So the key is what the card shows, and nothing else about the page's look.

describe("a share card's key", () => {
	const page = () => ({ ...emptyContent('Mei'), profile: { ...emptyContent('Mei').profile, bio: 'Cooking, markets and everyday things' } })
	const keyOf = (content: ReturnType<typeof page>, url = 'bio.example/mei') => shareCardKey(shareCardInput(content, url))

	it('stays the same when the look changes in ways the card does not show', () => {
		const content = page()
		const key = keyOf(content)
		for (const appearance of [
			{ ...content.appearance, showSocial: !content.appearance.showSocial },
			{ ...content.appearance, socialPlace: 'bottom' as const },
			// The card keeps the name: it is how a shared link says whose page it is.
			{ ...content.appearance, showName: false },
			{ ...content.appearance, coverImage: 'abcdefghijkl.webp' },
			{ ...content.appearance, bgImage: 'abcdefghijkl.webp', bgDim: 0.4 },
		]) {
			expect(keyOf({ ...content, appearance })).toBe(key)
		}
	})

	it('changes with what the card is drawn from: its words, its address, its colors, its fonts and its shapes', () => {
		const content = page()
		const key = keyOf(content)
		expect(keyOf(content, 'bio.example/mika')).not.toBe(key)
		expect(keyOf({ ...content, profile: { ...content.profile, name: 'Mika' } })).not.toBe(key)
		expect(keyOf({ ...content, profile: { ...content.profile, avatar: 'abcdefghijkl.webp' } })).not.toBe(key)
		for (const appearance of [
			{ ...content.appearance, theme: content.appearance.theme === 'moon' ? ('sky' as const) : ('moon' as const) },
			{ ...content.appearance, accent: '#ff0066' },
			{ ...content.appearance, button: content.appearance.button === 'square' ? ('pill' as const) : ('square' as const) },
			{ ...content.appearance, headFont: 'Lora' },
		]) {
			expect(keyOf({ ...content, appearance }), JSON.stringify(appearance)).not.toBe(key)
		}
	})

	it('says a page needs a card until it has the one for what it shows', () => {
		const content = page()
		expect(shareImageIsStale(content, 'bio.example/mei')).toBe(true)
		const drawn = { ...content, seo: { ...content.seo, autoImage: 'abcdefghijkl.jpg', autoImageKey: keyOf(content) } }
		expect(shareImageIsStale(drawn, 'bio.example/mei')).toBe(false)
		expect(shareImageIsStale({ ...drawn, appearance: { ...drawn.appearance, showSocial: !drawn.appearance.showSocial } }, 'bio.example/mei')).toBe(false)
		expect(shareImageIsStale({ ...drawn, profile: { ...drawn.profile, name: 'Mika' } }, 'bio.example/mei')).toBe(true)
		expect(shareImageIsStale({ ...drawn, seo: { ...drawn.seo, imageMode: 'upload' } }, 'bio.example/mei')).toBe(false)
	})
})
