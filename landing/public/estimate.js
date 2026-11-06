// The traffic estimator on fluxbio.link: what a day of visits takes of Cloudflare's free plan, and what a month of
// it costs on Workers Paid, for a page of links on an account with FluxBio alone on it. The page works without this script: the panel
// then gives the usual answer in a sentence, and the form stays hidden.
//
// What each visit costs was measured on FluxBio itself (tests/kv-cost.test.ts, tests/scale.test.ts): a page view is
// one Worker request, one KV read and one D1 row written, and each picture on the page one more request and KV read
// for a visitor who hasn't got it yet. A tap on a link is one request, one KV read and one row. Each view and click is one Analytics Engine event. Prices are Cloudflare's, as published in November 2026.
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
	// A month's numbers run to tens of millions: "10.95M", "1095萬".
	const short = new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 2 })
	const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
	const fill = (text, values) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? values[key] : whole))

	const views = document.getElementById('est-views')
	const range = document.getElementById('est-views-range')
	const rate = document.getElementById('est-rate')
	const rateOut = document.getElementById('est-rate-out')
	const images = document.getElementById('est-images')
	const shipped = document.getElementById('est-shipped')
	const verdict = document.getElementById('est-verdict')
	const max = document.getElementById('est-max')
	const cost = document.getElementById('est-cost')

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
		const daily = whole(views, 0)
		const clickShare = Number(rate.value) / 100
		// Pictures deployed with the site are static files, which Cloudflare serves without the Worker or KV.
		const pictures = shipped.checked ? 0 : Math.min(whole(images, 0), 50)
		rateOut.textContent = `${rate.value}%`

		// What `amount` page views a day take.
		const costs = (amount) => ({
			requests: amount * (1 + pictures + clickShare),
			kvReads: amount * (1 + pictures + clickShare),
			rowsWritten: amount * (1 + clickShare),
			events: amount * (1 + clickShare),
		})
		const day = costs(daily)
		const shares = Object.fromEntries(Object.keys(FREE_PER_DAY).map((key) => [key, day[key] / FREE_PER_DAY[key]]))
		const [first] = Object.entries(shares).sort((a, b) => b[1] - a[1])
		const firstLabel = result.querySelector(`#est-day li[data-key="${first[0]}"] > span`).textContent
		verdict.textContent = fill(verdict.dataset[first[1] <= 1 ? 'ok' : 'over'], { percent: number.format(Math.round(first[1] * 100)), item: firstLabel })
		// Every cost grows with the traffic, so the most the free plan takes is where the first of them runs out.
		const one = costs(1)
		const most = Math.min(...Object.keys(FREE_PER_DAY).map((key) => FREE_PER_DAY[key] / one[key]))
		max.textContent = fill(max.dataset.text, { n: number.format(Math.floor(most / 100) * 100) })

		// A bar per limit: used against what the plan allows, dark once past it.
		const bar = (row, used, limit, format = number, extra = '') => {
			row.querySelector('em').textContent = `${format.format(Math.round(used))} / ${format.format(limit)}${extra}`
			row.querySelector('.est-bar span').style.inlineSize = `${Math.min(100, (used / limit) * 100)}%`
			row.classList.toggle('over', used > limit)
		}
		for (const row of document.querySelectorAll('#est-day li')) bar(row, day[row.dataset.key], FREE_PER_DAY[row.dataset.key])

		let total = PAID.base
		for (const row of document.querySelectorAll('#est-month li')) {
			const key = row.dataset.key
			const month = day[key] * DAYS_A_MONTH
			const price = (Math.max(0, month - PAID.included[key]) / 1_000_000) * PAID.perMillion[key]
			total += price
			bar(row, month, PAID.included[key], short, price > 0 ? ` +${money.format(price)}` : '')
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

	// The panel shows one plan at a time: the free plan's day first, a month on Workers Paid on request.
	const switches = result.querySelectorAll('.est-switch button')
	for (const button of switches) {
		button.addEventListener('click', () => {
			for (const other of switches) other.setAttribute('aria-pressed', String(other === button))
			document.getElementById('est-free').hidden = button.dataset.plan !== 'free'
			document.getElementById('est-paid').hidden = button.dataset.plan !== 'paid'
		})
	}

	range.value = String(Math.round(toSlider(whole(views, 5000))))
	form.hidden = false
	result.hidden = false
	panel.querySelector('.est-static').hidden = true
	update()
}
