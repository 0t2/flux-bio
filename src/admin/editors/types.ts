import type { Item } from '../../shared/content'

export interface EditorProps<T extends Item> {
	item: T
	/** Merges a patch into this item in the draft. */
	set: (patch: Partial<T>) => void
	/** Marks a field that blocked publishing, for aria-invalid. */
	invalid: (field: string) => true | undefined
}
