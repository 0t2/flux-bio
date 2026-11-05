import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Locale, PageContent } from '../../shared/content'
import { resolveLocale } from '../../shared/locale'
import { renderBioPage } from '../../templates/render'
import { LANGUAGES, t } from '../i18n'
import { morphDocument } from '../lib/morph'
import { useApp } from '../state/app'

const WIDTH = 390
const HEIGHT = 844
const RING = 8
/** Any smaller is too small to read, so a very short window cuts the phone off instead. */
const MIN_SCALE = 0.4

const escaped = (text: string) => text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)

/** A page that redirects has nothing to show, so the phone says where it goes. */
function redirectNote(url: string, words: string): string {
	return `<!doctype html><body style="margin:0;display:grid;place-items:center;height:100vh;padding:32px;box-sizing:border-box;font:17px/1.5 system-ui,sans-serif;text-align:center;color:#131416;background:#f6f7f2"><div><p style="margin:0 0 8px">${escaped(words)}</p><p style="margin:0;font-weight:600;overflow-wrap:anywhere" dir="ltr">${escaped(url.trim() || 'https://')}</p></div></body>`
}

/**
 * Loads once and is updated in place from then on, so an edit doesn't blank the phone or send it back to the top. That takes
 * allow-same-origin, for this page to reach into the frame. Nothing in the frame can reach back: without allow-scripts, no script
 * runs in it, including anything an owner or AI put in a draft.
 */
function LiveFrame({ html }: { html: string }) {
	const frame = useRef<HTMLIFrameElement>(null)
	const loaded = useRef(false)
	const latest = useRef(html)
	latest.current = html
	// The first version only: a new srcDoc would load the frame again.
	const [first] = useState(html)
	const update = () => {
		const doc = frame.current?.contentDocument
		if (doc) morphDocument(doc, latest.current)
	}

	useEffect(() => {
		if (loaded.current) update()
	}, [html])

	return (
		<iframe
			ref={frame}
			title={t('頁面即時預覽')}
			srcDoc={first}
			sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
			onLoad={() => {
				loaded.current = true
				update()
			}}
		/>
	)
}

/**
 * Renders the draft with the same function the Worker uses for the public
 * page, so this is what visitors get, except that links with no address yet
 * show here as unfinished instead of being left out.
 */
export function PhonePreview({
	content,
	summary,
	locale,
	inline = false,
	frameSrc,
}: {
	content: PageContent
	summary?: string
	locale?: Locale
	/** Sits among other content rather than in its own pane, so it stays small enough to scroll past. */
	inline?: boolean
	/** Someone's own HTML, from the server, which is what sandboxes it. */
	frameSrc?: string
}) {
	const app = useApp()
	const deferred = useDeferredValue(content)
	// With more languages turned on, the owner can look at the page in each of them.
	const choices = locale || inline || !app.settings.languages.length ? [] : [app.settings.locale, ...app.settings.languages]
	const [picked, setPicked] = useState<Locale | null>(null)
	const shownLocale = locale ?? (picked && choices.includes(picked) ? picked : resolveLocale(app.settings.locale, app.settings.languages, navigator.language))
	const html = useMemo(
		() =>
			deferred.custom?.kind === 'redirect' ? redirectNote(deferred.custom.url, t('訪客打開這一頁，會直接轉到：')) : renderBioPage(deferred, {
				mode: 'preview',
				locale: shownLocale,
				mediaUrl: (id) => `/media/${id}`,
				timeZone: app.settings.timezone,
			}),
		[deferred, shownLocale, app.settings.timezone],
	)

	const column = useRef<HTMLDivElement>(null)
	const heading = useRef<HTMLDivElement>(null)
	const [scale, setScale] = useState(1)
	const [paneHeight, setPaneHeight] = useState(0)
	// The whole phone fits in its pane, so an edit shows without scrolling to it.
	useLayoutEffect(() => {
		const col = column.current
		const head = heading.current
		const area = col?.closest('.main') ?? document.documentElement
		if (!col || !head) return
		const measure = () => {
			const style = getComputedStyle(col)
			const width = inline ? (col.parentElement?.clientWidth ?? area.clientWidth) : area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
			// On phones the document scrolls, so the sheet can be far taller than the screen.
			const screen = Math.min(area.clientHeight, window.innerHeight)
			const height = inline ? screen * 0.66 : screen - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - head.offsetHeight - parseFloat(style.rowGap)
			const fit = Math.min((width - RING * 2) / WIDTH, (height - RING * 2) / HEIGHT)
			setScale(Math.min(1, Math.max(MIN_SCALE, fit)))
			setPaneHeight(area.clientHeight)
		}
		// Measured before the first paint too, so the phone never shows at the wrong size.
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(area)
		return () => observer.disconnect()
	}, [inline])

	return (
		<div className="preview-col" ref={column} style={{ '--phone-w': `${WIDTH * scale + RING * 2}px`, '--pane-h': `${paneHeight}px` } as CSSProperties}>
			<div className="preview-head" ref={heading}>
				<span>{t('即時預覽')}</span>
				{choices.length > 0 && (
					<select className="preview-lang" aria-label={t('預覽語言')} value={shownLocale} onChange={(event) => setPicked(event.target.value as Locale)}>
						{choices.map((code) => (
							<option key={code} value={code} lang={code}>
								{LANGUAGES.find((language) => language.code === code)?.name}
							</option>
						))}
					</select>
				)}
				{summary && <span>{summary}</span>}
			</div>
			<div className="phone-frame" style={{ height: HEIGHT * scale + RING * 2 }}>
				<div className="phone" style={{ transform: `scale(${scale})`, margin: RING }}>
					{frameSrc ? (
						<iframe title={t('頁面即時預覽')} src={frameSrc} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals" />
					) : (
						<LiveFrame html={html} />
					)}
				</div>
			</div>
		</div>
	)
}
