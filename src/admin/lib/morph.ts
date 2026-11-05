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

function morph(from: Node, to: Node): void {
	// By node type: these two come from different windows, so instanceof can't compare them.
	if (from.nodeType === Node.ELEMENT_NODE) {
		syncAttributes(from as Element, to as Element)
		morphChildren(from, to)
	} else if (from.nodeValue !== to.nodeValue) {
		from.nodeValue = to.nodeValue
	}
}

function morphChildren(from: Node, to: Node): void {
	const doc = from.ownerDocument!
	const wanted = [...to.childNodes]
	wanted.forEach((next, i) => {
		const current = from.childNodes[i] ?? null
		if (current?.isEqualNode(next)) return
		// What only moved keeps its element, so its pictures and players don't load again.
		const moved = [...from.childNodes].slice(i + 1).find((node) => node.isEqualNode(next))
		if (moved) {
			from.insertBefore(moved, current)
			return
		}
		const neededLater = current && wanted.slice(i + 1).some((node) => node.isEqualNode(current))
		if (current && sameKind(current, next) && !neededLater) morph(current, next)
		else from.insertBefore(doc.importNode(next, true), current)
	})
	while (from.childNodes.length > wanted.length) from.lastChild!.remove()
}
