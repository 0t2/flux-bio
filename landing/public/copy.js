// Copy buttons on the fluxbio.link landing page. The page works without this
// script: it only reveals each button and copies the lines it points to,
// leaving out the › marks. A line with data-gap gets an empty line before and
// after it, so what is copied is the prompt as the README prints it.
for (const button of document.querySelectorAll('button[data-copy]')) {
	const target = document.getElementById(button.dataset.copy)
	const label = button.querySelector('span')
	if (!target || !label || !navigator.clipboard) continue
	const idle = label.textContent
	let timer
	button.hidden = false
	button.addEventListener('click', async () => {
		const lines = [...target.querySelectorAll('li')].map((line) => {
			const text = (line.querySelector('span:not(.prompt)') ?? line).textContent.trim()
			return line.hasAttribute('data-gap') ? `\n${text}\n` : text
		})
		try {
			await navigator.clipboard.writeText(lines.join('\n'))
			label.textContent = button.dataset.copied || idle
			clearTimeout(timer)
			timer = setTimeout(() => (label.textContent = idle), 2000)
		} catch {
			// Clipboard refused (no permission): the lines can still be selected by hand.
		}
	})
}
