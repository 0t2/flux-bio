import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Global styles first, so the page stylesheets imported by App can override them.
import './styles.css'
import { App } from './App'
import { initLanguage } from './i18n'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

// The language's words load before the first render, so nothing flashes in another language.
void initLanguage().finally(() =>
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	),
)
