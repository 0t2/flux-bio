// The hero's terminal (template.html, .term): drops the quote marks around each request and types it out, in step with
// the animation in the styles (each request's own animation says where in the round it is). Without this script the
// requests show whole.
addEventListener('DOMContentLoaded', () => {
	const [from, to] = [0.35,1.45]
	const lines = []
	for (const run of document.querySelectorAll('.term .run')) {
		const say = run.querySelector('.t-say')
		const caret = run.querySelector('.t-caret')
		const text = say?.textContent.trim().replace(/^[「『“"«„‘‹]\s*/u, '').replace(/\s*[」』”"»“’›]$/u, '')
		if (!text || !caret) continue
		const typed = document.createElement('span')
		const rest = document.createElement('span')
		rest.className = 't-rest'
		say.replaceChildren(typed, caret, rest)
		lines.push({ run, chars: [...text], typed, rest, shown: -1, anim: null })
	}
	const show = (line, n) => {
		if (n === line.shown) return
		line.shown = n
		line.typed.textContent = line.chars.slice(0, n).join('')
		line.rest.textContent = line.chars.slice(n).join('')
	}
	let seen = true
	const frame = () => {
		for (const line of lines) {
			if (!line.anim || line.anim.playState === 'idle') line.anim = line.run.getAnimations().find((a) => a.animationName?.startsWith('run'))
			const timing = line.anim?.effect?.getComputedTiming()
			if (timing?.progress == null) {
				show(line, line.chars.length)
				continue
			}
			const at = (timing.progress * timing.duration) / 1000
			show(line, Math.round(line.chars.length * Math.min(1, Math.max(0, (at - from) / (to - from)))))
		}
		if (seen) requestAnimationFrame(frame)
	}
	frame()
	if ('IntersectionObserver' in window) {
		new IntersectionObserver((entries) => {
			const now = entries.at(-1).isIntersecting
			if (now && !seen) requestAnimationFrame(frame)
			seen = now
		}).observe(document.querySelector('.term'))
	}
})
