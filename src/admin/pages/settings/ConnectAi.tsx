import { useState } from 'react'
import { CopyButton, Section } from '../../components/ui'
import { msg, t, tr } from '../../i18n'
import { useApp } from '../../state/app'
import { TokensSection } from './TokensSection'
import '../../styles/settings.css'

// FluxBio is run through an AI agent: the owner makes a token here and pastes it
// to their AI with the guide at /llms.txt (src/worker/lib/agent.ts).

const TOOLS = ['Claude Code', 'Codex', 'Cursor'] as const
type Tool = (typeof TOOLS)[number]

const TOKEN_PLACEHOLDER = msg('<貼上你的 token>')

/** Only for a site with pages. */
const PAGE_EXAMPLE = msg('加一個連到我 YouTube 頻道的連結，放最上面，然後發布')

/** What the owner can say once their AI is connected. Each one is a task the agent guide covers. */
const EXAMPLES = [
	msg('看一下我的網站，還有哪些可以加強？'),
	PAGE_EXAMPLE,
	msg('把這個網址做成 IG、Threads、LINE 各一個帶 UTM 的短網址'),
	msg('這個月哪個連結最多人點？跟上個月比呢？'),
	msg('把網域換成 links.example.com'), // taste-skill-ignore: a reserved example domain in a sample sentence
	msg('幫我備份整個網站'),
]

export function ConnectAi() {
	// The token made on this visit is filled into the prompt; afterwards only its last four characters are known.
	const [token, setToken] = useState<string | null>(null)
	const [tool, setTool] = useState<Tool>('Claude Code')
	const { settings, origin } = useApp()
	const code = (text: string) => <code className="set-inline-code">{text}</code>
	return (
		<>
			<TokensSection onCreated={setToken} />
			<Section title={t('選你用的 AI')}>
				<div className="set-scopes" role="group" aria-label={t('你用的 AI')}>
					{TOOLS.map((option) => (
						<button key={option} type="button" className="set-choice compact" aria-pressed={tool === option} onClick={() => setTool(option)}>
							{option}
						</button>
					))}
				</div>
				{tool === 'Codex' && (
					<p className="set-tool-note">
						{tr('Codex 預設不能連網：先在 {file} 的 {section} 加上 {setting}。', {
							file: code('~/.codex/config.toml'),
							section: code('[sandbox_workspace_write]'),
							setting: code('network_access = true'),
						})}
					</p>
				)}
				<p className="set-tool-note">{t('在 {tool} 開新對話，貼上：', { tool })}</p>
				<Block text={startPrompt(origin, token)} />
			</Section>
			<Section title={t('接上之後，可以這樣說')}>
				<ul className="set-examples">
					{EXAMPLES.filter((example) => settings.bio || example !== PAGE_EXAMPLE).map((example) => (
						<li key={example}>{t('「{text}」', { text: t(example) })}</li>
					))}
				</ul>
			</Section>
		</>
	)
}

function startPrompt(origin: string, token: string | null): string {
	return [
		t('請幫我管理我的 FluxBio：{origin}', { origin }),
		t('先讀 {origin}/llms.txt，照裡面的說明用 API 操作。', { origin }),
		t('API token：{token}', { token: token ?? t(TOKEN_PLACEHOLDER) }),
		t('先看一下網站現況，告訴我還有哪些可以設定。'),
	].join('\n')
}

/** A few lines to paste into a chat. */
function Block({ text }: { text: string }) {
	return (
		<div className="set-command set-after">
			<code className="set-wrap">{text}</code>
			<CopyButton text={text} />
		</div>
	)
}
