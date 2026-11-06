import { Fragment, useEffect, useState } from 'react'
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
	isScheduledNow,
	ITEM_LIMIT,
	newEmbed,
	newId,
	newItem,
	SOCIAL_PLATFORMS,
	type EmbedItem,
	type Item,
	type SocialPlatform,
} from '../../shared/content'
import { EMBED_PROVIDERS, EMBEDS, type EmbedProvider } from '../../shared/embeds'
import { STARTER_IDS, STARTER_LABELS, starterContent, starterPreview, type StarterId } from '../../shared/starters'
import { SOCIAL_META } from '../../templates/icons'
import { Icon } from '../components/Icon'
import { PhonePreview } from '../components/PhonePreview'
import { ConfirmButton, EmptyState, Section, Toggle, useMedia } from '../components/ui'
import { EmbedAccountField, EmbedEditor, GalleryEditor, HeadingEditor, ProductEditor, VideoEditor } from '../editors/BlockEditors'
import { HoursEditor } from '../editors/HoursEditor'
import { BLOCK_CHOICES, choiceText, itemIcon, itemTitle, kindText, type BlockChoice } from '../editors/kinds'
import { LinkEditor } from '../editors/LinkEditor'
import { t } from '../i18n'
import { ProfileSection } from '../editors/ProfileSection'
import { formatDateTime } from '../lib/format'
import { useApp } from '../state/app'
import { usePage } from '../state/page'

export function LinksPanel({
	selected,
	onSelect: setSelected,
	onTrial,
}: {
	selected: string | null
	onSelect: (id: string | null) => void
	/** A template being looked at, which the phone shows instead of the draft. */
	onTrial: (id: StarterId | null) => void
}) {
	const page = usePage()
	const { draft } = page

	function add(choice: BlockChoice) {
		const item = choice.kind === 'embed' ? newEmbed(choice.provider) : newItem(choice.kind)
		// New items come with zh-TW default titles; start them in the dashboard's language.
		if (item.title) item.title = t(item.title)
		page.update((d) => {
			d.items.push(item)
		})
		setSelected(item.id)
		// The editor for the new item sits below the list; bring it into view.
		requestAnimationFrame(() => document.getElementById('item-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
	}

	function start(starter: StarterId) {
		const content = starterContent(starter, draft.profile.name, t)
		page.update((d) => {
			d.items = content.items
			d.appearance = { ...d.appearance, theme: content.appearance.theme, accent: '', font: 'auto', button: 'auto' }
			if (!d.profile.bio.trim()) d.profile.bio = content.profile.bio
		})
		setSelected(content.items[0]?.id ?? null)
	}

	return (
		<>
			<div className="page-head">
				<p>
					<span className="mobile-only">{t('長按拖曳調整順序，右上角的眼睛可以預覽。')}</span>
				</p>
				<button type="button" className="btn" onClick={() => add({ kind: 'link' })} disabled={draft.items.length >= ITEM_LIMIT}>
					<Icon name="plus" size={18} stroke={2} />
					{t('新增連結')}
				</button>
			</div>

			{draft.items.length === 0 ? (
				<EmptyState icon="link" title={t('你的頁面還是空的')}>
					<button type="button" className="btn primary" onClick={() => add({ kind: 'link' })}>
						{t('新增第一個連結')}
					</button>
					<p className="hint">{t('或從範本開始')}</p>
					<StarterChoices onTrial={onTrial} onUse={start} />
				</EmptyState>
			) : (
				<ItemList selected={selected} onSelect={setSelected} />
			)}

			<Section title={t('新增區塊')}>
				<div className="kind-grid">
					{BLOCK_CHOICES.map((choice) => {
						const text = choiceText(choice)
						return (
							<button key={choice.kind === 'embed' ? choice.provider : choice.kind} type="button" className="kind-card" onClick={() => add(choice)} disabled={draft.items.length >= ITEM_LIMIT}>
								<span className="kind-icon" aria-hidden="true">
									<Icon name={text.icon} size={16} />
								</span>
								<span className="kind-text">
									<strong>{text.add}</strong>
									<small>{text.sub}</small>
								</span>
							</button>
						)
					})}
				</div>
			</Section>

			<ProfileSection />
			<SocialSection />
		</>
	)
}

/** Hovering or tapping a template shows it in the phone; nothing changes until it is used. */
function StarterChoices({ onTrial, onUse }: { onTrial: (id: StarterId | null) => void; onUse: (id: StarterId) => void }) {
	const { draft } = usePage()
	const [picked, setPicked] = useState<StarterId | null>(null)
	const [pointing, setPointing] = useState<StarterId | null>(null)
	const shown = pointing ?? picked
	useEffect(() => {
		onTrial(shown)
		return () => onTrial(null)
	}, [shown, onTrial])
	// Phones have no preview pane, so the template shows right here instead.
	const narrow = useMedia('(max-width: 760px)')
	return (
		<>
			<div className="starter-row">
				{STARTER_IDS.map((id) => (
					<button
						key={id}
						type="button"
						className="option starter"
						aria-pressed={picked === id}
						onClick={() => setPicked(id)}
						onPointerEnter={(event) => event.pointerType === 'mouse' && setPointing(id)}
						onPointerLeave={() => setPointing(null)}
						onFocus={() => setPointing(id)}
						onBlur={() => setPointing(null)}
					>
						<strong>{t(STARTER_LABELS[id].label)}</strong>
						<small>{t(STARTER_LABELS[id].hint)}</small>
					</button>
				))}
			</div>
			{picked && (
				<button type="button" className="btn primary" onClick={() => onUse(picked)}>
					{t('用這個範本')}
				</button>
			)}
			{picked && narrow && (
				<div className="starter-phone">
					<PhonePreview content={starterPreview(picked, draft.profile.name, t)} inline />
				</div>
			)}
		</>
	)
}

function ItemList({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
	const page = usePage()
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		// On phones a long press starts dragging, so scrolling the list still works.
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)
	const items = page.draft.items
	// An open form would make the row it belongs to jump while dragging.
	const [dragging, setDragging] = useState(false)

	function onDragEnd({ active, over }: DragEndEvent) {
		setDragging(false)
		if (!over || active.id === over.id) return
		page.update((d) => {
			const from = d.items.findIndex((item) => item.id === active.id)
			const to = d.items.findIndex((item) => item.id === over.id)
			if (from >= 0 && to >= 0) d.items = arrayMove(d.items, from, to)
		})
	}

	return (
		<section className="item-card" aria-label={t('頁面上的項目')}>
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={onDragEnd}>
				<SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
					<ol className="item-list">
						{items.map((item, index) => (
							<Fragment key={item.id}>
								<ItemRow
									item={item}
									index={index}
									count={items.length}
									selected={item.id === selected}
									onSelect={() => onSelect(item.id === selected ? null : item.id)}
									onRemove={() => {
										if (selected === item.id) onSelect(null)
									}}
								/>
								{item.id === selected && !dragging && (
									<li className="item-editor" id="item-editor" aria-labelledby="item-editor-title">
										<h2 id="item-editor-title" className="sr-only">
											{t('編輯：{title}', { title: itemTitle(item) })}
										</h2>
										<ItemEditor item={item} />
									</li>
								)}
							</Fragment>
						))}
					</ol>
				</SortableContext>
			</DndContext>
		</section>
	)
}

function ItemRow({
	item,
	index,
	count,
	selected,
	onSelect,
	onRemove,
}: {
	item: Item
	index: number
	count: number
	selected: boolean
	onSelect: () => void
	onRemove: () => void
}) {
	const app = useApp()
	const page = usePage()
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
	const problem = page.problems.some((entry) => entry.path.startsWith(`items.${index}.`))
	const title = itemTitle(item)

	const kind = kindText(item)
	let meta: string = kind.sub
	let isAddress = false
	let scheduled = false
	if (item.kind === 'link') {
		// What a visitor gets: the address itself, or the short link in its place.
		const shown = !item.url ? '' : !item.hideUrl ? item.url : item.slug ? `${app.host}/${item.slug}` : ''
		meta = shown || (item.url ? t('發布時會自動產生短網址') : t('還沒填網址'))
		isAddress = Boolean(shown && !item.startsAt && !item.endsAt)
		scheduled = Boolean(item.startsAt || item.endsAt)
		if (item.startsAt && Date.now() < item.startsAt) meta += ` · ${t('{time} 開放', { time: formatDateTime(item.startsAt) })}`
		else if (item.endsAt) meta += Date.now() >= item.endsAt ? ` · ${t('已過期')}` : ` · ${t('{time} 到期', { time: formatDateTime(item.endsAt) })}`
	}
	const offSchedule = item.kind === 'link' && !isScheduledNow(item)

	const move = (delta: number) =>
		page.update((d) => {
			const target = index + delta
			if (target < 0 || target >= d.items.length) return
			d.items = arrayMove(d.items, index, target)
		})
	const patch = (change: Partial<Item>) =>
		page.update((d) => {
			const target = d.items.find((entry) => entry.id === item.id)
			if (target) Object.assign(target, change)
		})

	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={['item-row', selected && 'selected', isDragging && 'dragging', (item.hidden || offSchedule) && 'dimmed', problem && 'has-problem'].filter(Boolean).join(' ')}
		>
			<button type="button" className="grip" aria-label={t('拖曳排序：{title}', { title })} {...attributes} {...listeners}>
				<Icon name="grip" stroke={3} />
			</button>
			<span className={item.kind === 'link' && item.featured ? 'item-icon featured' : 'item-icon'} aria-hidden="true">
				<Icon name={itemIcon(item)} size={16} />
			</span>
			<button type="button" className="item-pick" aria-pressed={selected} onClick={onSelect}>
				<strong>{title}</strong>
				<span className="mono" dir={isAddress ? 'ltr' : undefined}>
					{meta}
				</span>
			</button>
			<span className="item-tags">
				{problem && <span className="tag danger">{t('要修正')}</span>}
				{item.kind === 'link' && item.featured && <span className="tag">{t('精選')}</span>}
				{scheduled && <span className="tag cyan">{t('排程')}</span>}
				{item.hidden && <span className="tag muted">{t('已隱藏')}</span>}
				{item.kind !== 'link' && <span className="tag outline">{kind.label}</span>}
			</span>
			<span className="item-actions">
				<button type="button" className="icon-btn" aria-label={t('上移')} disabled={index === 0} onClick={() => move(-1)}>
					<Icon name="arrowUp" size={18} />
				</button>
				<button type="button" className="icon-btn" aria-label={t('下移')} disabled={index === count - 1} onClick={() => move(1)}>
					<Icon name="arrowDown" size={18} />
				</button>
				{item.kind === 'link' && (
					<button
						type="button"
						className={item.featured ? 'icon-btn starred' : 'icon-btn'}
						aria-label={t('設為精選')}
						aria-pressed={item.featured}
						onClick={() => patch({ featured: !item.featured })}
					>
						<Icon name="star" size={18} />
					</button>
				)}
				<button
					type="button"
					className="icon-btn visibility"
					aria-label={item.hidden ? t('在頁面上顯示「{title}」', { title }) : t('從頁面隱藏「{title}」', { title })}
					onClick={() => patch({ hidden: !item.hidden })}
				>
					<Icon name={item.hidden ? 'eyeOff' : 'eye'} size={18} />
				</button>
				<ConfirmButton
					label=""
					confirm={t('刪除？')}
					icon="trash"
					className="icon-btn"
					ariaLabel={t('刪除「{title}」', { title })}
					onConfirm={() => {
						onRemove()
						page.update((d) => {
							d.items = d.items.filter((entry) => entry.id !== item.id)
						})
					}}
				/>
			</span>
		</li>
	)
}

function ItemEditor({ item }: { item: Item }) {
	const page = usePage()
	const index = page.draft.items.findIndex((entry) => entry.id === item.id)
	const problems = page.problems.filter((problem) => problem.path.startsWith(`items.${index}.`))
	const invalid = (field: string) => (problems.some((problem) => problem.path === `items.${index}.${field}`) ? (true as const) : undefined)
	const set = (change: Partial<Item>) =>
		page.update((d) => {
			const target = d.items.find((entry) => entry.id === item.id)
			if (target) Object.assign(target, change)
		})

	let editor
	switch (item.kind) {
		case 'link':
			editor = <LinkEditor item={item} set={set} invalid={invalid} />
			break
		case 'heading':
			editor = <HeadingEditor item={item} set={set} invalid={invalid} />
			break
		case 'video':
			editor = <VideoEditor item={item} set={set} invalid={invalid} />
			break
		case 'gallery':
			editor = <GalleryEditor item={item} set={set} invalid={invalid} />
			break
		case 'product':
			editor = <ProductEditor item={item} set={set} invalid={invalid} />
			break
		case 'hours':
			editor = <HoursEditor item={item} set={set} invalid={invalid} />
			break
		case 'embed':
			editor = <EmbedEditor item={item} set={set} invalid={invalid} />
			break
	}
	return (
		<>
			{problems.map((problem) => (
				<p key={problem.path + problem.message} className="form-error" role="alert">
					{problem.message}
				</p>
			))}
			{editor}
			<div className="editor-foot">
				<ConfirmButton
					label={t('刪除這一項')}
					confirm={t('確定刪除')}
					icon="trash"
					onConfirm={() =>
						page.update((d) => {
							d.items = d.items.filter((entry) => entry.id !== item.id)
						})
					}
				/>
			</div>
		</>
	)
}

function SocialSection() {
	const page = usePage()
	const { socials } = page.draft

	function add() {
		const used = new Set(socials.map((social) => social.platform))
		const platform = SOCIAL_PLATFORMS.find((p) => !used.has(p)) ?? 'website'
		page.update((d) => {
			d.socials.push({ id: newId(), platform, url: '' })
		})
	}

	const set = (id: string, patch: { platform?: SocialPlatform; url?: string }) =>
		page.update((d) => {
			const target = d.socials.find((social) => social.id === id)
			if (target) Object.assign(target, patch)
		})

	return (
		<Section
			title={t('社群圖示')}
			action={
				<button type="button" className="btn small" onClick={add} disabled={socials.length >= 12}>
					<Icon name="plus" size={16} />
					{t('新增')}
				</button>
			}
		>
			<p className="hint">{t('一排小圖示，在名稱下方或連結下方。要換位置或整排關掉，請到「外觀」。')}</p>
			{socials.map((social, index) => (
				<div className="social-row" key={social.id}>
					<select
						className="select"
						aria-label={t('平台')}
						value={social.platform}
						onChange={(event) => set(social.id, { platform: event.target.value as SocialPlatform })}
					>
						{SOCIAL_PLATFORMS.map((platform) => (
							<option key={platform} value={platform}>
								{t(SOCIAL_META[platform].label)}
							</option>
						))}
					</select>
					<input
						className="input mono"
						aria-label={t('{platform} 網址', { platform: t(SOCIAL_META[social.platform].label) })}
						aria-invalid={page.problems.some((problem) => problem.path === `socials.${index}.url`) || undefined}
						value={social.url}
						placeholder={t(SOCIAL_META[social.platform].placeholder)}
						onChange={(event) => set(social.id, { url: event.target.value })}
					/>
					<button
						type="button"
						className="icon-btn"
						aria-label={t('移除這個圖示')}
						onClick={() =>
							page.update((d) => {
								d.socials = d.socials.filter((item) => item.id !== social.id)
							})
						}
					>
						<Icon name="trash" size={16} />
					</button>
				</div>
			))}
			{socials.length > 0 && (
				<div className="section-row">
					<div>
						<p className="section-title">{t('計算社群圖示的點擊')}</p>
						<p className="hint" style={{ marginTop: 4 }}>{t('開啟後，圖示的點擊也會算進數據。每次點擊會多用一點免費額度，Email 圖示不計。')}</p>
					</div>
					<Toggle
						on={Boolean(page.draft.countSocials)}
						onChange={(on) =>
							page.update((d) => {
								d.countSocials = on
							})
						}
						label={t('計算社群圖示的點擊')}
					/>
				</div>
			)}
			<div className="section-row">
				<div>
					<p className="section-title">{t('右下角 LINE 按鈕')}</p>
					<p className="hint" style={{ marginTop: 4 }}>{t('固定在頁面右下角，訪客一點就能加你的 LINE。')}</p>
				</div>
				<Toggle
					on={page.draft.lineButton !== undefined}
					onChange={(on) =>
						page.update((d) => {
							if (on) d.lineButton = d.socials.find((social) => social.platform === 'line')?.url ?? ''
							else delete d.lineButton
						})
					}
					label={t('右下角 LINE 按鈕')}
				/>
			</div>
			{page.draft.lineButton !== undefined && (
				<input
					className="input mono"
					aria-label={t('{platform} 網址', { platform: 'LINE' })}
					aria-invalid={page.problems.some((problem) => problem.path === 'lineButton') || undefined}
					value={page.draft.lineButton}
					placeholder={t(SOCIAL_META.line.placeholder)}
					onChange={(event) =>
						page.update((d) => {
							d.lineButton = event.target.value
						})
					}
				/>
			)}
			<EmbedButtonRow />
		</Section>
	)
}

/** The button floating at the bottom right that opens a service's panel, like an embed card's button. */
function EmbedButtonRow() {
	const page = usePage()
	const button = page.draft.embedButton
	// Brand names, the same in every language.
	const services = EMBED_PROVIDERS.map((provider) => EMBEDS[provider].name).join(' / ')
	const set = (patch: Partial<NonNullable<typeof button>>) =>
		page.update((d) => {
			if (d.embedButton) Object.assign(d.embedButton, patch)
		})
	return (
		<>
			<div className="section-row">
				<div>
					<p className="section-title">{t('右下角 {services} 按鈕', { services })}</p>
					<p className="hint" style={{ marginTop: 4 }}>{t('固定在頁面右下角，訪客一點就會在你的頁面上打開它。')}</p>
				</div>
				<Toggle
					on={button !== undefined}
					onChange={(on) =>
						page.update((d) => {
							// An embed card on the page already says which service and account.
							const card = d.items.find((item): item is EmbedItem => item.kind === 'embed')
							if (on) d.embedButton = card ? { provider: card.provider, account: card.account } : { provider: EMBED_PROVIDERS[0], account: '' }
							else delete d.embedButton
						})
					}
					label={t('右下角 {services} 按鈕', { services })}
				/>
			</div>
			{button && (
				<div className="embed-row">
					<select className="select" aria-label={t('服務')} value={button.provider} onChange={(event) => set({ provider: event.target.value as EmbedProvider })}>
						{EMBED_PROVIDERS.map((provider) => (
							<option key={provider} value={provider}>
								{EMBEDS[provider].name}
							</option>
						))}
					</select>
					<EmbedAccountField
						id="embed-button-account"
						provider={button.provider}
						value={button.account}
						invalid={page.problems.some((problem) => problem.path.startsWith('embedButton')) || undefined}
						onChange={(account) => set({ account })}
					/>
				</div>
			)}
		</>
	)
}
