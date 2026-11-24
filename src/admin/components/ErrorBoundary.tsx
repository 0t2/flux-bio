import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n'

interface State {
	error: Error | null
}

/** Catches unexpected render errors so a broken view never blanks the whole dashboard. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
	override state: State = { error: null }

	static getDerivedStateFromError(error: Error): State {
		return { error }
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error('Dashboard render error', error, info.componentStack)
	}

	override render(): ReactNode {
		if (!this.state.error) return this.props.children
		return (
			<div className="loading">
				<div className="error-boundary" role="alert">
					<p className="form-error">{t('畫面發生錯誤，請重新整理')}</p>
					<button type="button" className="btn primary" onClick={() => window.location.reload()}>
						{t('重新整理')}
					</button>
				</div>
			</div>
		)
	}
}
