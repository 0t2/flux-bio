const ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
}

/** Escapes text for use in HTML content and quoted attribute values. */
export function esc(value: unknown): string {
	return String(value ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch)
}
