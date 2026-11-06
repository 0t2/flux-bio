import { useEffect, useRef, useState } from 'react'
import { normalizeSlug, slugProblem, SLUG_PROBLEM_TEXT } from '../../shared/slug'
import { initials } from '../../templates/render'
import { Icon } from '../components/Icon'
import { Section, toast, Toggle } from '../components/ui'
import { t } from '../i18n'
import { uploadImage } from '../lib/image'
import { errorText } from '../pages/settings/util'
import { useApp } from '../state/app'
import { usePage } from '../state/page'
import '../styles/settings.css'

const BIO_LIMIT = 80

/** The top of the page being edited: avatar, address, name and bio. */
export function ProfileSection() {
	return (
		<Section title={t('個人資料')}>
			<AvatarField />
			<CoverField />
			<div className="set-grid">
				<HandleField />
				<NameField />
			</div>
			<ShowNameField />
			<BioField />
		</Section>
	)
}

function AvatarField() {
	const { draft, update } = usePage()
	const input = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const { avatar, name } = draft.profile

	async function upload(file: File | undefined) {
		if (input.current) input.current.value = ''
		if (!file) return
		setUploading(true)
		setError(null)
		try {
			const id = await uploadImage(file, { maxWidth: 800, maxHeight: 800, square: true })
			update((d) => {
				d.profile.avatar = id
			})
		} catch (caught) {
			setError(errorText(caught, t('讀不到這張圖片，請換一張試試')))
		} finally {
			setUploading(false)
		}
	}

	return (
		<div className="set-avatar-field">
			<div className="avatar-row">
				<span className={avatar ? 'avatar-box' : 'avatar-box set-initials'} aria-hidden="true">
					{avatar ? <img src={`/media/${avatar}`} alt="" /> : initials(name) || '?'}
				</span>
				<div className="set-actions">
					<button type="button" className="btn small" aria-disabled={uploading || undefined} onClick={() => !uploading && input.current?.click()}>
						<Icon name="upload" size={16} />
						{uploading ? t('上傳中…') : avatar ? t('換一張頭像') : t('上傳頭像')}
					</button>
					{avatar && (
						<button
							type="button"
							className="btn small set-quiet"
							onClick={() =>
								update((d) => {
									d.profile.avatar = null
								})
							}
						>
							{t('移除')}
						</button>
					)}
				</div>
				<input ref={input} type="file" accept="image/*" hidden onChange={(event) => void upload(event.target.files?.[0])} />
			</div>
			{error && (
				<p className="set-error" role="alert">
					{error}
				</p>
			)}
		</div>
	)
}

/** The large picture near the top of the page. Each theme places it its own way. */
function CoverField() {
	const { draft, update } = usePage()
	const input = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const cover = draft.appearance.coverImage

	async function upload(file: File | undefined) {
		if (input.current) input.current.value = ''
		if (!file) return
		setUploading(true)
		setError(null)
		try {
			const id = await uploadImage(file, { maxWidth: 1600, maxHeight: 1200 })
			update((d) => {
				d.appearance.coverImage = id
			})
		} catch (caught) {
			setError(errorText(caught, t('讀不到這張圖片，請換一張試試')))
		} finally {
			setUploading(false)
		}
	}

	return (
		<div className="field">
			<p className="label">{t('封面照片')}</p>
			{cover && <img className="set-cover" src={`/media/${cover}`} alt="" />}
			<div className="set-actions">
				<button type="button" className="btn small" aria-disabled={uploading || undefined} onClick={() => !uploading && input.current?.click()}>
					<Icon name="upload" size={16} />
					{uploading ? t('上傳中…') : cover ? t('換一張封面') : t('上傳封面照片')}
				</button>
				{cover && (
					<button
						type="button"
						className="btn small set-quiet"
						onClick={() =>
							update((d) => {
								d.appearance.coverImage = null
							})
						}
					>
						{t('移除')}
					</button>
				)}
			</div>
			<input ref={input} type="file" accept="image/*" hidden onChange={(event) => void upload(event.target.files?.[0])} />
			{error ? (
				<p className="set-error" role="alert">
					{error}
				</p>
			) : (
				<p className="hint">{t('頁面上的大圖，有些主題會把它當成整頁背景。')}</p>
			)}
		</div>
	)
}

/** Saved on blur or Enter; the address changes right away. */
function HandleField() {
	const app = useApp()
	const page = usePage()
	const [value, setValue] = useState(page.handle)
	const [error, setError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	// Leaving the field after a failed Enter shouldn't send the same name again.
	const tried = useRef<string | null>(null)

	useEffect(() => {
		setValue(page.handle)
	}, [page.handle])

	async function commit(fromBlur: boolean) {
		const handle = normalizeSlug(value)
		if (handle === page.handle) {
			setValue(page.handle)
			setError(null)
			return
		}
		if (saving || (fromBlur && handle === tried.current)) return
		const problem = slugProblem(handle)
		if (problem) {
			setError(t(SLUG_PROBLEM_TEXT[problem]))
			return
		}
		tried.current = handle
		setSaving(true)
		try {
			await page.rename(handle)
			setError(null)
			toast(t('網址改成 {address}', { address: `${app.host}/${handle}` }))
		} catch (caught) {
			setError(errorText(caught, t('網址沒有改成功，請再試一次')))
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="field">
			<label htmlFor="set-handle">{t('網址代稱')}</label>
			<div className="prefixed">
				<span>{app.host}/</span>
				<input
					id="set-handle"
					value={value}
					maxLength={64}
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					aria-invalid={error ? true : undefined}
					aria-describedby="set-handle-note"
					onChange={(event) => {
						setValue(event.target.value)
						tried.current = null
						setError(null)
					}}
					onBlur={() => void commit(true)}
					onKeyDown={(event) => {
						// Enter also confirms a Chinese IME composition; that one isn't a save.
						if (event.nativeEvent.isComposing || event.keyCode === 229) return
						if (event.key === 'Enter') {
							event.preventDefault()
							void commit(false)
						} else if (event.key === 'Escape') {
							setValue(page.handle)
							setError(null)
						}
					}}
				/>
			</div>
			<p id="set-handle-note" className={error ? 'set-error' : 'hint'} role={error ? 'alert' : undefined}>
				{error ?? (saving ? t('儲存中…') : t('改了馬上生效，舊的網址會失效。'))}
			</p>
		</div>
	)
}

function NameField() {
	const { draft, update } = usePage()
	return (
		<div className="field">
			<label htmlFor="set-name">{t('顯示名稱')}</label>
			<input
				id="set-name"
				className="input"
				maxLength={60}
				value={draft.profile.name}
				onChange={(event) => {
					const name = event.target.value
					update((d) => {
						d.profile.name = name
					})
				}}
			/>
		</div>
	)
}

/** Off, the name is out of sight but still the page's heading: for an avatar that is a logo with the name in it. */
function ShowNameField() {
	const { draft, update } = usePage()
	return (
		<div className="field">
			<span className="label">{t('在頁面上顯示名稱')}</span>
			<span className="inline-toggle">
				<Toggle
					on={draft.appearance.showName}
					onChange={(showName) =>
						update((d) => {
							d.appearance.showName = showName
						})
					}
					label={t('在頁面上顯示名稱')}
				/>
				{t('頭像就是寫著名稱的 logo 時可以關掉。關掉後只是看不到，螢幕閱讀器和搜尋引擎還是讀得到。')}
			</span>
		</div>
	)
}

function BioField() {
	const { draft, update } = usePage()
	const bio = draft.profile.bio
	return (
		<div className="field">
			<label htmlFor="set-bio">{t('簡介')}</label>
			<textarea
				id="set-bio"
				className="textarea"
				rows={3}
				maxLength={BIO_LIMIT}
				value={bio}
				aria-describedby="set-bio-count"
				onChange={(event) => {
					const next = event.target.value
					update((d) => {
						d.profile.bio = next
					})
				}}
			/>
			<span id="set-bio-count" className={bio.length > BIO_LIMIT ? 'set-count over' : 'set-count'}>
				{t('{count} / {limit} 字', { count: bio.length, limit: BIO_LIMIT })}
			</span>
		</div>
	)
}
