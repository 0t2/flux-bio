import type { Settings } from '../../../shared/content'
import { otherLanguages } from '../../../shared/locale'
import { isValidTimeZone } from '../../../shared/time'
import { msg } from '../../../templates/msg'
import { ApiError } from '../../types'
import { changeSettings, forgetPublicNames, loadSettingsWith, pageExists } from '../db'
import { KV_OPS_AT_ONCE } from '../mode'
import { optionalUrl } from './kv'
import { COPIES_OWED, owedBy, owedNote, owedTogether, refreshFonts, switchBio, tellKv } from './owed'

/** "https://Links.Example.com/x" → "links.example.com"; "" stays "". */
export function normalizeDomain(value: string): string {
	const trimmed = value.trim().toLowerCase()
	if (!trimmed) return ''
	try {
		return new URL(/^[a-z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).hostname
	} catch {
		throw new ApiError(400, 'invalid', msg('網域格式不正確'))
	}
}

/** What a request asks to change in the settings. Whatever it leaves out stays as it is now, not as it was when the request began. */
export type SettingsPatch = Partial<Settings>

export async function updateSettings(env: Env, patch: SettingsPatch): Promise<{ settings: Settings; copiesLeft: boolean }> {
	const db = env.DB
	if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) throw new ApiError(400, 'invalid', msg('時區格式不正確'))
	if (patch.home && !(await pageExists(db, patch.home))) throw new ApiError(400, 'invalid', msg('找不到要放在首頁的頁面'))
	const domain = patch.domain === undefined ? undefined : normalizeDomain(patch.domain)
	const homeUrl = patch.homeUrl === undefined ? undefined : (optionalUrl(patch.homeUrl, msg('首頁轉址')) ?? '')
	const change = (current: Settings): Settings => {
		const asked = { ...current, ...(Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as SettingsPatch) }
		return { ...asked, languages: otherLanguages(asked.locale, patch.languages ?? current.languages), domain: domain ?? current.domain, homeUrl: homeUrl ?? current.homeUrl }
	}

	// What the change will owe KV is noted before D1 has the change, from the settings as they are read now: if
	// anything stops this request after D1 has it, the note is there, and the same request sent again finishes it.
	// Another request saving in between only makes the note say too much, which costs a write or two and no more.
	const { settings: seen, other: noted } = await loadSettingsWith(db, COPIES_OWED)
	const note = owedNote(db, noted)
	const before = note.owed()
	let owed = await note.keep(owedTogether(before, owedBy(seen, change(seen))))

	// From the settings as they are at this moment: another request may have saved since this one started.
	const { previous, next } = await changeSettings(db, change)
	forgetPublicNames()
	owed = await note.keep(owedTogether(owed, owedBy(previous, next)))
	const bioChanged = previous.bio !== next.bio
	// Every snapshot carries the languages and whether fonts are copied, so each has to go. Dropping one takes no
	// parsing and no D1 read per page, and the page's next visit rebuilds it from D1, so pages nobody visits never
	// cost a write.
	const everyPage = previous.locale !== next.locale || previous.languages.join() !== next.languages.join() || previous.hostFonts !== next.hostFonts
	// One request may start so many KV operations (KV_OPS_AT_ONCE), whatever it has to do: what doesn't fit stays owed.
	let budget = KV_OPS_AT_ONCE
	if (bioChanged) {
		const switched = await switchBio(env, previous, next, budget).catch(async (error: unknown) => {
			// Refused, and put back. KV may hold half of it, which the note has to go on saying, looked at afresh:
			// another request may have taken the same note out. Pages are on again, so their copies are owed only
			// what they were before this.
			await note.keep({ ...owed, after: before.after }, true).catch((failed: unknown) => console.error('Could not note what KV is owed', failed))
			throw error
		})
		budget -= switched.used
		// Going off: the "site" record says so, and the pages past this slice are owed, from where it stopped. Coming
		// back: copies an unfinished switch left are from before whatever changed while pages were off, so all go.
		owed = { ...owed, site: false, pages: [], after: next.bio ? (owed.after !== null ? '' : null) : switched.after }
	}
	// Another language with its own built-in text, or copying fonts turned on or off: published pages' fonts change.
	const fonts = everyPage ? await refreshFonts(env, previous, next) : { written: 0, aside: false }
	budget = Math.max(0, budget - fonts.written)
	// Lists set aside just now are for a later call: a publish going on at this moment may still write one back.
	if (fonts.aside) owed = { ...owed, fonts: true }

	let copiesLeft = false
	let refused: unknown
	try {
		;({ owed, copiesLeft, refused, budget } = await tellKv(env, owed, budget, { fontsLater: fonts.aside }))
	} finally {
		// If this can't be saved, what was noted before KV was told still stands, and says at least as much.
		await note.keep(owed, true).catch((error: unknown) => console.error('Could not note what KV is owed', error))
	}
	if (refused) {
		// D1 has the change and KV doesn't. Said as an error, so that whoever saved it, the dashboard too, is told
		// that visitors don't see it yet; what is owed is noted, and saving again sends it.
		console.error('KV kept a copy after a settings change', refused)
		throw new ApiError(503, 'kv', msg('已經儲存，但 Cloudflare KV 暫時寫不進去，訪客還看不到這次的修改。請稍後再儲存一次。'))
	}
	return { settings: next, copiesLeft }
}
