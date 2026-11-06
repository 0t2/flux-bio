import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearch } from 'wouter'
import type { CreateLinkResponse, LinkJson, LinksResponse } from '../../shared/api'
import { DEFAULT_QR_STYLE, defaultQrLogo, qrSvg, QrStyleSchema } from '../../shared/qr'
import { sourceLabel } from '../../shared/source'
import { ApiError, request } from '../api'
import { Bars, Sparkline } from '../components/charts'
import { AskAi } from '../components/AskAi'
import { Icon } from '../components/Icon'
import { QrDefaultsButton } from '../components/QrDefaults'
import { QR_HINT } from '../components/QrCode'
import { CopyButton, EmptyState, toast, Toggle, useSavedSwitch } from '../components/ui'
import { msg, t, tr } from '../i18n'
import { downloadBlob, formatDate, formatDateTime, fromLocalInput, toLocalInput } from '../lib/format'
import { imageToDataUrl, pixelSize, qrPng } from '../lib/qrExport'
import { useApp } from '../state/app'
import { useOptionalPage } from '../state/page'

type Filter = 'all' | 'bio' | 'solo'

/** Short links asked for at a time. */
const LINKS_AT_ONCE = 100
type Status = 'active' | 'scheduled' | 'expired' | 'archived'

const STATUS_LABEL: Record<Status, string> = { active: msg('啟用'), scheduled: msg('排程'), expired: msg('已過期'), archived: msg('已封存') }

function statusOf(link: LinkJson, now = Date.now()): Status {
	if (link.status === 'archived') return 'archived'
	if (link.startsAt && now < link.startsAt) return 'scheduled'
	if (link.expiresAt && now >= link.expiresAt) return 'expired'
	return 'active'
}

export function ShortLinksPage() {
	const app = useApp()
	const page = useOptionalPage()
	const search = useSearch()
	const [data, setData] = useState<LinksResponse | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [filter, setFilter] = useState<Filter>('all')
	const [query, setQuery] = useState('')
	const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(search).get('select'))
	// The selected link when it isn't among the links loaded: further down the list, or filtered out.
	const [selectedApart, setSelectedApart] = useState<LinkJson | null>(null)
	const [loadingMore, setLoadingMore] = useState(false)
	const latest = useRef(0)

	const listPath = useCallback((cursor?: string | null) => {
		const params = new URLSearchParams({ limit: String(LINKS_AT_ONCE) })
		if (filter !== 'all') params.set('kind', filter)
		if (query.trim()) params.set('q', query.trim())
		if (cursor) params.set('cursor', cursor)
		return `/links?${params.toString()}`
	}, [filter, query])

	const load = useCallback(async (select?: string) => {
		const attempt = ++latest.current
		try {
			const result = await request<LinksResponse>(listPath())
			if (attempt !== latest.current) return
			setData(result)
			setLoadError(null)
			const wanted = select ?? selectedRef.current
			if (wanted && !result.links.some((link) => link.id === wanted)) {
				const apart = await request<{ link: LinkJson }>(`/links/${encodeURIComponent(wanted)}`).then((found) => found.link, () => null)
				if (attempt !== latest.current) return
				setSelectedApart(apart)
				setSelectedId(apart ? wanted : (result.links[0]?.id ?? null))
			} else {
				setSelectedApart(null)
				setSelectedId(wanted ?? result.links[0]?.id ?? null)
			}
		} catch (error) {
			if (attempt === latest.current) setLoadError(error instanceof Error ? error.message : t('讀取失敗'))
		}
	}, [listPath])

	const selectedRef = useRef(selectedId)
	selectedRef.current = selectedId

	async function loadMore() {
		if (!data?.nextCursor) return
		const attempt = latest.current
		setLoadingMore(true)
		try {
			const more = await request<LinksResponse>(listPath(data.nextCursor))
			if (attempt === latest.current) setData({ ...more, links: [...data.links, ...more.links] })
		} catch (error) {
			toast(error instanceof Error ? error.message : t('讀取失敗'))
		} finally {
			setLoadingMore(false)
		}
	}

	// A saved change comes back from the Worker as the link, so it goes into the list where it is: reading the list
	// again would cost a request and drop whatever "load more" had added. Its clicks are the ones already shown.
	const replace = useCallback((changed: LinkJson) => {
		const keep = (link: LinkJson) => (link.id === changed.id ? { ...changed, stats: link.stats } : link)
		setData((current) => current && { ...current, links: current.links.map(keep) })
		setSelectedApart((current) => current && keep(current))
	}, [])

	// Reload after publishing: new bio links appear here as short links. The list is searched on the Worker, so typing waits for a pause.
	useEffect(() => {
		const timer = setTimeout(() => void load(), query ? 250 : 0)
		return () => clearTimeout(timer)
	}, [load, query, page?.publishedAt])

	const links = data?.links ?? []
	const pageNames = useMemo(() => new Map(app.pages.map((entry) => [entry.id, entry.name || entry.handle])), [app.pages])
	const visible = links
	const selected = links.find((link) => link.id === selectedId) ?? (selectedApart?.id === selectedId ? selectedApart : null)
	const searching = filter !== 'all' || Boolean(query.trim())

	const tabs: { id: Filter; label: string }[] = [
		{ id: 'all', label: t('全部') },
		{ id: 'bio', label: t('頁面連結') },
		{ id: 'solo', label: t('獨立短網址') },
	]
	// Only short links here: telling page links from standalone ones would say nothing.
	const plain = !app.settings.bio && !searching && !links.some((link) => link.kind === 'bio')

	return (
		<>
			<div className="page-head">
				<div>
					<h1>{t('短網址')}</h1>
					<p>{app.settings.bio ? t('頁面上的連結會自動出現在這裡；也可以單獨建立，用在貼文、DM 或印刷品。') : t('建立短網址，用在貼文、DM 或印刷品。')}</p>
				</div>
				<QrDefaultsButton />
			</div>

			{loadError && (
				<div className="banner" role="alert">
					{loadError}
				</div>
			)}

			{data && links.length === 0 && !searching ? (
				<EmptyState icon="shortlink" title={t('還沒有短網址')}>
					<CreateForm compact onCreated={(id) => load(id)} />
					<AskAi say={t('把這份清單做成短網址')} />
				</EmptyState>
			) : (
				<>
					<CreateForm onCreated={(id) => load(id)} />
					<div className="links-grid" style={{ marginTop: 20 }}>
						<section className="table-card" aria-label={t('短網址列表')}>
							<div className="table-tools">
								{!plain && (
									<div className="tabs" role="group" aria-label={t('篩選')}>
										{tabs.map((tab) => (
											<button key={tab.id} type="button" className="tab" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>
												{tab.label}
												{filter === tab.id && data && <span>{data.nextCursor ? `${links.length}+` : links.length}</span>}
											</button>
										))}
									</div>
								)}
								<label className="search">
									<Icon name="search" size={16} stroke={2} />
									<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('搜尋代稱或目的網址')} aria-label={t('搜尋短網址')} />
								</label>
							</div>
							<div className="table-scroll">
								<div className={plain ? 'table plain' : 'table'}>
									<div className="table-row head">
										<span>{t('短網址')}</span>
										<span>{t('目的網址')}</span>
										<span>{t('來源')}</span>
										<span>{t('近 7 天點擊')}</span>
										<span>{t('狀態')}</span>
									</div>
									{visible.map((link) => {
										const status = statusOf(link)
										return (
											<button key={link.id} type="button" className="table-row" aria-pressed={link.id === selectedId} onClick={() => setSelectedId(link.id)}>
												<span className="cell-ellipsis short" dir="ltr">
													<span>/</span>
													<b>{link.slug.startsWith('~') ? t('（已移除）') : link.slug}</b>
												</span>
												<span className="cell-ellipsis dest" dir="ltr">
													{link.url}
												</span>
												<span>
													<span className="kind-pill">{link.kind === 'bio' ? 'Bio' : t('獨立')}</span>
												</span>
												<span className="clicks">
													<Sparkline values={link.stats?.series ?? []} color="var(--faint)" />
													{link.stats?.total ?? 0}
												</span>
												<span>
													<span className={`status ${status}`}>{t(STATUS_LABEL[status])}</span>
												</span>
											</button>
										)
									})}
									{data && visible.length === 0 && (
										<p className="hint" style={{ padding: '32px 20px', borderTop: '1px solid rgba(19, 20, 22, 0.06)' }}>
											{t('沒有符合的短網址。')}
										</p>
									)}
								</div>
							</div>
							{data?.nextCursor && (
								<div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
									<button type="button" className="btn" disabled={loadingMore} onClick={() => void loadMore()}>
										{t('載入更多')}
									</button>
								</div>
							)}
						</section>

						{selected && (
							<LinkDetail
								key={selected.id}
								link={selected}
								pageName={selected.pageId ? (pageNames.get(selected.pageId) ?? '') : ''}
								onChanged={replace}
							/>
						)}
					</div>
				</>
			)}
		</>
	)
}

function CreateForm({ onCreated, compact }: { onCreated: (id: string) => void; compact?: boolean }) {
	const app = useApp()
	const [url, setUrl] = useState('')
	const [slug, setSlug] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function submit(event: FormEvent) {
		event.preventDefault()
		setBusy(true)
		setError(null)
		try {
			const { link } = await request<CreateLinkResponse>('/links', { method: 'POST', json: { url, slug: slug || undefined } })
			setUrl('')
			setSlug('')
			toast(t('已建立 {url}', { url: `${app.host}/${link.slug}` }))
			onCreated(link.id)
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('建立失敗'))
		} finally {
			setBusy(false)
		}
	}

	const form = (
		<>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			<form className={compact ? 'create-form compact' : 'create-form'} onSubmit={submit}>
				<div className="field">
					<label htmlFor="long-url">{compact ? t('要縮短的網址') : t('長網址')}</label>
					<input id="long-url" className="input mono" type="url" required placeholder={compact ? t('貼上長網址') : 'https://'} value={url} onChange={(event) => setUrl(event.target.value)} />
				</div>
				{!compact && (
					<div className="field">
						<label htmlFor="new-slug">{t('自訂代稱（選填，可用中文）')}</label>
						<div className="prefixed">
							<span>{app.host}/</span>
							<input id="new-slug" maxLength={64} placeholder={t('例如 lens')} value={slug} onChange={(event) => setSlug(event.target.value)} />
						</div>
					</div>
				)}
				<button type="submit" className="btn primary" disabled={busy || !url}>
					{busy ? t('建立中…') : compact ? t('縮短') : t('建立')}
				</button>
			</form>
		</>
	)
	if (compact) return form
	return (
		<section className="section" aria-labelledby="create-heading">
			<div className="section-row">
				<h2 id="create-heading" className="section-title">
					{t('建立短網址')}
				</h2>
				<AskAi say={t('把這個網址做成 IG、Threads、LINE 各一個帶 UTM 的短網址')} />
			</div>
			{form}
		</section>
	)
}

function LinkDetail({ link, pageName, onChanged }: { link: LinkJson; pageName: string; onChanged: (link: LinkJson) => void }) {
	const app = useApp()
	const [editing, setEditing] = useState(false)
	const status = statusOf(link)
	const total = link.stats?.total ?? 0
	const removed = link.slug.startsWith('~')

	async function setArchived(archived: boolean) {
		try {
			const saved = await request<{ link: LinkJson }>(`/links/${link.id}`, { method: 'PATCH', json: { status: archived ? 'archived' : 'active' } })
			toast(archived ? t('已封存，這個短網址不會再轉址') : t('已恢復'))
			onChanged(saved.link)
		} catch (error) {
			toast(error instanceof Error ? error.message : t('操作失敗'))
		}
	}

	return (
		<aside className="detail" aria-label={t('短網址詳情')}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
				<div className="section-row">
					<span style={{ fontSize: 12, color: 'var(--muted)' }}>
						{t('建立於 {date}', { date: formatDate(link.createdAt) })}
					</span>
					<span className={`status ${status}`}>{t(STATUS_LABEL[status])}</span>
				</div>
				<p className="detail-short" dir={removed ? undefined : 'ltr'}>{removed ? t('（已從頁面移除）') : `${app.host}/${link.slug}`}</p>
				<p className="detail-dest" dir="ltr">→ {link.url}</p>
				{link.kind === 'bio' && <p className="hint">{pageName ? t('{page} 頁面上的「{title}」', { page: pageName, title: link.title }) : t('頁面上的連結「{title}」', { title: link.title })}</p>}
				<div className="detail-buttons">
					<CopyButton text={link.short} label={t('複製')} className="btn primary square" />
					<Link href={`/short-links/${link.id}/stats`} className="btn square">
						{t('看數據')}
					</Link>
					<button type="button" className="btn square" onClick={() => setEditing(!editing)}>
						{editing ? t('取消編輯') : t('編輯')}
					</button>
					{link.kind === 'solo' && (
						<button type="button" className="btn square" onClick={() => setArchived(link.status !== 'archived')}>
							{link.status === 'archived' ? t('恢復') : t('封存')}
						</button>
					)}
				</div>
			</div>

			{editing ? (
				<EditForm
					link={link}
					onDone={(saved) => {
						setEditing(false)
						onChanged(saved)
					}}
				/>
			) : (
				<>
					{!removed && <LinkQr link={link} />}
					<div className="detail-block">
						<div className="section-row">
							<p className="section-title">{t('點擊來源')}</p>
							<span style={{ fontSize: 12, color: 'var(--muted)' }}>
								{t('近 7 天 · {count} 次', { count: total })}
							</span>
						</div>
						<Bars
							items={(link.stats?.sources ?? []).map((source) => ({ label: t(sourceLabel(source.source)), value: source.count }))}
							empty={t('還沒有點擊紀錄，分享出去後就會開始統計。')}
						/>
					</div>
					<SmartRouting link={link} onChanged={onChanged} />
					<div className="detail-block">
						<div className="section-row">
							<p className="section-title">{t('進階設定')}</p>
							<button type="button" className="btn small" onClick={() => setEditing(true)}>
								{t('編輯')}
							</button>
						</div>
						<div className="kv-list">
							<div className="kv">
								<span>{t('開放時間')}</span>
								<span>{link.startsAt ? formatDateTime(link.startsAt) : t('立即')}</span>
							</div>
							<div className="kv">
								<span>{t('到期日')}</span>
								<span>{link.expiresAt ? formatDateTime(link.expiresAt) : t('不設定')}</span>
							</div>
							<div className="kv">
								<span>{t('密碼保護')}</span>
								<span>{link.hasPassword ? t('[state]開啟') : t('[state]關閉')}</span>
							</div>
							<div className="kv">
								<span>UTM</span>
								<span>{[link.utm.source, link.utm.medium, link.utm.campaign, link.utm.content].filter(Boolean).join(' / ') || '—'}</span>
							</div>
						</div>
					</div>
				</>
			)}
		</aside>
	)
}

/** The saved QR style for the link, with a PNG download and a way into the style editor. */
function LinkQr({ link }: { link: LinkJson }) {
	const app = useApp()
	const page = useOptionalPage()
	const parsed = QrStyleSchema.safeParse(link.qr)
	const style = parsed.success ? parsed.data : DEFAULT_QR_STYLE
	const value = `${link.short}?s=qr`
	// With pages off no page is loaded, but a code saved with the avatar on it keeps it.
	const avatar = page ? page.draft.profile.avatar : app.current?.avatar
	const fallback = defaultQrLogo(app.pages.find((entry) => entry.id === link.pageId)?.qrLogo, app.settings.qrLogo)
	const media = style.logo === 'upload' ? style.logoMedia : style.logo === 'avatar' ? avatar : style.logo === 'default' ? fallback?.media : null
	const logo = media ? `/media/${media}` : null
	const svg = useMemo(() => qrSvg(value, style, { logoHref: logo }), [value, style, logo])
	const [busy, setBusy] = useState(false)

	async function download() {
		setBusy(true)
		try {
			const inline = qrSvg(value, style, { logoHref: logo ? await imageToDataUrl(logo) : null })
			downloadBlob(await qrPng(inline, pixelSize(style)), `qr-${link.slug}.png`)
		} catch {
			toast(t('QR Code 下載失敗，請再試一次'))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="detail-block">
			<div className="qr-row">
				{/* The SVG is built from the QR matrix by qrSvg(), not from user-supplied markup. */}
				<div className="qr" role="img" aria-label={t('{value} 的 QR Code', { value: link.short })} dangerouslySetInnerHTML={{ __html: svg }} />
				<div style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
					<p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>QR Code</p>
					<p className="hint">{t(QR_HINT)}</p>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
						<button type="button" className="btn small" onClick={download} disabled={busy}>
							<Icon name="download" size={16} />
							{busy ? t('產生中…') : t('下載 PNG')}
						</button>
						<Link href={`/short-links/${link.id}/qr`} className="btn small">
							{t('自訂樣式')}
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}

function SmartRouting({ link, onChanged }: { link: LinkJson; onChanged: (link: LinkJson) => void }) {
	const [ios, setIos] = useState(link.iosUrl ?? '')
	const [android, setAndroid] = useState(link.androidUrl ?? '')
	const [error, setError] = useState<string | null>(null)
	// The link as the Worker last answered with it.
	const answered = useRef(link)

	async function send(patch: Record<string, unknown>): Promise<boolean> {
		setError(null)
		try {
			answered.current = (await request<{ link: LinkJson }>(`/links/${link.id}`, { method: 'PATCH', json: patch })).link
			return true
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('儲存失敗'))
			return false
		}
	}

	function saved() {
		toast(t('已儲存，立即生效'))
		onChanged(answered.current)
	}

	async function save(patch: Record<string, unknown>) {
		if (await send(patch)) saved()
	}

	const [line, setLine] = useSavedSwitch(link.lineExternal, (lineExternal) => send({ lineExternal }), saved)
	const [inApp, setInApp] = useSavedSwitch(link.inAppPrompt, (inAppPrompt) => send({ inAppPrompt }), saved)

	return (
		<div className="detail-block">
			<div>
				<p className="section-title">{t('智慧導向')}</p>
			</div>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			<div className="section-row">
				<div>
					<p className="routing-title">{t('LINE 裡改用外部瀏覽器開啟')}</p>
				</div>
				<Toggle on={line} label={t('LINE 裡改用外部瀏覽器開啟')} onChange={setLine} />
			</div>
			<div className="section-row">
				<div>
					<p className="routing-title">{t('IG、Threads、FB 裡先提示改用外部瀏覽器開啟')}</p>
					<a className="hint" href={`${link.short}?inapp=preview`} target="_blank" rel="noopener noreferrer">
						{t('預覽提示頁')}
					</a>
				</div>
				<Toggle on={inApp} label={t('IG、Threads、FB 裡先提示改用外部瀏覽器開啟')} onChange={setInApp} />
			</div>
			<div className="field">
				<label htmlFor={`ios-${link.id}`}>{t('iPhone／iPad 改導向（選填）')}</label>
				<input
					id={`ios-${link.id}`}
					className="input mono"
					type="url"
					placeholder="https://apps.apple.com/…"
					value={ios}
					onChange={(event) => setIos(event.target.value)}
					onBlur={() => ios.trim() !== (link.iosUrl ?? '') && save({ iosUrl: ios.trim() || null })}
				/>
			</div>
			<div className="field">
				<label htmlFor={`android-${link.id}`}>{t('Android 改導向（選填）')}</label>
				<input
					id={`android-${link.id}`}
					className="input mono"
					type="url"
					placeholder="https://play.google.com/…"
					value={android}
					onChange={(event) => setAndroid(event.target.value)}
					onBlur={() => android.trim() !== (link.androidUrl ?? '') && save({ androidUrl: android.trim() || null })}
				/>
			</div>
		</div>
	)
}

function EditForm({ link, onDone }: { link: LinkJson; onDone: (saved: LinkJson) => void }) {
	const app = useApp()
	const page = useOptionalPage()
	const [url, setUrl] = useState(link.url)
	const [slug, setSlug] = useState(link.slug)
	const [title, setTitle] = useState(link.title)
	const [startsAt, setStartsAt] = useState(toLocalInput(link.startsAt))
	const [expiresAt, setExpiresAt] = useState(toLocalInput(link.expiresAt))
	const [password, setPassword] = useState('')
	const [removePassword, setRemovePassword] = useState(false)
	const [utm, setUtm] = useState({ source: link.utm.source ?? '', medium: link.utm.medium ?? '', campaign: link.utm.campaign ?? '', content: link.utm.content ?? '' })
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const solo = link.kind === 'solo'

	async function submit(event: FormEvent) {
		event.preventDefault()
		setBusy(true)
		setError(null)
		const patch: Record<string, unknown> = {
			utm: { source: utm.source || null, medium: utm.medium || null, campaign: utm.campaign || null, content: utm.content || null },
		}
		if (solo) {
			patch.url = url
			patch.slug = slug
			patch.title = title
			patch.startsAt = fromLocalInput(startsAt)
			patch.expiresAt = fromLocalInput(expiresAt)
		}
		if (password) patch.password = password
		else if (removePassword) patch.password = null
		try {
			if (!solo && slug.trim() !== link.slug) {
				// The page being edited keeps its copy of the draft in step; any other page loads afresh.
				if (page?.id === link.pageId) await page.shortLink(link.id, slug.trim())
				else patch.slug = slug.trim()
			}
			const saved = await request<{ link: LinkJson }>(`/links/${link.id}`, { method: 'PATCH', json: patch })
			toast(t('已儲存，立即生效'))
			onDone(saved.link)
		} catch (caught) {
			setError(caught instanceof ApiError ? caught.message : t('儲存失敗'))
		} finally {
			setBusy(false)
		}
	}

	return (
		<form className="detail-block" onSubmit={submit}>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{solo ? (
				<>
					<div className="field">
						<label htmlFor="edit-url">{t('目的網址')}</label>
						<input id="edit-url" className="input mono" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} />
					</div>
					<div className="field">
						<label htmlFor="edit-slug">{t('代稱')}</label>
						<div className="prefixed">
							<span>{app.host}/</span>
							<input id="edit-slug" required maxLength={64} value={slug} onChange={(event) => setSlug(event.target.value)} />
						</div>
					</div>
					<div className="field">
						<label htmlFor="edit-title">{t('名稱（只有你看得到）')}</label>
						<input id="edit-title" className="input" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} />
					</div>
					<div className="field-row">
						<div className="field">
							<label htmlFor="edit-start">{t('開放時間（空白＝立即）')}</label>
							<input id="edit-start" className="input" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
						</div>
						<div className="field">
							<label htmlFor="edit-expire">{t('到期日（空白＝不設定）')}</label>
							<input id="edit-expire" className="input" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
						</div>
					</div>
				</>
			) : (
				<>
				<div className="field">
					<label htmlFor="edit-slug">{t('代稱')}</label>
					<div className="prefixed">
						<span>{app.host}/</span>
						<input id="edit-slug" required maxLength={64} value={slug} onChange={(event) => setSlug(event.target.value)} />
					</div>
				</div>
				<p className="hint">
					{app.settings.bio
						? tr('這是頁面上的連結：目的網址、開放時間和到期日請到 {link} 修改並發布。這裡可以設定代稱、密碼和 UTM。', { link: <Link href="/">{t('[nav]頁面')}</Link> })
						: tr('這是頁面上的連結：要改目的網址、開放時間和到期日，請先到 {link} 打開頁面功能。這裡可以設定代稱、密碼和 UTM。', { link: <Link href="/settings">{t('設定')}</Link> })}
				</p>
				</>
			)}
			<div className="field">
				<label htmlFor="edit-password">{link.hasPassword ? t('更換密碼（留空＝不變）') : t('密碼保護（留空＝不設定）')}</label>
				<input id="edit-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
				{link.hasPassword && (
					<label className="inline-toggle" style={{ gap: 8 }}>
						<input type="checkbox" checked={removePassword} onChange={(event) => setRemovePassword(event.target.checked)} />
						{t('移除密碼')}
					</label>
				)}
			</div>
			<div className="field-row">
				{(['source', 'medium', 'campaign', 'content'] as const).map((key) => (
					<div className="field" key={key}>
						<label htmlFor={`edit-utm-${key}`}>utm_{key}</label>
						<input id={`edit-utm-${key}`} className="input mono" maxLength={100} value={utm[key]} onChange={(event) => setUtm({ ...utm, [key]: event.target.value })} />
					</div>
				))}
			</div>
			<div style={{ display: 'flex', gap: 8 }}>
				<button type="submit" className="btn primary square" disabled={busy}>
					{busy ? t('儲存中…') : t('儲存')}
				</button>
			</div>
		</form>
	)
}
