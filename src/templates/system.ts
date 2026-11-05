import { defaultAppearance, type Appearance, type Locale } from '../shared/content'
import { dirAttribute, intlTag } from '../shared/locale'
import { esc } from './html'
import { badgeMarkSvg, iconSvg, type IconName } from './icons'
import { BASE_CSS, headHtml, pageVars } from './render'
import { resolveAppearance } from './themes'

export type SystemPageKind = 'password' | 'scheduled' | 'expired' | 'not-found' | 'unpublished' | 'short-links' | 'in-app'

export interface SystemPageOptions {
	kind: SystemPageKind
	/** Use the bio page's look so these pages feel like part of it. */
	appearance?: Appearance
	locale?: Locale
	/** Shown at the top, e.g. "fluxbio.link". */
	host: string
	/** The small print at the bottom, e.g. "fluxbio.link/oct-live"; an expired link adds its date. */
	meta?: string
	/** Shown on the password page after a wrong attempt. */
	wrongPassword?: boolean
	opensAt?: number
	expiredAt?: number
	timeZone?: string
	/** The page a link belongs to: expired and scheduled links point visitors there. */
	page?: { href: string; name: string } | null
	/** Close matches for a mistyped address, as paths without the leading slash. */
	suggestions?: string[]
	/** in-app: where "continue here" goes. */
	continueHref?: string
	/** in-app: the address to copy into a real browser. */
	shareUrl?: string
	/** in-app on Android: an intent:// link that opens the default browser. */
	androidIntent?: string
	/** Nonce for the one small script (the copy button); omit to render no script. */
	nonce?: string
}

interface Message {
	title: string
	body: string
}

interface SystemText {
	/** BCP 47 tag for the page's `lang` attribute; dates are formatted for it too. */
	lang: string
	password: { title: string; body: (name?: string) => string }
	passwordLabel: string
	passwordPlaceholder: string
	passwordSubmit: string
	passwordWrong: string
	scheduled: { title: string; body: (when: string) => string }
	expired: { title: string; body: (name?: string) => string }
	expiredOn: (when: string) => string
	goToPage: (name: string) => string
	'not-found': Message
	didYouMean: string
	backTo: (host: string) => string
	unpublished: Message
	/** At "/" while pages are switched off and no redirect is set. */
	'short-links': Message
	admin: string
	'in-app': Message
	/** Next to the arrow that points at the in-app browser's menu button. */
	pointer: string
	step1: string
	/** Names the in-app browser's menu item, as Instagram and Facebook word it in that language. */
	step2: string
	copy: string
	copied: string
	openBrowser: string
	stayHere: string
}

const TEXT: Record<Locale, SystemText> = {
	'zh-TW': {
		lang: 'zh-Hant-TW',
		password: { title: '這個連結需要密碼', body: (name) => `輸入${name ? ` ${name} ` : '對方'}給你的密碼，就會帶你過去。` },
		passwordLabel: '密碼',
		passwordPlaceholder: '輸入密碼',
		passwordSubmit: '解鎖',
		passwordWrong: '密碼不對，再試一次。',
		scheduled: { title: '這個連結還沒開放', body: (when) => `開放時間：${when}` },
		expired: {
			title: '這個連結已經過期',
			body: (name) => (name ? `看看 ${name} 的其他連結吧。` : '分享這個連結的人設定了到期日，現在已經無法使用。'),
		},
		expiredOn: (when) => `${when} 到期`,
		goToPage: (name) => `前往 ${name} 的頁面`,
		'not-found': { title: '找不到這個連結', body: '可能打錯字，或連結已經被刪除。' },
		didYouMean: '你是不是要找',
		backTo: (host) => `回到 ${host}`,
		unpublished: { title: '這裡還沒有內容', body: '管理員還沒發布這一頁。' },
		'short-links': { title: '這個網址專門放短網址', body: '這裡沒有頁面。打開完整的短網址，就會帶你過去。' },
		admin: '前往後台',
		'in-app': { title: '用瀏覽器開啟會更順', body: '你現在在 App 的內建瀏覽器裡，有些網站在這裡登入或付款會出問題。' },
		pointer: '點這裡的 ⋯',
		step1: '點右上角的「⋯」',
		step2: '選「在外部瀏覽器開啟」',
		copy: '複製連結',
		copied: '已複製連結',
		openBrowser: '用瀏覽器開啟',
		stayHere: '繼續在這裡開啟',
	},
	en: {
		lang: 'en',
		password: { title: 'This link is password protected', body: (name) => `Enter the password ${name ? `${name} ` : ''}gave you to continue.` },
		passwordLabel: 'Password',
		passwordPlaceholder: 'Enter the password',
		passwordSubmit: 'Unlock',
		passwordWrong: 'Wrong password. Please try again.',
		scheduled: { title: 'This link is not open yet', body: (when) => `Opens ${when}` },
		expired: {
			title: 'This link has expired',
			body: (name) => (name ? `See ${name}’s other links instead.` : 'Whoever shared this link set an expiry date, and it has passed.'),
		},
		expiredOn: (when) => `expired ${when}`,
		goToPage: (name) => `Go to ${name}’s page`,
		'not-found': { title: 'Link not found', body: 'The address may be mistyped, or the link was removed.' },
		didYouMean: 'Did you mean',
		backTo: (host) => `Back to ${host}`,
		unpublished: { title: 'Nothing here yet', body: 'This page has not been published.' },
		'short-links': { title: 'This address is for short links', body: 'There’s no page here. Open the full short link and it will take you there.' },
		admin: 'Open the dashboard',
		'in-app': { title: 'This works better in your browser', body: 'You’re in an app’s built-in browser, where signing in or paying on some sites can fail.' },
		pointer: 'Tap ⋯ here',
		step1: 'Tap “⋯” at the top right',
		step2: 'Choose “Open in browser”',
		copy: 'Copy link',
		copied: 'Link copied',
		openBrowser: 'Open in browser',
		stayHere: 'Continue here',
	},
	'zh-CN': {
		lang: 'zh-Hans-CN',
		password: { title: '这个链接需要密码', body: (name) => `输入${name ? ` ${name} ` : '对方'}给你的密码，就能打开链接。` },
		passwordLabel: '密码',
		passwordPlaceholder: '输入密码',
		passwordSubmit: '解锁',
		passwordWrong: '密码不对，再试一次。',
		scheduled: { title: '这个链接还没开放', body: (when) => `开放时间：${when}` },
		expired: {
			title: '这个链接已经过期',
			body: (name) => (name ? `看看 ${name} 的其他链接吧。` : '分享这个链接的人设置了到期日，现在已经无法使用。'),
		},
		expiredOn: (when) => `${when} 到期`,
		goToPage: (name) => `前往 ${name} 的页面`,
		'not-found': { title: '找不到这个短链接', body: '可能输错了，或者链接已经被删除。' },
		didYouMean: '你是不是要找',
		backTo: (host) => `返回 ${host}`,
		unpublished: { title: '这里还没有内容', body: '管理员还没发布这个页面。' },
		'short-links': { title: '这个网址专门放短链接', body: '这里没有页面。打开完整的短链接，就会带你过去。' },
		admin: '前往后台',
		'in-app': { title: '用浏览器打开会更顺畅', body: '你现在在 App 的内置浏览器里，有些网站在这里登录或付款会出问题。' },
		pointer: '点这里的 ⋯',
		step1: '点右上角的“⋯”',
		step2: '选择“在外部浏览器中打开”',
		copy: '复制链接',
		copied: '已复制链接',
		openBrowser: '用浏览器打开',
		stayHere: '继续在这里打开',
	},
	ja: {
		lang: 'ja',
		password: {
			title: 'このリンクにはパスワードが必要です',
			body: (name) => `${name ? `${name} から` : ''}受け取ったパスワードを入力すると、リンク先に進めます。`,
		},
		passwordLabel: 'パスワード',
		passwordPlaceholder: 'パスワードを入力',
		passwordSubmit: 'ロックを解除',
		passwordWrong: 'パスワードが違います。もう一度お試しください。',
		scheduled: { title: 'このリンクはまだ公開されていません', body: (when) => `公開日時：${when}` },
		expired: {
			title: 'このリンクは期限切れです',
			body: (name) => (name ? `${name} のほかのリンクもご覧ください。` : 'このリンクを共有した人が有効期限を設定していて、すでに期限が過ぎています。'),
		},
		expiredOn: (when) => `${when} に期限切れ`,
		goToPage: (name) => `${name} のページへ`,
		'not-found': { title: 'リンクが見つかりません', body: 'アドレスが間違っているか、リンクが削除された可能性があります。' },
		didYouMean: 'もしかして',
		backTo: (host) => `${host} に戻る`,
		unpublished: { title: 'まだ何もありません', body: 'このページはまだ公開されていません。' },
		'short-links': { title: 'このアドレスは短縮URL専用です', body: 'ここにページはありません。短縮URLをそのまま開くと、リンク先に移動します。' },
		admin: '管理画面を開く',
		'in-app': { title: 'ブラウザで開くとスムーズです', body: 'いまはアプリ内ブラウザで表示しています。サイトによっては、ここでログインや支払いがうまくいかないことがあります。' },
		pointer: 'ここの ⋯ をタップ',
		step1: '右上の「⋯」をタップ',
		step2: '「外部ブラウザで開く」を選ぶ',
		copy: 'リンクをコピー',
		copied: 'リンクをコピーしました',
		openBrowser: 'ブラウザで開く',
		stayHere: 'このまま開く',
	},
	ko: {
		lang: 'ko',
		password: { title: '비밀번호가 필요한 링크예요', body: (name) => `${name ? `${name}에게 ` : ''}받은 비밀번호를 입력하면 바로 이동해요.` },
		passwordLabel: '비밀번호',
		passwordPlaceholder: '비밀번호 입력',
		passwordSubmit: '잠금 해제',
		passwordWrong: '비밀번호가 맞지 않아요. 다시 입력해 주세요.',
		scheduled: { title: '아직 열리지 않은 링크예요', body: (when) => `공개 시간: ${when}` },
		expired: {
			title: '만료된 링크예요',
			body: (name) => (name ? `${name}의 다른 링크를 둘러보세요.` : '링크를 공유한 사람이 정한 만료일이 지나서 더 이상 열 수 없어요.'),
		},
		expiredOn: (when) => `${when} 만료`,
		goToPage: (name) => `${name} 페이지로 가기`,
		'not-found': { title: '링크를 찾을 수 없어요', body: '주소를 잘못 입력했거나 삭제된 링크일 수 있어요.' },
		didYouMean: '이 주소를 찾으셨나요?',
		backTo: (host) => `${host} 홈으로 가기`,
		unpublished: { title: '아직 내용이 없어요', body: '관리자가 아직 이 페이지를 게시하지 않았어요.' },
		'short-links': { title: '이 주소는 단축 링크 전용이에요', body: '여기에는 페이지가 없어요. 단축 링크 전체 주소를 열면 바로 이동해요.' },
		admin: '관리자 페이지 열기',
		'in-app': { title: '브라우저에서 열면 더 편해요', body: '지금은 앱 안의 브라우저예요. 일부 사이트는 여기서 로그인이나 결제가 잘 안 될 수 있어요.' },
		pointer: '여기 ⋯ 누르기',
		step1: '오른쪽 위의 ‘⋯’ 버튼 누르기',
		step2: '‘외부 브라우저로 열기’ 선택하기',
		copy: '링크 복사',
		copied: '링크를 복사했어요',
		openBrowser: '브라우저에서 열기',
		stayHere: '여기서 계속 보기',
	},
	es: {
		lang: 'es',
		password: {
			title: 'Este enlace está protegido con contraseña',
			body: (name) => (name ? `Escribe la contraseña que te dio ${name} para continuar.` : 'Escribe la contraseña que te dieron para continuar.'),
		},
		passwordLabel: 'Contraseña',
		passwordPlaceholder: 'Escribe la contraseña',
		passwordSubmit: 'Desbloquear',
		passwordWrong: 'Contraseña incorrecta. Inténtalo de nuevo.',
		scheduled: { title: 'Este enlace aún no está disponible', body: (when) => `Disponible desde el ${when}` },
		expired: {
			title: 'Este enlace ha caducado',
			body: (name) => (name ? `Mira los otros enlaces de ${name}.` : 'Quien compartió este enlace le puso una fecha de caducidad, y ya pasó.'),
		},
		expiredOn: (when) => `caducó el ${when}`,
		goToPage: (name) => `Ir a la página de ${name}`,
		'not-found': { title: 'Enlace no encontrado', body: 'Puede que la dirección esté mal escrita o que el enlace se haya eliminado.' },
		didYouMean: 'Quizás buscabas',
		backTo: (host) => `Volver a ${host}`,
		unpublished: { title: 'Aquí no hay nada todavía', body: 'Esta página aún no se ha publicado.' },
		'short-links': { title: 'Esta dirección es solo para enlaces cortos', body: 'Aquí no hay ninguna página. Abre el enlace corto completo y te llevará a su destino.' },
		admin: 'Abrir el panel',
		'in-app': { title: 'Funciona mejor en tu navegador', body: 'Estás en el navegador integrado de una app, donde iniciar sesión o pagar en algunos sitios puede fallar.' },
		pointer: 'Toca ⋯ aquí',
		step1: 'Toca “⋯” arriba a la derecha',
		step2: 'Elige “Abrir en el navegador externo”',
		copy: 'Copiar enlace',
		copied: 'Enlace copiado',
		openBrowser: 'Abrir en el navegador',
		stayHere: 'Seguir aquí',
	},
	'pt-BR': {
		lang: 'pt-BR',
		password: {
			title: 'Este link é protegido por senha',
			body: (name) => (name ? `Digite a senha que ${name} te passou para continuar.` : 'Digite a senha que você recebeu para continuar.'),
		},
		passwordLabel: 'Senha',
		passwordPlaceholder: 'Digite a senha',
		passwordSubmit: 'Desbloquear',
		passwordWrong: 'Senha incorreta. Tente de novo.',
		scheduled: { title: 'Este link ainda não está disponível', body: (when) => `Disponível a partir de ${when}` },
		expired: {
			title: 'Este link expirou',
			body: (name) => (name ? `Veja os outros links de ${name}.` : 'Quem compartilhou este link definiu uma data de validade, e ela já passou.'),
		},
		expiredOn: (when) => `expirou em ${when}`,
		goToPage: (name) => `Ir para a página de ${name}`,
		'not-found': { title: 'Link não encontrado', body: 'O endereço pode estar errado, ou o link foi removido.' },
		didYouMean: 'Você quis dizer',
		backTo: (host) => `Voltar para ${host}`,
		unpublished: { title: 'Nada por aqui ainda', body: 'Esta página ainda não foi publicada.' },
		'short-links': { title: 'Este endereço é só para links curtos', body: 'Não há nenhuma página aqui. Abra o link curto completo para chegar ao destino.' },
		admin: 'Abrir o painel',
		'in-app': { title: 'Funciona melhor no navegador', body: 'Você está no navegador interno de um app, onde login ou pagamento em alguns sites pode falhar.' },
		pointer: 'Toque em ⋯ aqui',
		step1: 'Toque em “⋯” no canto superior direito',
		step2: 'Escolha “Abrir no navegador externo”',
		copy: 'Copiar link',
		copied: 'Link copiado',
		openBrowser: 'Abrir no navegador',
		stayHere: 'Continuar aqui',
	},
	fr: {
		lang: 'fr',
		password: {
			title: 'Ce lien est protégé par un mot de passe',
			body: (name) => (name ? `Saisissez le mot de passe que ${name} vous a donné pour continuer.` : 'Saisissez le mot de passe qu’on vous a donné pour continuer.'),
		},
		passwordLabel: 'Mot de passe',
		passwordPlaceholder: 'Saisissez le mot de passe',
		passwordSubmit: 'Déverrouiller',
		passwordWrong: 'Mot de passe incorrect. Veuillez réessayer.',
		scheduled: { title: 'Ce lien n’est pas encore ouvert', body: (when) => `Ouverture le ${when}` },
		expired: {
			title: 'Ce lien a expiré',
			body: (name) => (name ? `Découvrez les autres liens de ${name}.` : 'La personne qui a partagé ce lien lui a fixé une date d’expiration, et elle est passée.'),
		},
		expiredOn: (when) => `expiré le ${when}`,
		goToPage: (name) => `Voir la page de ${name}`,
		'not-found': { title: 'Lien introuvable', body: 'L’adresse est peut-être mal saisie, ou le lien a été supprimé.' },
		didYouMean: 'Vous cherchiez peut-être',
		backTo: (host) => `Retour à ${host}`,
		unpublished: { title: 'Rien ici pour l’instant', body: 'Cette page n’a pas encore été publiée.' },
		'short-links': { title: 'Cette adresse sert uniquement aux liens courts', body: 'Il n’y a pas de page ici. Ouvrez le lien court complet pour arriver à destination.' },
		admin: 'Ouvrir le tableau de bord',
		'in-app': {
			title: 'C’est plus simple dans votre navigateur',
			body: 'Vous êtes dans le navigateur intégré d’une app\u00a0: sur certains sites, la connexion ou le paiement peut y échouer.',
		},
		pointer: 'Appuyez sur ⋯ ici',
		step1: 'Appuyez sur «\u00a0⋯\u00a0» en haut à droite',
		step2: 'Choisissez «\u00a0Ouvrir dans le navigateur externe\u00a0»',
		copy: 'Copier le lien',
		copied: 'Lien copié',
		openBrowser: 'Ouvrir dans le navigateur',
		stayHere: 'Continuer ici',
	},
	de: {
		lang: 'de',
		password: {
			title: 'Dieser Link ist passwortgeschützt',
			body: (name) => `Gib das Passwort ein, das du ${name ? `von ${name} ` : ''}bekommen hast, um weiterzumachen.`,
		},
		passwordLabel: 'Passwort',
		passwordPlaceholder: 'Passwort eingeben',
		passwordSubmit: 'Entsperren',
		passwordWrong: 'Falsches Passwort. Versuch es bitte noch einmal.',
		scheduled: { title: 'Dieser Link ist noch nicht verfügbar', body: (when) => `Verfügbar ab ${when}` },
		expired: {
			title: 'Dieser Link ist abgelaufen',
			body: (name) => (name ? `Schau dir die anderen Links von ${name} an.` : 'Für diesen Link wurde ein Ablaufdatum festgelegt, und das ist schon vorbei.'),
		},
		expiredOn: (when) => `abgelaufen am ${when}`,
		goToPage: (name) => `Zur Seite von ${name}`,
		'not-found': { title: 'Link nicht gefunden', body: 'Vielleicht ist die Adresse vertippt, oder der Link wurde gelöscht.' },
		didYouMean: 'Meintest du',
		backTo: (host) => `Zurück zu ${host}`,
		unpublished: { title: 'Hier gibt es noch nichts', body: 'Diese Seite wurde noch nicht veröffentlicht.' },
		'short-links': { title: 'Diese Adresse ist nur für Kurzlinks', body: 'Hier gibt es keine Seite. Öffne den vollständigen Kurzlink, um ans Ziel zu kommen.' },
		admin: 'Zum Dashboard',
		'in-app': { title: 'Im Browser klappt’s besser', body: 'Du bist im integrierten Browser einer App. Anmelden oder Bezahlen kann hier auf manchen Seiten fehlschlagen.' },
		pointer: 'Hier auf ⋯ tippen',
		step1: 'Tippe oben rechts auf „⋯“',
		step2: 'Wähle „In externem Browser öffnen“',
		copy: 'Link kopieren',
		copied: 'Link kopiert',
		openBrowser: 'Im Browser öffnen',
		stayHere: 'Hier weiter',
	},
	id: {
		lang: 'id',
		password: {
			title: 'Tautan ini dilindungi kata sandi',
			body: (name) => (name ? `Masukkan kata sandi dari ${name} untuk melanjutkan.` : 'Masukkan kata sandi yang kamu terima untuk melanjutkan.'),
		},
		passwordLabel: 'Kata sandi',
		passwordPlaceholder: 'Masukkan kata sandi',
		passwordSubmit: 'Buka kunci',
		passwordWrong: 'Kata sandi salah. Coba lagi.',
		scheduled: { title: 'Tautan ini belum tersedia', body: (when) => `Tersedia mulai ${when}` },
		expired: {
			title: 'Tautan ini sudah kedaluwarsa',
			body: (name) => (name ? `Yuk, lihat tautan ${name} yang lain.` : 'Orang yang membagikan tautan ini menetapkan tanggal kedaluwarsa, dan tanggal itu sudah lewat.'),
		},
		expiredOn: (when) => `kedaluwarsa ${when}`,
		goToPage: (name) => `Ke halaman ${name}`,
		'not-found': { title: 'Tautan tidak ditemukan', body: 'Mungkin alamatnya salah ketik, atau tautannya sudah dihapus.' },
		didYouMean: 'Mungkin maksudmu',
		backTo: (host) => `Kembali ke ${host}`,
		unpublished: { title: 'Belum ada apa-apa di sini', body: 'Halaman ini belum diterbitkan.' },
		'short-links': { title: 'Alamat ini khusus untuk tautan pendek', body: 'Tidak ada halaman di sini. Buka tautan pendek lengkapnya untuk menuju tujuan.' },
		admin: 'Buka dasbor',
		'in-app': { title: 'Lebih lancar di browser', body: 'Kamu sedang di browser bawaan aplikasi. Login atau pembayaran di beberapa situs bisa gagal di sini.' },
		pointer: 'Ketuk ⋯ di sini',
		step1: 'Ketuk “⋯” di kanan atas',
		step2: 'Pilih “Buka di browser eksternal”',
		copy: 'Salin tautan',
		copied: 'Tautan disalin',
		openBrowser: 'Buka di browser',
		stayHere: 'Lanjut di sini',
	},
	th: {
		lang: 'th',
		password: { title: 'ลิงก์นี้ต้องใช้รหัสผ่าน', body: (name) => `ใส่รหัสผ่านที่ได้รับ${name ? `จาก ${name} ` : ''}เพื่อไปต่อ` },
		passwordLabel: 'รหัสผ่าน',
		passwordPlaceholder: 'ใส่รหัสผ่าน',
		passwordSubmit: 'ปลดล็อก',
		passwordWrong: 'รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง',
		scheduled: { title: 'ลิงก์นี้ยังไม่เปิด', body: (when) => `เปิดให้ใช้ได้ตั้งแต่ ${when}` },
		expired: {
			title: 'ลิงก์นี้หมดอายุแล้ว',
			body: (name) => (name ? `ลองดูลิงก์อื่นของ ${name} นะ` : 'คนที่แชร์ลิงก์นี้ตั้งวันหมดอายุไว้ และตอนนี้เลยกำหนดแล้ว'),
		},
		expiredOn: (when) => `หมดอายุ ${when}`,
		goToPage: (name) => `ไปที่หน้าของ ${name}`,
		'not-found': { title: 'ไม่พบลิงก์นี้', body: 'อาจพิมพ์ที่อยู่ผิด หรือลิงก์ถูกลบไปแล้ว' },
		didYouMean: 'หรือคุณหมายถึง',
		backTo: (host) => `กลับไปที่ ${host}`,
		unpublished: { title: 'ยังไม่มีเนื้อหา', body: 'ผู้ดูแลยังไม่ได้เผยแพร่หน้านี้' },
		'short-links': { title: 'ที่อยู่นี้ใช้สำหรับลิงก์สั้นเท่านั้น', body: 'ที่นี่ไม่มีหน้าเว็บ เปิดลิงก์สั้นแบบเต็มแล้วระบบจะพาไปยังปลายทาง' },
		admin: 'ไปที่หน้าผู้ดูแล',
		'in-app': { title: 'เปิดในเบราว์เซอร์จะลื่นกว่า', body: 'ตอนนี้คุณอยู่ในเบราว์เซอร์ของแอป บางเว็บไซต์อาจเข้าสู่ระบบหรือชำระเงินที่นี่ไม่สำเร็จ' },
		pointer: 'แตะ ⋯ ตรงนี้',
		step1: 'แตะ “⋯” ที่มุมขวาบน',
		step2: 'เลือก “เปิดในเบราว์เซอร์ภายนอก”',
		copy: 'คัดลอกลิงก์',
		copied: 'คัดลอกลิงก์แล้ว',
		openBrowser: 'เปิดในเบราว์เซอร์',
		stayHere: 'เปิดต่อที่นี่',
	},
	vi: {
		lang: 'vi',
		password: {
			title: 'Liên kết này cần mật khẩu',
			body: (name) => (name ? `Nhập mật khẩu ${name} đã gửi cho bạn để tiếp tục.` : 'Nhập mật khẩu bạn nhận được để tiếp tục.'),
		},
		passwordLabel: 'Mật khẩu',
		passwordPlaceholder: 'Nhập mật khẩu',
		passwordSubmit: 'Mở khóa',
		passwordWrong: 'Sai mật khẩu. Bạn thử lại nhé.',
		scheduled: { title: 'Liên kết này chưa mở', body: (when) => `Mở vào ${when}` },
		expired: {
			title: 'Liên kết này đã hết hạn',
			body: (name) => (name ? `Xem các liên kết khác của ${name} nhé.` : 'Người chia sẻ liên kết này đã đặt ngày hết hạn, và ngày đó đã qua.'),
		},
		expiredOn: (when) => `hết hạn ${when}`,
		goToPage: (name) => `Đến trang của ${name}`,
		'not-found': { title: 'Không tìm thấy liên kết', body: 'Có thể bạn đã gõ sai địa chỉ, hoặc liên kết đã bị xóa.' },
		didYouMean: 'Có phải bạn muốn tìm',
		backTo: (host) => `Quay lại ${host}`,
		unpublished: { title: 'Chưa có nội dung', body: 'Trang này chưa được xuất bản.' },
		'short-links': { title: 'Địa chỉ này chỉ dùng cho liên kết rút gọn', body: 'Ở đây không có trang nào. Hãy mở đầy đủ liên kết rút gọn để đến nơi cần đến.' },
		admin: 'Mở trang quản trị',
		'in-app': { title: 'Mở bằng trình duyệt sẽ mượt hơn', body: 'Bạn đang dùng trình duyệt tích hợp trong ứng dụng. Một số trang có thể không đăng nhập hoặc thanh toán được ở đây.' },
		pointer: 'Chạm vào ⋯ ở đây',
		step1: 'Chạm vào “⋯” ở góc trên bên phải',
		step2: 'Chọn “Mở bằng trình duyệt ngoài”',
		copy: 'Sao chép liên kết',
		copied: 'Đã sao chép liên kết',
		openBrowser: 'Mở bằng trình duyệt',
		stayHere: 'Tiếp tục ở đây',
	},
	ar: {
		lang: 'ar',
		password: {
			title: 'هذا الرابط محمي بكلمة مرور',
			body: (name) => (name ? `أدخل كلمة المرور التي أعطاك إياها ${name} للمتابعة.` : 'أدخل كلمة المرور التي حصلت عليها للمتابعة.'),
		},
		passwordLabel: 'كلمة المرور',
		passwordPlaceholder: 'أدخل كلمة المرور',
		passwordSubmit: 'فتح',
		passwordWrong: 'كلمة المرور غير صحيحة. حاول مرة أخرى.',
		scheduled: { title: 'هذا الرابط غير متاح بعد', body: (when) => `يُفتح في ${when}` },
		expired: {
			title: 'انتهت صلاحية هذا الرابط',
			body: (name) => (name ? `يمكنك الاطلاع على روابط ${name} الأخرى.` : 'حدّد صاحب هذا الرابط تاريخًا لانتهاء صلاحيته، وقد مضى هذا التاريخ.'),
		},
		expiredOn: (when) => `انتهت الصلاحية في ${when}`,
		goToPage: (name) => `الانتقال إلى صفحة ${name}`,
		'not-found': { title: 'الرابط غير موجود', body: 'ربما كُتب العنوان بشكل خاطئ، أو أُزيل الرابط.' },
		didYouMean: 'هل تقصد',
		backTo: (host) => `العودة إلى ${host}`,
		unpublished: { title: 'لا يوجد شيء هنا بعد', body: 'لم تُنشر هذه الصفحة بعد.' },
		'short-links': { title: 'هذا العنوان مخصص للروابط المختصرة', body: 'لا توجد صفحة هنا. افتح الرابط المختصر كاملًا وسينقلك إلى وجهته.' },
		admin: 'فتح لوحة التحكم',
		'in-app': { title: 'تعمل هذه الصفحة بشكل أفضل في متصفحك', body: 'أنت في متصفح داخل تطبيق، وقد يتعذر فيه تسجيل الدخول أو الدفع في بعض المواقع.' },
		pointer: 'اضغط ⋯ هنا',
		step1: 'اضغط «⋯» في أعلى الشاشة',
		step2: 'اختر «فتح في المتصفح»',
		copy: 'نسخ الرابط',
		copied: 'تم نسخ الرابط',
		openBrowser: 'فتح في المتصفح',
		stayHere: 'المتابعة هنا',
	},
}

const ICON: Partial<Record<SystemPageKind, IconName>> = {
	password: 'lock',
	scheduled: 'clock',
	expired: 'clock',
	unpublished: 'info',
	'short-links': 'shortlink',
	'in-app': 'arrowUpRight',
}

const SYSTEM_CSS = `main{padding:40px 28px 28px;align-items:stretch}
[dir=rtl] .mark.turn svg{transform:scaleX(-1)}
[dir=rtl] *{letter-spacing:0!important}
.top{display:flex;align-items:center;gap:8px;color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px;padding:32px 0}
.mark{width:72px;height:72px;display:flex;align-items:center;justify-content:center;color:var(--ink);background:var(--accent);border:var(--feat-border);border-radius:var(--icon-radius);box-shadow:var(--feat-shadow)}
.big{margin:0;font-family:var(--head-font);font-size:84px;font-weight:700;line-height:1;letter-spacing:-.04em}
.big span{color:var(--accent-text)}
.copy h1{margin:0;text-align:start;font-size:28px;line-height:1.3}
.copy p{margin:10px 0 0;font-size:16px;line-height:1.7;color:var(--muted)}
form{display:flex;flex-direction:column;gap:10px}
label{font-size:14px;font-weight:700}
input{min-height:52px;padding:0 16px;font:inherit;font-size:16px;color:var(--fg);background:var(--field);border:var(--field-border);border-radius:min(var(--radius),16px)}
.error{margin:0;display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:var(--error)}
.cta{display:flex;align-items:center;justify-content:center;min-height:52px;padding:0 22px;font:inherit;font-size:16px;font-weight:700;color:var(--ink);background:var(--accent);border:var(--feat-border);border-radius:var(--radius);box-shadow:var(--feat-shadow);text-decoration:none;cursor:pointer}
.plain{display:flex;align-items:center;justify-content:center;min-height:44px;font-size:15px;color:var(--fg)}
.card{display:flex;flex-direction:column;gap:4px;padding:16px 18px;color:var(--fg);background:var(--card-bg);border:var(--card-border);border-radius:min(var(--radius),20px);box-shadow:var(--card-shadow);text-decoration:none}
.card small{font-size:13px;color:var(--muted)}
.card b,.card code{font-variant-numeric:tabular-nums;font-size:17px;font-weight:700;overflow-wrap:anywhere}
.card code{font-size:14px;font-weight:500}
.steps{margin:0;padding:18px 20px;list-style:none;display:flex;flex-direction:column;gap:14px;background:var(--card-bg);border:var(--card-border);border-radius:min(var(--radius),20px);box-shadow:var(--card-shadow)}
.steps li{display:flex;align-items:center;gap:12px;font-size:15px}
.steps li span{flex:0 0 auto;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:var(--ink);background:var(--accent);border-radius:999px}
.pointer{position:fixed;inset-inline-end:18px;top:14px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;color:var(--fg)}
.pointer span{margin-inline-end:40px;padding:4px 10px;font-size:13px;font-weight:700;color:var(--ink);background:var(--accent);border-radius:999px}
.share{margin:0;font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted);overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}
.meta{margin:0;font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted);overflow-wrap:anywhere}`

/** A date (and time) in the page's language, e.g. "2026年10月25日" or "Oct 25, 2026". */
function when(at: number, text: SystemText, timeZone: string, withTime: boolean): string {
	const style: Intl.DateTimeFormatOptions = { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }
	try {
		return new Intl.DateTimeFormat(intlTag(text.lang), { timeZone, ...style }).format(at)
	} catch {
		// A time zone this runtime doesn't know.
		return new Intl.DateTimeFormat(intlTag(text.lang), { timeZone: 'UTC', ...style }).format(at)
	}
}

export function renderSystemPage(options: SystemPageOptions): string {
	// A locale this version doesn't know falls back to the source language.
	const locale: Locale = options.locale && Object.hasOwn(TEXT, options.locale) ? options.locale : 'zh-TW'
	const text = TEXT[locale]
	const look = resolveAppearance(options.appearance ?? defaultAppearance(), locale)
	const tz = options.timeZone ?? 'UTC'
	const kind = options.kind
	const pageName = options.page?.name || undefined

	let title: string
	let body: string
	switch (kind) {
		case 'password':
			title = text.password.title
			body = text.password.body(pageName)
			break
		case 'scheduled':
			title = text.scheduled.title
			body = options.opensAt ? text.scheduled.body(when(options.opensAt, text, tz, true)) : ''
			break
		case 'expired':
			title = text.expired.title
			body = text.expired.body(pageName)
			break
		default:
			title = text[kind].title
			body = text[kind].body
	}

	const parts: string[] = []
	if (kind === 'password') {
		parts.push(`<form method="post">
<label for="password">${esc(text.passwordLabel)}</label>
<input id="password" name="password" type="password" autocomplete="current-password" placeholder="${esc(text.passwordPlaceholder)}" required autofocus>
${options.wrongPassword ? `<p class="error" role="alert">${iconSvg('alert', 16, 2)}${esc(text.passwordWrong)}</p>` : ''}
<button class="cta" type="submit">${esc(text.passwordSubmit)}</button>
</form>`)
	}
	if ((kind === 'expired' || kind === 'scheduled') && options.page) {
		parts.push(`<a class="cta" href="${esc(options.page.href)}">${esc(text.goToPage(options.page.name))}</a>`)
	}
	if (kind === 'not-found') {
		for (const path of options.suggestions ?? []) {
			parts.push(`<a class="card" href="/${esc(encodeURIComponent(path))}"><small>${esc(text.didYouMean)}</small><b>${esc(`${options.host}/${path}`)}</b></a>`)
		}
		parts.push(`<a class="cta" href="/">${esc(text.backTo(options.host))}</a>`)
	}
	if (kind === 'unpublished') parts.push(`<a class="cta" href="/admin/">${esc(text.admin)}</a>`)
	if (kind === 'in-app') {
		parts.push(`<ol class="steps"><li><span>1</span>${esc(text.step1)}</li><li><span>2</span>${esc(text.step2)}</li></ol>`)
		if (options.androidIntent) parts.push(`<a class="cta" href="${esc(options.androidIntent)}">${esc(text.openBrowser)}</a>`)
		if (options.shareUrl && options.nonce) {
			parts.push(`<button class="cta" type="button" id="copy" data-url="${esc(options.shareUrl)}" data-done="${esc(text.copied)}">${esc(text.copy)}</button>`)
		}
		if (options.shareUrl) parts.push(`<p class="share">${esc(options.shareUrl)}</p>`)
		if (options.continueHref) parts.push(`<a class="plain" href="${esc(options.continueHref)}">${esc(text.stayHere)}</a>`)
	}

	const icon = ICON[kind]
	const head =
		kind === 'not-found'
			? '<p class="big" aria-hidden="true">4<span>0</span>4</p>'
			: icon
				? `<span class="mark${icon === 'arrowUpRight' || icon === 'shortlink' ? ' turn' : ''}" aria-hidden="true">${iconSvg(icon, 32, 2)}</span>`
				: ''
	const meta = [options.meta, kind === 'expired' && options.expiredAt ? text.expiredOn(when(options.expiredAt, text, tz, false)) : '']
		.filter(Boolean)
		.join(' · ')
	const pointer =
		kind === 'in-app'
			? `<div class="pointer" aria-hidden="true">${iconSvg('arrowUp', 28, 2)}<span>${esc(text.pointer)}</span></div>`
			: ''
	const script =
		kind === 'in-app' && options.nonce && options.shareUrl
			? `<script nonce="${esc(options.nonce)}">document.getElementById('copy').addEventListener('click',function(){var b=this;navigator.clipboard.writeText(b.dataset.url).then(function(){b.textContent=b.dataset.done})})</script>`
			: ''

	return `<!doctype html>
<html lang="${text.lang}"${dirAttribute(text.lang)}>
<head>
${headHtml(look, title, [])}
<meta name="robots" content="noindex">
<style>${pageVars(look)}
${BASE_CSS}
${SYSTEM_CSS}</style>
</head>
<body>
${pointer}
<main>
<div class="top">${badgeMarkSvg(14)}<span>${esc(options.host)}</span></div>
<div class="body">
${head}
<div class="copy"><h1>${esc(title)}</h1>${body ? `<p>${esc(body)}</p>` : ''}</div>
${parts.join('\n')}
</div>
${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
</main>
${script}
</body>
</html>`
}
