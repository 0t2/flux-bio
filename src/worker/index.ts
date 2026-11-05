import { Hono } from 'hono'
import { fill, msg, setWords } from '../templates/msg'
import { isTestSite } from './lib/mode'
import { api } from './routes/api'
import { site, systemPage } from './routes/site'
import { ApiError, type AppEnv } from './types'
import { ENGLISH } from '../shared/serverWords'

// What the API says is in English; `key` next to it lets the dashboard say it in the owner's language.
setWords(ENGLISH)

const NO_SUCH_API = msg('找不到這個 API')
const SERVER_ERROR = msg('伺服器發生錯誤，請稍後再試')

const app = new Hono<AppEnv>({ strict: false })

// A test site holds copies of real pages under another address; search engines must never list them.
app.use('*', async (c, next) => {
	await next()
	if (!isTestSite(c.env)) return
	c.res = new Response(c.res.body, c.res)
	c.res.headers.set('x-robots-tag', 'noindex, nofollow')
})

app.route('/api', api)

// The dashboard is a single-page app. Its files are served as static assets;
// deep links like /admin/links fall through to here and get its index.html.
app.get('/admin', (c) => c.redirect('/admin/', 308))
app.get('/admin/*', (c) => c.env.ASSETS.fetch(new URL('/admin/', c.req.url)))

app.route('/', site)

app.notFound((c) =>
	c.req.path.startsWith('/api/')
		? c.json({ error: 'not-found', message: fill(NO_SUCH_API), key: NO_SUCH_API }, 404)
		: systemPage(c, 'not-found', 404),
)

app.onError((error, c) => {
	if (error instanceof ApiError) {
		return c.json({ error: error.code, ...error.text(), problems: error.problems }, error.status)
	}
	console.error(error)
	if (c.req.path.startsWith('/api/')) {
		return c.json({ error: 'internal', message: fill(SERVER_ERROR), key: SERVER_ERROR }, 500)
	}
	return c.text('Internal Server Error', 500)
})

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>
