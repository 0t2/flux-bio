// The traffic estimator on fluxbio.link: what a day of visits takes of Cloudflare's free plan, and what a month of
// it costs on Workers Paid, for an account with FluxBio alone on it. The page works without this script: the panel
// then gives the usual answer in a sentence, and the form stays hidden.
//
// What each visit costs was measured on FluxBio itself (tests/kv-cost.test.ts, tests/scale.test.ts): a page view is
// one Worker request, two KV reads and one D1 row written, and each picture on the page one more request and KV read
// for a visitor who hasn't got it yet. A tap on a link, and a short link opened, is one request, one KV read and one
// row. Each view and click is one Analytics Engine event. Prices are Cloudflare's, as published in November 2026.
const FREE_PER_DAY = { requests: 100_000, kvReads: 100_000, rowsWritten: 100_000, events: 100_000 }
const PAID = {
	base: 5,
	included: { requests: 10_000_000, kvReads: 10_000_000, rowsWritten: 50_000_000 },
	perMillion: { requests: 0.3, kvReads: 0.5, rowsWritten: 1 },
}
const DAYS_A_MONTH = 30

const form = document.getElementById('est-form')
const result = document.getElementById('est-result')
const panel = result?.closest('.est-panel')

if (form && result && panel) {
	const lang = document.documentElement.lang || 'en'
	const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 })
	const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
	const fill = (text, values) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? values[key] : whole))

	const views = document.getElementById('est-views')
	const range = document.getElementById('est-views-range')
	const rate = document.getElementById('est-rate')
	const rateOut = document.getElementById('est-rate-out')
	const images = document.getElementById('est-images')
	const viewsLabel = document.getElementById('est-views-label')
	const verdict = document.getElementById('est-verdict')
	const max = document.getElementById('est-max')
	const cost = document.getElementById('est-cost')
	const lines = result.querySelector('.est-lines')

	// The slider runs from 100 to 1,000,000 a day on a log scale, so small and large sites both get room.
	const fromSlider = (position) => {
		const value = 10 ** (2 + (4 * position) / 100)
		const unit = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1)
		return Math.round(value / unit) * unit
	}
	const toSlider = (value) => Math.min(100, Math.max(0, ((Math.log10(Math.max(value, 100)) - 2) / 4) * 100))
	const whole = (input, fallback) => {
		const value = Math.floor(Number(input.value))
		return Number.isFinite(value) && value >= 0 ? value : fallback
	}

	function update() {
		const use = form.elements['est-use'].value
		const bio = use === 'bio'
		for (const field of form.querySelectorAll('[data-only="bio"]')) field.hidden = !bio
		viewsLabel.textContent = viewsLabel.dataset[bio ? 'bio' : 'short']

		const daily = whole(views, 0)
		const clickShare = bio ? Number(rate.value) / 100 : 0
		const pictures = bio ? Math.min(whole(images, 0), 20) : 0
		rateOut.textContent = `${rate.value}%`

		// A day of it. On a page of links, `daily` is page views; with short links only, it is clicks.
		const costs = (amount) =>
			bio
				? {
						requests: amount * (1 + pictures + clickShare),
						kvReads: amount * (2 + pictures + clickShare),
						rowsWritten: amount * (1 + clickShare),
						events: amount * (1 + clickShare),
					}
				: { requests: amount, kvReads: amount, rowsWritten: amount, events: amount }
		const day = costs(daily)
		const shares = Object.fromEntries(Object.keys(FREE_PER_DAY).map((key) => [key, day[key] / FREE_PER_DAY[key]]))
		const [first] = Object.entries(shares).sort((a, b) => b[1] - a[1])
		const firstLabel = result.querySelector(`.est-bars li[data-key="${first[0]}"] > span`).textContent
		verdict.textContent = fill(verdict.dataset[first[1] <= 1 ? 'ok' : 'over'], { percent: number.format(Math.round(first[1] * 100)), item: firstLabel })
		// Every cost grows with the traffic, so the most the free plan takes is where the first of them runs out.
		const one = costs(1)
		const most = Math.min(...Object.keys(FREE_PER_DAY).map((key) => FREE_PER_DAY[key] / one[key]))
		max.textContent = fill(max.dataset[bio ? 'bio' : 'short'], { n: number.format(Math.floor(most / 100) * 100) })

		for (const row of result.querySelectorAll('.est-bars li')) {
			const key = row.dataset.key
			row.querySelector('em').textContent = `${number.format(Math.round(day[key]))} / ${number.format(FREE_PER_DAY[key])}`
			row.querySelector('.est-bar span').style.inlineSize = `${Math.min(100, shares[key] * 100)}%`
			row.classList.toggle('over', shares[key] > 1)
		}

		let total = PAID.base
		for (const row of lines.querySelectorAll('li')) {
			const key = row.dataset.key
			const month = day[key] * DAYS_A_MONTH
			const extra = Math.max(0, month - PAID.included[key])
			const price = (extra / 1_000_000) * PAID.perMillion[key]
			total += price
			row.querySelector('em').textContent = fill(lines.dataset.text, { used: number.format(Math.round(month)), included: number.format(PAID.included[key]) })
			row.querySelector('b').textContent = `+${money.format(price)}`
		}
		cost.textContent = fill(cost.dataset.text, { cost: money.format(total) })
	}

	views.addEventListener('input', () => {
		range.value = String(Math.round(toSlider(whole(views, 0))))
		update()
	})
	range.addEventListener('input', () => {
		views.value = String(fromSlider(Number(range.value)))
		update()
	})
	form.addEventListener('change', update)
	form.addEventListener('input', (event) => {
		if (event.target !== views && event.target !== range) update()
	})
	form.addEventListener('submit', (event) => event.preventDefault())

	range.value = String(Math.round(toSlider(whole(views, 5000))))
	form.hidden = false
	result.hidden = false
	panel.querySelector('.est-static').hidden = true
	update()
}
