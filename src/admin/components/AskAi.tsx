import { Link } from 'wouter'
import { t, tr } from '../i18n'

/** Where the owner's AI does the job better than a form: one sentence they could say to it. */
export function AskAi({ say }: { say: string }) {
	return (
		<p className="ask-ai">
			{tr('{link}：「{say}」', { link: <Link href="/settings">{t('交給 AI')}</Link>, say })}
		</p>
	)
}
