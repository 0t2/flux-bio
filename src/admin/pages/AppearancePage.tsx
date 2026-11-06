import { useState } from 'react'
import { appearanceFromPreset, defaultAppearance, THEME_IDS, type Appearance, type ThemeId, type ThemePreset } from '../../shared/content'
import type { CommunityTheme } from '../../shared/community'
import { SOCIAL_META } from '../../templates/icons'
import { resolveAppearance, THEME_LIST, THEMES } from '../../templates/themes'
import list from '../../../themes/community.json'
import { AskAi } from '../components/AskAi'
import { MiniBio, sampleOf } from '../components/MiniBio'
import { FontHosting } from '../editors/FontHosting'
import { PageLanguages } from '../editors/PageLanguages'
import { Dialog, Section, Segmented, Toggle } from '../components/ui'
import { t } from '../i18n'
import { usePreviewFonts } from '../lib/fontPreview'
import { usePage } from '../state/page'

/** Each theme's color sets. The first is the theme's own. */
const COLOR_SETS = Object.fromEntries(
	THEME_IDS.map((id) => [id, (list.themes as CommunityTheme[]).filter((theme) => theme.base === id)]),
) as Record<ThemeId, CommunityTheme[]>

/** The color set a page is in, or null when its look was made through the API: other colors, fonts, pictures or CSS. */
function colorSetOf(appearance: Appearance): CommunityTheme | null {
	if (appearance.font !== 'auto' || appearance.headFont || appearance.bodyFont || appearance.button !== 'auto' || appearance.bgImage || appearance.css) return null
	const look = resolveAppearance(appearance)
	return (
		COLOR_SETS[appearance.theme]?.find(
			(set) => set.bg === look.theme.bg && set.fg === look.theme.fg && set.accent === look.accent && set.accent2 === look.vars['--accent2'],
		) ?? null
	)
}

/** The look in a few words, shown above the preview. */
export function appearanceSummary(appearance: Appearance): string {
	const name = colorSetOf(appearance)?.name ?? t('AI 做的外觀')
	return `${t(THEMES[appearance.theme].label)} · ${name}`
}

export function AppearancePanel() {
	const { draft, update } = usePage()
	const appearance = draft.appearance
	const set = colorSetOf(appearance)
	const sample = sampleOf(draft)
	const looks = THEME_LIST.map((theme) => resolveAppearance({ ...defaultAppearance(), theme: theme.id }))
	usePreviewFonts(
		looks.flatMap((look) => (look.theme.head ? [look.theme.head.family] : [])),
		sample.name || t('我的名字'),
	)

	const setAppearance = (patch: Partial<Appearance>) =>
		update((d) => {
			Object.assign(d.appearance, patch)
		})
	// CSS an AI wrote can't be made again here, so taking it away is asked about first.
	const [asking, setAsking] = useState<ThemePreset | null>(null)
	const apply = (preset: ThemePreset) => setAppearance(appearanceFromPreset(preset, appearance))
	const pick = (preset: ThemePreset) => (appearance.css && !preset.css ? setAsking(preset) : apply(preset))

	return (
		<>
			<Section title={t('主題')}>
				<div className="option-grid themes">
					{looks.map((look) => (
						<button
							key={look.theme.id}
							type="button"
							className="option theme"
							aria-pressed={look.theme.id === appearance.theme}
							onClick={() => {
								const first = COLOR_SETS[look.theme.id][0]
								if (first) pick(first)
							}}
						>
							<MiniBio look={look} {...sample} />
							<span className="option-label">
								{t(look.theme.label)}
								<small>{look.theme.en}</small>
							</span>
						</button>
					))}
				</div>
			</Section>

			<Section title={t('配色')}>
				{!set && <p className="hint">{t('這一頁用的是 AI 做的外觀。選一組配色就會換回主題原本的樣子。')}</p>}
				<div className="color-sets" role="group" aria-label={t('配色')}>
					{COLOR_SETS[appearance.theme]?.map((option) => (
						<button key={option.id} type="button" className="color-set" aria-pressed={set?.id === option.id} onClick={() => pick(option)}>
							<span aria-hidden="true" style={{ background: option.bg }}>
								<i style={{ background: option.accent }} />
							</span>
							{option.name}
						</button>
					))}
				</div>
				<AskAi say={t('把我的頁面做成這張圖的樣子')} />
				<Dialog
					open={asking !== null}
					title={t('要拿掉 AI 寫的樣式嗎？')}
					onClose={() => setAsking(null)}
					actions={
						<>
							<button type="button" className="btn" onClick={() => setAsking(null)}>
								{t('取消')}
							</button>
							<button
								type="button"
								className="btn danger"
								onClick={() => {
									if (asking) apply(asking)
									setAsking(null)
								}}
							>
								{t('還是要換')}
							</button>
						</>
					}
				>
					<p>{t('換了以後，AI 為這一頁寫的樣式會拿掉。發布過的版本還在發布紀錄裡，也可以再請 AI 做。')}</p>
				</Dialog>
			</Section>

			<Section title={t('字型')}>
				<FontHosting />
				<AskAi say={t('把標題換成 Google Fonts 的 Playfair Display 字型')} />
			</Section>

			<section className="section" aria-label={t('社群圖示')}>
				<div className="section-row">
					<div>
						<p className="section-title">{t('顯示社群圖示')}</p>
						<p className="hint" style={{ marginTop: 4 }}>
							{draft.socials.length ? draft.socials.map((s) => t(SOCIAL_META[s.platform].label)).join('、') : t('目前還沒有社群圖示，可以到「內容」新增')}
						</p>
					</div>
					<Toggle on={appearance.showSocial} onChange={(showSocial) => setAppearance({ showSocial })} label={t('顯示社群圖示')} />
				</div>
				{appearance.showSocial && (
					<div className="field">
						<span className="label">{t('社群圖示的位置')}</span>
						<Segmented
							label={t('社群圖示的位置')}
							options={[
								{ value: 'top', label: t('連結上方') },
								{ value: 'bottom', label: t('連結下方') },
							]}
							value={appearance.socialPlace}
							onChange={(socialPlace) => setAppearance({ socialPlace })}
						/>
					</div>
				)}
			</section>

			<section className="section" aria-label={t('顯示「用 ♥️ 和 FluxBio 打造」')}>
				<div className="section-row">
					<p className="section-title">{t('顯示「用 ♥️ 和 FluxBio 打造」')}</p>
					<Toggle
						on={draft.showBadge}
						onChange={(showBadge) =>
							update((d) => {
								d.showBadge = showBadge
							})
						}
						label={t('顯示「用 ♥️ 和 FluxBio 打造」')}
					/>
				</div>
			</section>

			<PageLanguages />
		</>
	)
}
