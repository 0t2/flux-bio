/** The dashboard's languages, each named in itself. */
export const LANGUAGES = [
	{ code: 'zh-TW', name: '繁體中文' },
	{ code: 'zh-CN', name: '简体中文' },
	{ code: 'en', name: 'English' },
	{ code: 'ja', name: '日本語' },
	{ code: 'ko', name: '한국어' },
	{ code: 'es', name: 'Español' },
	{ code: 'pt-BR', name: 'Português (Brasil)' },
	{ code: 'fr', name: 'Français' },
	{ code: 'de', name: 'Deutsch' },
	{ code: 'id', name: 'Bahasa Indonesia' },
	{ code: 'th', name: 'ไทย' },
	{ code: 'vi', name: 'Tiếng Việt' },
	{ code: 'ar', name: 'العربية' },
] as const
export type Language = (typeof LANGUAGES)[number]['code']
