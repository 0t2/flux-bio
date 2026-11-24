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
 *
 * The rest, the few children inside an item or in the head, are matched by what they are: one that only moved keeps
 * its element, so its picture, player or stylesheet doesn't load again. Changing the first of a row in place to look
 * like the second would give every one after it a new address, and the browser would fetch them all again.
 */
export function morphChildren(from: Node, to: Node): void {
	const doc = from.ownerDocument!
	const wanted = [...to.childNodes]
	const keyedFrom = new Map<string, Element>()
	for (const child of from.childNodes) {
		const key = keyOf(child)
		if (key && !keyedFrom.has(key)) keyedFrom.set(key, child as Element)
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
		// What only moved keeps its element. Keyed ones are found by their key above and never compared here.
		const moved = [...from.childNodes].slice(i + 1).find((node) => !keyOf(node) && node.isEqualNode(next))
		if (moved) {
			from.insertBefore(moved, current)
			return
		}
		// One with a key is found by it when its turn comes, or goes at the end. One without is changed in place,
		// unless the new page still has it further on: then it is left as it is, to be found there.
		const stays = current !== null && (keyOf(current) !== null || wanted.slice(i + 1).some((node) => !keyOf(node) && node.isEqualNode(current)))
		if (current && !stays && sameKind(current, next)) morph(current, next)
		else from.insertBefore(doc.importNode(next, true), current)
	})
	while (from.childNodes.length > wanted.length) from.lastChild!.remove()
}
