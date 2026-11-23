/**
 * Brings a document that's already showing up to date with new HTML, changing only what differs. Loading the HTML again would
 * blank the frame for a moment, send it back to the top, and fetch its fonts and pictures again.
 */
export function morphDocument(doc: Document, html: string): void {
	const next = new DOMParser().parseFromString(html, 'text/html')
	syncAttributes(doc.documentElement, next.documentElement)
	syncAttributes(doc.body, next.body)
	morphChildren(doc.head, next.head)
	morphChildren(doc.body, next.body)
}

function syncAttributes(from: Element, to: Element): void {
	for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name)
	for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value)
}

const sameKind = (a: Node, b: Node): boolean => a.nodeType === b.nodeType && a.nodeName === b.nodeName

function keyOf(node: Node | null | undefined): string | null {
	return node && node.nodeType === 1 ? (node as Element).getAttribute('data-key') : null
}

function morph(from: Node, to: Node): void {
	// By node type: these two come from different windows, so instanceof can't compare them.
	if (from.nodeType === 1) {
		syncAttributes(from as Element, to as Element)
		morphChildren(from, to)
	} else if (from.nodeValue !== to.nodeValue) {
		from.nodeValue = to.nodeValue
	}
}

/**
 * Updates `from`'s children to match `to`'s. Keyed elements (`data-key`) are matched in O(1) via a Map so
 * reordering or editing items in a large bio page never falls back to O(N^2) deep `isEqualNode` scans.
 */
export function morphChildren(from: Node, to: Node): void {
	const doc = from.ownerDocument!
	const wanted = [...to.childNodes]
	const keyedFrom = new Map<string, Element>()
	for (const child of from.childNodes) {
		const key = keyOf(child)
		if (key && !keyedFrom.has(key)) keyedFrom.set(key, child as Element)
	}
	const wantedKeys = new Set<string>()
	for (const node of wanted) {
		const key = keyOf(node)
		if (key) wantedKeys.add(key)
	}

	wanted.forEach((next, i) => {
		const current = from.childNodes[i] ?? null
		const nextKey = keyOf(next)
		if (nextKey) {
			const match = keyedFrom.get(nextKey)
			if (match && sameKind(match, next)) {
				if (match !== current) from.insertBefore(match, current)
				if (!match.isEqualNode(next)) morph(match, next)
				return
			}
			from.insertBefore(doc.importNode(next, true), current)
			return
		}

		if (current?.isEqualNode(next)) return
		const currentKey = keyOf(current)
		if (current && !currentKey && sameKind(current, next)) {
			morph(current, next)
			return
		}
		if (currentKey && wantedKeys.has(currentKey)) {
			from.insertBefore(doc.importNode(next, true), current)
			return
		}
		const moved = [...from.childNodes].slice(i + 1).find((node) => !keyOf(node) && node.isEqualNode(next))
		if (moved) {
			from.insertBefore(moved, current)
			return
		}
		from.insertBefore(doc.importNode(next, true), current)
	})
	while (from.childNodes.length > wanted.length) from.lastChild!.remove()
}
