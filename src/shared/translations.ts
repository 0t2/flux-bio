import type { Item, Locale, PageContent, Translations } from './content'

/**
 * The owner's own text in the other languages turned on, written by their AI.
 * `content.translations` holds, per language, each text exactly as written → its
 * translation. Going by the wording, as the dashboard's own translations do,
 * means a text the owner changes shows as untranslated by itself, and moving or
 * deleting items needs no upkeep.
 *
 * Addresses and phone numbers stay as written, because maps and calls need the
 * original; so do URLs and slugs. The share card is one picture, drawn from the
 * original `seo.tagline`.
 */
export type Untranslated = Partial<Record<Locale, string[]>>

function mapItem(item: Item, text: (value: string) => string): Item {
	switch (item.kind) {
		case 'link':
			return { ...item, title: text(item.title), subtitle: text(item.subtitle) }
		case 'heading':
		case 'video':
			return { ...item, title: text(item.title) }
		case 'gallery':
			return { ...item, title: text(item.title), images: item.images.map((image) => ({ ...image, alt: text(image.alt) })) }
		case 'product':
			return { ...item, title: text(item.title), products: item.products.map((product) => ({ ...product, name: text(product.name), price: text(product.price) })) }
		case 'hours':
		case 'kofi':
			return { ...item, title: text(item.title), note: text(item.note) }
	}
}

/** The one list of what gets translated: the content with `text` applied to each of those fields. */
function mapTexts(content: PageContent, text: (value: string) => string): PageContent {
	return {
		...content,
		profile: { ...content.profile, name: text(content.profile.name), bio: text(content.profile.bio) },
		seo: { ...content.seo, title: text(content.seo.title), description: text(content.seo.description) },
		items: content.items.map((item) => mapItem(item, text)),
	}
}

/** Every text on the page that can be translated, each once, top to bottom. Numbers and symbols alone read the same anywhere. */
export function pageTexts(content: PageContent): string[] {
	const texts = new Set<string>()
	mapTexts(content, (value) => {
		const key = value.trim()
		if (/\p{L}/u.test(key)) texts.add(key)
		return value
	})
	return [...texts]
}

function translationOf(words: Record<string, string> | undefined, key: string): string | null {
	// Own properties only: a link can be titled "constructor". A blank one would wipe out the text.
	const found = words && Object.hasOwn(words, key) ? words[key] : undefined
	return found?.trim() ? found : null
}

/** The content as visitors in `locale` read it. A text with no translation stays as written. */
export function localizedContent(content: PageContent, locale: Locale): PageContent {
	const words = content.translations?.[locale]
	if (!words) return content
	return mapTexts(content, (value) => translationOf(words, value.trim()) ?? value)
}

/** Per language, the page's texts that have no translation yet. */
export function untranslated(content: PageContent, locales: readonly Locale[]): Untranslated {
	// Someone's own HTML is what it is, and a redirect shows nothing.
	if (!locales.length || content.custom) return {}
	const texts = pageTexts(content)
	return Object.fromEntries(locales.map((locale) => [locale, texts.filter((key) => translationOf(content.translations?.[locale], key) === null)]))
}

/** The languages of `locales` that have every text of the page. */
export function translatedLocales(content: PageContent, locales: readonly Locale[]): Locale[] {
	if (content.custom) return []
	const missing = untranslated(content, locales)
	return locales.filter((locale) => !missing[locale]?.length)
}

/**
 * The translations of texts still on the page, or undefined when there are none.
 * Languages turned off keep theirs, so turning one back on costs nothing.
 */
export function usedTranslations(content: PageContent): Translations | undefined {
	const texts = pageTexts(content)
	const entries = Object.entries(content.translations ?? {}).flatMap(([locale, words]) => {
		const kept = texts.flatMap((key) => {
			const found = translationOf(words, key)
			return found === null ? [] : [[key, found] as const]
		})
		return kept.length ? [[locale, Object.fromEntries(kept)] as const] : []
	})
	return entries.length ? (Object.fromEntries(entries) as Translations) : undefined
}
