// Movement on the fluxbio.link landing page. The page is complete without this
// script: everything is visible, the theme picker works with radio buttons, and
// the slug field is a plain input. Loaded in <head> so nothing flashes.
const root = document.documentElement
root.classList.add('js')

addEventListener('DOMContentLoaded', () => {
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches

	// Radio buttons that show one thing at a time. Setting one from here doesn't move focus or scroll the page.
	const radios = (name) => {
		const all = [...document.querySelectorAll(`input[name=${name}]`)]
		const step = (by) => {
			const at = all.findIndex((radio) => radio.checked)
			all[(at + by + all.length) % all.length].checked = true
		}
		return { all, step }
	}

	// A finger across something that shows one thing at a time moves to the next, or back. Up and down stays the page's
	// (touch-action in the styles). A mouse clicks instead. Reading right to left, the next one is on the other side.
	const forward = root.getAttribute('dir') === 'rtl' ? -1 : 1
	const swipe = (area, step) => {
		let start = null
		let swipedAt = 0
		const end = () => {
			start = null
			area.style.translate = ''
			area.style.transition = ''
		}
		area.addEventListener('pointerdown', (event) => {
			if (event.pointerType !== 'mouse') start = { x: event.clientX, y: event.clientY }
		})
		area.addEventListener('pointermove', (event) => {
			if (!start) return
			const across = event.clientX - start.x
			if (Math.abs(across) < 8) return
			area.style.transition = 'none'
			area.style.translate = `${across * 0.2}px`
		})
		area.addEventListener('pointerup', (event) => {
			if (!start) return
			const across = event.clientX - start.x
			const down = event.clientY - start.y
			end()
			if (Math.abs(across) < 40 || Math.abs(across) < Math.abs(down) * 1.5) return
			swipedAt = Date.now()
			step(across < 0 ? forward : -forward)
		})
		area.addEventListener('pointercancel', end)
		// A tap on a phone behind picks it, but a swipe that ends on one doesn't.
		area.addEventListener(
			'click',
			(event) => {
				if (Date.now() - swipedAt > 400) return
				event.preventDefault()
				event.stopPropagation()
			},
			true,
		)
	}

	// The templates, where a phone shows one at a time.
	const templates = document.querySelector('.tpls')
	if (templates) {
		const pages = radios('tpl')
		swipe(templates, (by) => {
			if (getComputedStyle(pages.all[0]).display !== 'none') pages.step(by)
		})
	}

	// Each part of a section rises in once, shortly after the one before it.
	const parts = document.querySelectorAll('[data-in]')
	if (still || !('IntersectionObserver' in window)) {
		for (const part of parts) part.classList.add('in')
	} else {
		const seen = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue
					entry.target.classList.add('in')
					seen.unobserve(entry.target)
				}
			},
			{ rootMargin: '0px 0px -8% 0px' },
		)
		for (const part of parts) seen.observe(part)
	}

	// Theme tiles hold a 390px wide page: scale it to whatever width the tile has.
	const tiles = document.querySelectorAll('[data-scale]')
	const fit = (tile) => tile.style.setProperty('--ts', tile.clientWidth / 390)
	for (const tile of tiles) fit(tile)
	if ('ResizeObserver' in window) {
		const watch = new ResizeObserver((entries) => {
			for (const entry of entries) fit(entry.target)
		})
		for (const tile of tiles) watch.observe(tile)
	}

	// The slug grows with what is typed, in browsers without field-sizing.
	const slug = document.querySelector('[data-slug]')
	if (slug && !CSS.supports('field-sizing', 'content')) {
		const size = () => (slug.size = Math.max(2, [...slug.value].length + 1))
		slug.addEventListener('input', size)
		size()
	}
})
