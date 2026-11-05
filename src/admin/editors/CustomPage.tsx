import { useId, useRef, useState } from 'react'
import { CUSTOM_HTML_LIMIT, type CustomPage } from '../../shared/content'
import { AskAi } from '../components/AskAi'
import { Dialog, Section, Segmented } from '../components/ui'
import { t } from '../i18n'
import { usePage } from '../state/page'

type Kind = 'links' | CustomPage['kind']

/** What the page is: a page of links, someone's own HTML, or a way on to another address. */
export function PageKind() {
	const { draft, update } = usePage()
	const kind: Kind = draft.custom?.kind ?? 'links'
	// What was typed stays for a switch back, until the dashboard reloads.
	const typed = useRef({ html: draft.custom?.kind === 'html' ? draft.custom.html : '', url: draft.custom?.kind === 'redirect' ? draft.custom.url : '' })
	const [asking, setAsking] = useState<Kind | null>(null)
	const urlId = useId()

	const change = (next: Kind) =>
		update((d) => {
			if (next === 'links') delete d.custom
			else d.custom = next === 'html' ? { kind: 'html', html: typed.current.html } : { kind: 'redirect', url: typed.current.url }
		})
	// Going from HTML to anything else is the one change that can lose real work.
	const pick = (next: Kind) => {
		if (next === kind) return
		if (draft.custom?.kind === 'html' && draft.custom.html.trim()) setAsking(next)
		else change(next)
	}

	return (
		<Section title={t('這一頁要做什麼')}>
			<Segmented
				label={t('這一頁要做什麼')}
				value={kind}
				onChange={pick}
				options={[
					{ value: 'links', label: t('連結頁') },
					{ value: 'html', label: t('自訂 HTML') },
					{ value: 'redirect', label: t('轉址') },
				]}
			/>
			{draft.custom?.kind === 'html' && (
				<div className="custom-field">
					<p className="hint">{t('貼上完整的 HTML。腳本可以執行，但碰不到這個網站的資料，也不能用 cookie。')}</p>
					<textarea
						className="textarea mono"
						dir="ltr"
						rows={16}
						spellCheck={false}
						maxLength={CUSTOM_HTML_LIMIT}
						aria-label={t('自訂 HTML')}
						placeholder="<!doctype html>"
						value={draft.custom.html}
						onChange={(event) => {
							typed.current.html = event.target.value
							update((d) => {
								d.custom = { kind: 'html', html: event.target.value }
							})
						}}
					/>
					<AskAi say={t('幫我把這一頁做成一頁式網站，放上我的介紹和聯絡方式')} />
				</div>
			)}
			{draft.custom?.kind === 'redirect' && (
				<div className="custom-field">
					<div className="field">
						<label htmlFor={urlId}>{t('要轉到的網址')}</label>
						<input
							id={urlId}
							className="input mono"
							type="url"
							dir="ltr"
							placeholder="https://"
							value={draft.custom.url}
							onChange={(event) => {
								typed.current.url = event.target.value
								update((d) => {
									d.custom = { kind: 'redirect', url: event.target.value }
								})
							}}
						/>
					</div>
					<p className="hint">{t('訪客打開這一頁會直接轉過去。這一頁的短網址照常運作。')}</p>
				</div>
			)}
			<Dialog
				open={asking !== null}
				title={t('要切換嗎？')}
				onClose={() => setAsking(null)}
				actions={
					<>
						<button type="button" className="btn" onClick={() => setAsking(null)}>
							{t('取消')}
						</button>
						<button
							type="button"
							className="btn danger"
							onClick={() => {
								if (asking) change(asking)
								setAsking(null)
							}}
						>
							{t('切換')}
						</button>
					</>
				}
			>
				<p>{t('重新整理後，這段 HTML 就找不回來了。發布過的版本還在發布紀錄裡。')}</p>
			</Dialog>
		</Section>
	)
}
