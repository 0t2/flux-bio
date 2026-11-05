import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import type { IconName } from '../../templates/icons'
import { t } from '../i18n'
import { copyText } from '../lib/format'
import { Icon } from './Icon'

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
	return (
		<button type="button" className="toggle" aria-pressed={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
			<span className="track" aria-hidden="true">
				<span className="knob" />
			</span>
		</button>
	)
}

/**
 * For a switch whose change goes over the network: it moves when pressed, and goes back if saving fails. Presses made while one
 * is saving wait and only the last counts, so changes can't arrive out of order, and changing your mind doesn't cost extra writes.
 */
export function useSavedSwitch(saved: boolean, save: (next: boolean) => Promise<boolean>, onSaved: () => void): [boolean, (next: boolean) => void] {
	const [shown, setShown] = useState(saved)
	const wanted = useRef(saved)
	const known = useRef(saved)
	const sending = useRef(false)

	useEffect(() => {
		if (sending.current) return
		wanted.current = known.current = saved
		setShown(saved)
	}, [saved])

	async function send() {
		sending.current = true
		let changed = false
		while (wanted.current !== known.current) {
			const next = wanted.current
			if (await save(next)) {
				known.current = next
				changed = true
			} else {
				wanted.current = known.current
				setShown(known.current)
			}
		}
		sending.current = false
		if (changed) onSaved()
	}

	return [
		shown,
		(next) => {
			wanted.current = next
			setShown(next)
			if (!sending.current) void send()
		},
	]
}

export function Section({ title, action, children, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
	return (
		<section className="section" id={id}>
			{(title || action) && (
				<div className="section-row">
					{title && <h2 className="section-title">{title}</h2>}
					{action}
				</div>
			)}
			{children}
		</section>
	)
}

/** Whether a media query matches now, and it follows changes. */
export function useMedia(query: string): boolean {
	const [matches, setMatches] = useState(() => matchMedia(query).matches)
	useEffect(() => {
		const list = matchMedia(query)
		const update = () => setMatches(list.matches)
		update()
		list.addEventListener('change', update)
		return () => list.removeEventListener('change', update)
	}, [query])
	return matches
}

/** Tabs that are links: each tab is its own address, so it survives a reload and the back button. */
export function LinkTabs({ items, label }: { items: { href: string; label: string }[]; label: string }) {
	const [location] = useLocation()
	return (
		<nav className="link-tabs" aria-label={label}>
			{items.map((item) => (
				<Link key={item.href} href={item.href} className="link-tab" aria-current={location === item.href ? 'page' : undefined}>
					{item.label}
				</Link>
			))}
		</nav>
	)
}

/** A row of mutually exclusive buttons, e.g. 7 / 30 / 90 天. */
export function Segmented<T extends string | number>({
	options,
	value,
	onChange,
	label,
}: {
	options: readonly { value: T; label: string }[]
	value: T
	onChange: (value: T) => void
	label: string
}) {
	return (
		<div className="tabs" role="group" aria-label={label}>
			{options.map((option) => (
				<button key={String(option.value)} type="button" className="tab" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
					{option.label}
				</button>
			))}
		</div>
	)
}

/** A modal built on <dialog>, so focus trapping and Escape come from the browser. */
export function Dialog({
	open,
	title,
	onClose,
	children,
	actions,
	wide,
}: {
	open: boolean
	title: string
	onClose: () => void
	children: ReactNode
	actions?: ReactNode
	wide?: boolean
}) {
	const ref = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	useEffect(() => {
		const dialog = ref.current
		if (!dialog) return
		if (open && !dialog.open) dialog.showModal()
		if (!open && dialog.open) dialog.close()
	}, [open])
	return (
		<dialog
			ref={ref}
			className={wide ? 'dialog wide' : 'dialog'}
			aria-labelledby={titleId}
			onClose={onClose}
			onClick={(event) => {
				// A click on the backdrop lands on the <dialog> itself.
				if (event.target === ref.current) onClose()
			}}
		>
			{open && (
				<div className="dialog-body">
					<div className="section-row">
						<h2 id={titleId} className="dialog-title">
							{title}
						</h2>
						<button type="button" className="icon-btn" aria-label={t('關閉')} onClick={onClose}>
							<Icon name="close" size={18} />
						</button>
					</div>
					{children}
					{actions && <div className="dialog-actions">{actions}</div>}
				</div>
			)}
		</dialog>
	)
}

/** A button with a panel that opens under it and closes on Escape or a click outside. */
export function Popover({
	button,
	label,
	children,
	align = 'start',
}: {
	button: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode
	label: string
	children: (close: () => void) => ReactNode
	align?: 'start' | 'end'
}) {
	const [open, setOpen] = useState(false)
	const root = useRef<HTMLDivElement>(null)
	const id = useId()
	useEffect(() => {
		if (!open) return
		const onDown = (event: PointerEvent) => {
			if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('pointerdown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('pointerdown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])
	return (
		<div className="popover-root" ref={root}>
			{button({ open, toggle: () => setOpen((value) => !value), id })}
			{open && (
				<div className={`popover ${align}`} id={id} role="dialog" aria-label={label}>
					{children(() => setOpen(false))}
				</div>
			)}
		</div>
	)
}

export function CopyButton({
	text,
	label,
	done,
	className = 'btn small',
	icon = true,
	ariaLabel,
}: {
	text: string
	label?: string
	done?: string
	className?: string
	icon?: boolean
	ariaLabel?: string
}) {
	const [copied, setCopied] = useState(false)
	useEffect(() => {
		if (!copied) return
		const timer = window.setTimeout(() => setCopied(false), 1800)
		return () => window.clearTimeout(timer)
	}, [copied])
	return (
		<button
			type="button"
			className={className}
			aria-label={ariaLabel}
			onClick={async () => {
				if (await copyText(text)) setCopied(true)
				else toast(t('無法複製，請手動選取'))
			}}
		>
			{icon && <Icon name={copied ? 'check' : 'copy'} size={16} stroke={2} />}
			{copied ? (done ?? t('已複製')) : (label ?? t('複製'))}
		</button>
	)
}

/** Asks once more before doing something that can't be undone. */
export function ConfirmButton({
	label,
	confirm,
	onConfirm,
	icon,
	className = 'btn small',
	disabled,
	ariaLabel,
}: {
	label: string
	confirm: string
	onConfirm: () => void
	icon?: IconName
	className?: string
	disabled?: boolean
	/** For icon-only buttons. */
	ariaLabel?: string
}) {
	const [asking, setAsking] = useState(false)
	useEffect(() => {
		if (!asking) return
		const timer = window.setTimeout(() => setAsking(false), 4000)
		return () => window.clearTimeout(timer)
	}, [asking])
	return asking ? (
		<button
			type="button"
			className={`${className} danger`}
			onClick={() => {
				setAsking(false)
				onConfirm()
			}}
		>
			{confirm}
		</button>
	) : (
		<button type="button" className={className} disabled={disabled} aria-label={ariaLabel} onClick={() => setAsking(true)}>
			{icon && <Icon name={icon} size={16} />}
			{label}
		</button>
	)
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
	return (
		<div className="empty-state">
			<span className="empty-icon" aria-hidden="true">
				<Icon name={icon} size={26} />
			</span>
			<h2>{title}</h2>
			{children}
		</div>
	)
}

/** "← 短網址 / lens / QR Code" above a page title. */
export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
	return (
		<nav className="breadcrumb" aria-label={t('位置')}>
			{items.map((item, i) => (
				<span key={`${item.label}-${i}`}>
					{i > 0 && <span aria-hidden="true">/</span>}
					{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
				</span>
			))}
		</nav>
	)
}

type ToastListener = (message: string) => void
const listeners = new Set<ToastListener>()

/** Shows a short message at the bottom of the screen. */
export function toast(message: string): void {
	for (const listener of listeners) listener(message)
}

export function ToastHost() {
	const [message, setMessage] = useState<string | null>(null)
	useEffect(() => {
		let timer = 0
		const listener: ToastListener = (next) => {
			setMessage(next)
			window.clearTimeout(timer)
			timer = window.setTimeout(() => setMessage(null), 2400)
		}
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
			window.clearTimeout(timer)
		}
	}, [])
	if (!message) return null
	return (
		<div className="toast" role="status">
			{message}
		</div>
	)
}
