import { LANGUAGES, setLanguage, t, useLanguage, type Language } from '../i18n'

/** The dashboard's language. Choosing one re-renders the app in it and remembers it in this browser. */
export function LanguageSelect({ className }: { className?: string }) {
	const current = useLanguage()
	return (
		<select
			className={className ? `language-select ${className}` : 'language-select'}
			aria-label={t('後台語言')}
			title={t('後台語言')}
			value={current}
			onChange={(event) => void setLanguage(event.target.value as Language)}
		>
			{LANGUAGES.map((entry) => (
				<option key={entry.code} value={entry.code} lang={entry.code}>
					{entry.name}
				</option>
			))}
		</select>
	)
}
