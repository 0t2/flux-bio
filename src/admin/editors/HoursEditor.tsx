import { useEffect, useState } from 'react'
import type { HoursItem, Opening } from '../../shared/content'
import { openStatus, statusText } from '../../shared/hours'
import { Icon } from '../components/Icon'
import { Toggle } from '../components/ui'
import { language, msg, t } from '../i18n'
import { zoneLabel } from '../lib/format'
import { useApp } from '../state/app'
import type { EditorProps } from './types'

const DAYS = [msg('週一'), msg('週二'), msg('週三'), msg('週四'), msg('週五'), msg('週六'), msg('週日')]

export function HoursEditor({ item, set, invalid }: EditorProps<HoursItem>) {
	const app = useApp()
	const zone = app.settings.timezone
	const [now, setNow] = useState(Date.now())
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000)
		return () => window.clearInterval(timer)
	}, [])
	const open = openStatus(item.week, zone, now)
	const status = statusText(open, language())
	const id = (name: string) => `item-${item.id}-${name}`

	const setDay = (day: number, openings: Opening[]) => set({ week: item.week.map((entry, i) => (i === day ? openings : entry)) })
	const firstOpen = item.week.find((day) => day.length > 0)

	return (
		<>
			<div className="field">
				<label htmlFor={id('title')}>{t('標題')}</label>
				<input id={id('title')} className="input" maxLength={60} value={item.title} onChange={(event) => set({ title: event.target.value })} />
			</div>
			<p className="hours-now" role="status">
				<span className={open.open ? 'dot' : 'dot off'} aria-hidden="true" />
				{t('依{zone}，訪客現在會看到「{status}」', { zone: zoneLabel(zone, now), status: status.detail ? `${status.label}・${status.detail}` : status.label })}
			</p>
			<fieldset className="week">
				<legend className="label">{t('每週營業時間')}</legend>
				{item.week.map((openings, day) => (
					<div key={DAYS[day]} className={invalid(`week.${day}`) ? 'week-row has-problem' : 'week-row'}>
						<span className="week-day">{t(DAYS[day]!)}</span>
						<Toggle
							on={openings.length > 0}
							label={t('{day}有營業', { day: t(DAYS[day]!) })}
							onChange={(on) => setDay(day, on ? (firstOpen?.map((opening) => ({ ...opening })) ?? [{ open: '10:00', close: '18:00' }]) : [])}
						/>
						{openings.length === 0 ? (
							<span className="hint">{t('公休')}</span>
						) : (
							<span className="week-ranges">
								{openings.map((opening, index) => (
									<span key={index} className="week-range">
										<input
											className="input time"
											type="time"
											aria-label={t('{day}第 {number} 段開門時間', { day: t(DAYS[day]!), number: index + 1 })}
											value={opening.open}
											onChange={(event) => event.target.value && setDay(day, openings.map((o, i) => (i === index ? { ...o, open: event.target.value } : o)))}
										/>
										<span aria-hidden="true">–</span>
										<input
											className="input time"
											type="time"
											aria-label={t('{day}第 {number} 段打烊時間', { day: t(DAYS[day]!), number: index + 1 })}
											value={opening.close === '24:00' ? '00:00' : opening.close}
											onChange={(event) => event.target.value && setDay(day, openings.map((o, i) => (i === index ? { ...o, close: event.target.value } : o)))}
										/>
										{index > 0 && (
											<button type="button" className="icon-btn" aria-label={t('移除{day}第 {number} 段', { day: t(DAYS[day]!), number: index + 1 })} onClick={() => setDay(day, openings.filter((_, i) => i !== index))}>
												<Icon name="close" size={16} />
											</button>
										)}
									</span>
								))}
								{openings.length < 2 && (
									<button type="button" className="btn small" onClick={() => setDay(day, [...openings, { open: '17:00', close: '21:00' }])}>
										{t('加一段')}
									</button>
								)}
							</span>
						)}
					</div>
				))}
				<p className="hint">{t('打烊時間早於開門時間，代表營業到隔天，例如 18:00–02:00。')}</p>
			</fieldset>
			<div className="field">
				<label htmlFor={id('note')}>{t('備註（選填）')}</label>
				<input id={id('note')} className="input" maxLength={120} value={item.note} onChange={(event) => set({ note: event.target.value })} placeholder={t('例如：國定假日照常營業')} />
			</div>
			<div className="field">
				<label htmlFor={id('address')}>{t('地址')}</label>
				<input id={id('address')} className="input" maxLength={200} value={item.address} onChange={(event) => set({ address: event.target.value })} placeholder={t('會產生「Google 地圖導航」按鈕')} />
			</div>
			<div className="field-row">
				<div className="field">
					<label htmlFor={id('phone')}>{t('電話（選填）')}</label>
					<input id={id('phone')} className="input mono" type="tel" maxLength={40} value={item.phone} onChange={(event) => set({ phone: event.target.value })} placeholder="07-123 4567" />
				</div>
				<div className="field">
					<span className="label">{t('顯示地圖')}</span>
					<span className="inline-toggle">
						<Toggle on={item.showMap} onChange={(showMap) => set({ showMap })} label={t('顯示地圖')} disabled={!item.address.trim()} />
						{t('訪客點了才會載入 Google 地圖')}
					</span>
				</div>
			</div>
		</>
	)
}
