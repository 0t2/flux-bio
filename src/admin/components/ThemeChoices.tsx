import type { ThemeId } from '../../shared/content'
import { THEME_LIST } from '../../templates/themes'
import { t } from '../i18n'
import '../styles/library.css'

/** The base themes as a row of chips, for a page being made. */
export function ThemeChoices({ value, onChange, labelledBy }: { value: ThemeId; onChange: (theme: ThemeId) => void; labelledBy: string }) {
	return (
		<div className="lib-chips" role="group" aria-labelledby={labelledBy}>
			{THEME_LIST.map((theme) => (
				<button key={theme.id} type="button" className="lib-chip" aria-pressed={theme.id === value} onClick={() => onChange(theme.id)}>
					<span aria-hidden="true" style={{ background: theme.bg, borderColor: theme.accent }} />
					{t(theme.label)}
				</button>
			))}
		</div>
	)
}
