import { useState } from 'react'
import { LOCALES, type Locale, type Settings } from '../../shared/content'
import { otherLanguages } from '../../shared/locale'
import { untranslated } from '../../shared/translations'
import { ApiError, request } from '../api'
import { AskAi } from '../components/AskAi'
import { Section, toast } from '../components/ui'
import { LANGUAGES, t } from '../i18n'
import { useApp } from '../state/app'
import { usePage } from '../state/page'

const NAMES = Object.fromEntries(LANGUAGES.map((language) => [language.code, language.name])) as Record<Locale, string>

/**
 * The language of the built-in text on public pages (buttons, notices, opening
 * hours), and the other languages visitors may get from their browser. It is a
 * site setting: shared by every page and saved at once, not with the draft.
 * The owner's own text in those languages is their AI's job, so this only says
 * how far this page's draft has got.
 */
export function PageLanguages() {
	const app = useApp()
	const { locale, languages } = app.settings
	const { draft } = usePage()
	const missing = untranslated(draft, languages)
	const pending = languages.filter((code) => missing[code]?.length)
	const [busy, setBusy] = useState(false)

	async function save(next: Locale, others: readonly Locale[]) {
		if (busy) return
		setBusy(true)
		try {
			const { settings } = await request<{ settings: Settings }>('/settings', {
				method: 'PUT',
				json: { locale: next, languages: otherLanguages(next, others) },
			})
			app.setSettings(settings)
			toast(t('已儲存，立即生效'))
		} catch (error) {
			toast(error instanceof ApiError ? error.message : t('儲存失敗，請稍後再試'))
		} finally {
			setBusy(false)
		}
	}

	const toggle = (code: Locale) => void save(locale, languages.includes(code) ? languages.filter((other) => other !== code) : [...languages, code])

	return (
		<Section title={t('頁面語言')}>
			<p className="hint">{t('按鈕、提示、營業時間這些內建文字的語言。所有頁面共用，改了立即生效；你寫的內容可以請 AI 翻譯。')}</p>
			<div className="field">
				<label htmlFor="page-locale">{t('主要語言')}</label>
				<select id="page-locale" className="select" value={locale} disabled={busy} onChange={(event) => void save(event.target.value as Locale, languages)}>
					{LOCALES.map((code) => (
						<option key={code} value={code} lang={code}>
							{NAMES[code]}
						</option>
					))}
				</select>
			</div>
			<div className="field">
				<p className="label" id="page-languages-label">
					{t('也開放這些語言')}
				</p>
				<p className="hint" id="page-languages-hint">
					{languages.length ? t('瀏覽器設成這些語言的訪客會看到對應的語言，其他人看主要語言。') : t('目前只用主要語言。選了之後，瀏覽器設成那些語言的訪客會自動切換。')}
				</p>
				<div className="option-grid langs" role="group" aria-labelledby="page-languages-label" aria-describedby="page-languages-hint">
					{LOCALES.filter((code) => code !== locale).map((code) => (
						<button key={code} type="button" className="option lang" lang={code} aria-pressed={languages.includes(code)} disabled={busy} onClick={() => toggle(code)}>
							{NAMES[code]}
						</button>
					))}
				</div>
			</div>
			{languages.length > 0 && (
				<div className="field">
					<p className="hint">
						{pending.length
							? t('這一頁有文字還沒翻譯成 {languages}，訪客會先看到原文。', { languages: pending.map((code) => NAMES[code]).join(', ') })
							: t('這一頁的內容都翻譯好了。')}
					</p>
					{pending.length > 0 && <AskAi say={t('把這一頁翻譯成已開放的語言，然後發布')} />}
				</div>
			)}
		</Section>
	)
}
