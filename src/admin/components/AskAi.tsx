import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { t, tr } from '../i18n'
import { copyText } from '../lib/format'
import { Icon } from './Icon'
import { toast } from './ui'

/** Where the owner's AI does the job better than a form: one sentence they can copy in one click, or set up AI first. */
export function AskAi({ say }: { say: string }) {
	const [copied, setCopied] = useState(false)
	useEffect(() => {
		if (!copied) return
		const timer = window.setTimeout(() => setCopied(false), 1800)
		return () => window.clearTimeout(timer)
	}, [copied])

	return (
		<p className="ask-ai">
			{tr('{link}：「{say}」', {
				link: <Link href="/settings">{t('交給 AI')}</Link>,
				say: (
					<button
						type="button"
						className="ask-ai-copy"
						title={t('複製')}
						onClick={async () => {
							if (await copyText(say)) {
								setCopied(true)
								toast(t('已複製'))
							} else {
								toast(t('無法複製，請手動選取'))
							}
						}}
					>
						<span>{say}</span>
						<Icon name={copied ? 'check' : 'copy'} size={14} stroke={2} />
					</button>
				),
			})}
		</p>
	)
}
