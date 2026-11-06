# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Gemini CLI and others) working with FluxBio.
The README has the same setup steps for humans, in English (README.md) and 12 more languages (docs/).

FluxBio is an open-source Link-in-bio tool with short links and click tracking. One Cloudflare
Worker serves everything:

Names from the dashboard in this file are its Traditional Chinese labels, such as 設定 (Settings) and 外觀 (Appearance). Say them to an owner in the owner's language.

- bio pages at `/<handle>`, one of which can also be the home page at `/`. Pages are plain HTML
  with one small script, which reports which link was tapped. One deployment can hold several pages, and any of them can instead be the owner's own HTML or a redirect;
- short-link redirects at `/<slug>` (slugs may be Chinese). Short links are shared by all pages;
- the admin dashboard, a React app at `/admin/`;
- a JSON API at `/api/*`, described for agents at `/llms.txt`, `/skill.md` and `/api/openapi.json`;
- `/robots.txt` and `/sitemap.xml` for search engines, listing published pages and the languages each is fully translated into.

There is one owner per deployment. There are no sign-ups.

An owner can also use FluxBio purely as a link shortener, by switching bio pages off (`bio` in the
settings: the first question in the setup wizard, a switch on 設定, or the API). Public pages then go
offline and `/` redirects to `homeUrl` or says the address is for short links. Short links and stats
keep working, nothing is deleted, and switching back on restores every published page.

FluxBio is AI-agent first: the owner edits pages in the dashboard, but settings such as the
domain, time zone, locale, share previews and any look beyond the built-in color sets are left to an AI agent working through the API.
The dashboard's 設定 page only makes API tokens and gives a prompt to paste into an AI (Claude Code,
Codex or Cursor), plus the switch for bio pages, how much of the plan the site uses, the backup and stats downloads and the wipe button. The default QR code pictures are on 短網址. Where a form used to be, the dashboard shows a
sentence the owner can say to their AI instead (`src/admin/components/AskAi.tsx`): bulk short
links with UTM tags, and a theme of their own with their colors, fonts and pictures. Restoring a backup, moving to another deployment and
changing the password (a Cloudflare secret, section 1.8) are also left to the agent; its guide says
how, and has it save a backup on the owner's computer before changing anything. Set the owner up with an agent from the start: deploying ends with the hand-over in 1.7.

## 1. Try FluxBio, then deploy it

This is the task people most often hand to an agent. Follow the steps in order.

**Who is asking.** Most people who paste the prompt from the README or fluxbio.link have never programmed. Do the technical part yourself. Before anything they will see or have to click, say in one plain sentence what is about to happen. Never ask them to type in a terminal, and don't ask what you can decide. To try it, they only need you. To put it online they also need a free Cloudflare account: no GitHub account, no domain and no card.

Say at the start that their tool will keep asking whether it may run things, that this is normal, and to allow it. Installing and deploying can take several minutes and look frozen, so say that too, and give those commands a long time limit or run them in the background.

**Ask first, before anything is installed.** Say something like: "Do you want to see a sample of your page on this computer first? It doesn't need an account, and if you like it, we put it online after that. Or shall I go straight to putting it online?" Suggest the sample. For the sample, do 1.1 and 1.2 and stop there until they say they are happy. To go straight, skip 1.2. Don't ask if their request already says which.

**Requirements:** Node.js 22.23+, 24.22+ or 26.12+ (what the `cf` CLI asks for) and pnpm. Deploying also takes a Cloudflare account, and the free Workers plan is enough.

**Which tools can do this.** We recommend Claude Code on the owner's own computer, but it isn't required. Deploying takes an agent that can run commands and reach the internet (npm, GitHub, Cloudflare). Running the site afterwards only takes one that can call this deployment's API.

| Tool | Deploy | Run the site | Notes |
| --- | --- | --- | --- |
| Claude Code (terminal, IDE or the desktop app's Code tab) | Recommended | Yes | Needs a paid Claude plan |
| Codex, OpenCode, Cursor, Cline, Roo Code, Kilo Code, Droid, Crush, Goose, Pi, TRAE, Qoder, ZCode, Eigent, Gemini CLI, GitHub Copilot, Windsurf | Should work | Should work | |
| Claude Code on the web, Claude Cowork, Codex cloud | Not recommended | Should work | Commands run in an isolated environment: allow its network to reach Cloudflare and the deployment |
| Claude App | No | Should work | Upload `/skill.md` as a skill and let code execution reach the deployment |
| ChatGPT custom GPTs | No | Should work | Actions can't send files: upload images in the dashboard, and restore backups with another tool |
| n8n, Make and similar | No | Should work | Import `/api/openapi.json` |

### 1.1 Get the tools and the code

Check `node --version` and `pnpm --version`. If either is missing or too old, install them without an administrator password. On a Mac:

```sh
curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="$HOME/Library/pnpm" PATH="$HOME/Library/pnpm:$PATH"
pnpm env use --global 24
```

The installer also adds pnpm to their shell profile. If a later command can't find `pnpm`, run that `export` again in it, because each command may start a new shell.

Avoid Homebrew here: it asks for a password in the terminal, where nothing shows as they type, and they will think it has frozen.

Then download the code to a folder they can find again. Don't start with `git`: on a Mac without developer tools, it opens a system window that installs over a gigabyte of tools.

```sh
mkdir -p ~/flux-bio
curl -fsSL https://github.com/0t2/flux-bio/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C ~/flux-bio
cd ~/flux-bio
pnpm install
```

`git clone` is fine if git is already set up and they plan to change the code. `pnpm install` also installs the `cf` CLI (Cloudflare's CLI) as a dev dependency. Run it as
`pnpm exec cf …`. A global install (`npm install -g cf`) works the same way.

### 1.2 Try it on their computer

This takes no account and no sign-in, nothing reaches Cloudflare, and nobody else can see it.

```sh
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .dev.vars
pnpm dev   # keep this running in the background
```

It prints its address, normally `http://localhost:5173`. The first start takes a little while, so wait for `<address>/llms.txt` to answer.

Then make their page, with that password as the bearer token: ask the name to show, what they do and where they are, one at a time, then do step 1 of the hand-over (1.7), but publish it, because nobody else can reach this address. Follow `<address>/api/guide/trying-it`. Give them `<address>/` to open, and say in plain words:

- This address only opens on this computer. To show anyone else, it has to go online.
- It stops when this computer or this tool does. You can start it again with `pnpm dev`, and nothing is lost, because it is all in their FluxBio folder.
- Whatever they want changed, they can just say. There is no quota to worry about here.

**When they are happy,** say it takes a free Cloudflare account and go on from 1.3. After 1.6, bring over what they made instead of starting again, then do steps 2 and 3 of the hand-over:

```sh
FROM=http://localhost:5173 FROM_AUTH="Authorization: Bearer <password in .dev.vars>"
TO=https://<site> TO_AUTH="Authorization: Bearer <password in .secrets.env>"
curl -s -H "$FROM_AUTH" $FROM/api/export | sed "s#$FROM#$TO#g" > backup.json   # links between their pages go with them
for id in $(jq -r '.media[]' backup.json); do
  curl -s -D headers.txt -o picture "$FROM/media/$id"
  curl -s -X PUT -H "$TO_AUTH" -H "content-type: $(awk 'tolower($1)=="content-type:"{print $2}' headers.txt | tr -d '\r')" --data-binary @picture "$TO/api/media/$id"
done
curl -s -X POST -H "$TO_AUTH" -H 'content-type: application/json' --data @backup.json $TO/api/import
rm backup.json headers.txt picture
```

`jq` comes with recent versions of macOS; without it, read the `media` list out of the file any way you can. Then check `$TO/` shows their page, stop `pnpm dev` and delete `.dev.vars`. If they would rather not go on, stop `pnpm dev` and delete the folder: nothing is left anywhere else.

Local development has no visitor map, regions or devices, because those need Cloudflare: views and clicks still count.

### 1.3 Check that Cloudflare is authenticated

```sh
pnpm exec cf auth whoami
```

If they have no Cloudflare account, ask them to make one at https://dash.cloudflare.com/sign-up with their email and click the link Cloudflare sends, then tell you when that's done. Tell them it's free, that they can skip anything it offers along the way, such as domains or paid plans, and to check their spam folder if the email doesn't come.

If `authenticated` is `false`, they need to sign in. Start `pnpm exec cf auth login` yourself, in the background because it waits for them, and tell them a browser window will open where they sign in and press Allow. Run `whoami` again to see when it's done. If you run in a sandbox or on another
machine, run `pnpm exec cf auth login --no-browser` and show them the link it prints. Approving it
is theirs to do: do not try to complete the login yourself. In CI, set `CLOUDFLARE_API_TOKEN`
instead.

### 1.4 Pick the Worker name

The Worker is named `flux-bio` in `cloudflare.config.ts`. The site will be at
`https://flux-bio.<account-subdomain>.workers.dev`. Deploying replaces any existing Worker with
the same name, so check first:

```sh
pnpm exec cf workers list | grep '"flux-bio"'
```

Finding nothing is the usual answer on a new account, so grep's exit code of 1 isn't an error. The name is part of their address: keep `flux-bio` unless it's taken. If the name is taken, change `WORKER_NAME` in `cloudflare.config.ts`. A second instance must
also use a different D1 name than the first.

**Their account may already be in use.** The free plan's limits are per Cloudflare account, so FluxBio shares them with
whatever else is on it. If `cf workers list` above showed other Workers, or `pnpm exec cf d1 list` shows databases, run `pnpm usage` and tell them, in plain words, before deploying:

- FluxBio will share the account's free quota with their other projects: 100,000 Worker requests and KV reads, 1,000 KV
  writes, 5 million D1 rows read and 100,000 written a day, 5 GB of D1 in all. Its stats also use Analytics Engine, which is
  shared too (100,000 events a day), but each project keeps its own data. So the busier their other projects, the fewer page
  views FluxBio can take: say how many are left, from `plain` in `pnpm usage --json`.
- It creates one D1 database, of the 10 a free account may have; a test site would take another. If `pnpm usage` lists 10
  already, the deploy will fail: ask what to do, and never delete a database on your own.

### 1.5 Create the admin password and deploy

The dashboard password is the `ADMIN_PASSWORD` secret and must be at least 12 characters.
Generate one, then deploy with it:

```sh
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.env
pnpm exec cf deploy --secrets-file .secrets.env
```

- The first deploy creates the D1 database and the KV namespace from `cloudflare.config.ts`.
- The Worker creates its database tables on the first request, so there is no migration step.
- `.secrets.env` is gitignored. Keep it until the hand-over (1.7), then give the password to the human and
  delete the file.
- Call `cf` directly as shown. With `pnpm run deploy -- --secrets-file …`, pnpm passes the `--` through,
  so the flag is ignored and the deploy stops with "required secrets have not been set".
- Later deploys only need `pnpm run deploy`, because secrets persist.

A new Cloudflare account can stop the first deploy. Tell them what it means in plain words, and which button to press:

- **"You need to enable Analytics Engine" (code 10089).** Ask them to open https://dash.cloudflare.com, go to Workers & Pages → Analytics Engine and turn it on, then deploy again. Cloudflare's menus change, so if they can't find it after one try, remove `ANALYTICS` and `ANALYTICS_SQL` from `cloudflare.config.ts` and deploy. Views and clicks still count; only the detailed stats, like the map, are missing.
- **No `workers.dev` subdomain, or the deploy stops to ask for one.** Ask them to open Workers & Pages at https://dash.cloudflare.com and pick the name it asks for. It becomes part of their address, so suggest something other than their email name. If Cloudflare refuses the name or says the account is under review, nothing on this side can fix it: help them write to Cloudflare support.

### 1.6 Verify

Use the `workers.dev` URL printed by the deploy:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://<site>/            # 200: "Nothing here yet" until a page is published
curl -s -H "Authorization: Bearer <ADMIN_PASSWORD>" https://<site>/api/auth/me   # {"ok":true,"role":"admin"}
```

A new address can take a minute to start answering, so wait and try again before calling it a failure.

### 1.7 Hand over: the first page and an AI to run the site

FluxBio is run through an AI agent, so don't stop at a working URL. With the admin password as the
bearer token (its role is `admin`, which may also make tokens), and following `https://<site>/api/guide/trying-it`:

1. **First page, or only short links.** If they only want short links, skip the page: ask where they are for the time zone, then `PUT /api/settings` with `"bio": false`,
   the time zone and the page language (below), and go on to step 2. Otherwise ask the name to show, what they do, and where they are, one at a time, and suggest the last part of the address yourself.
   Pick the kind of page yourself (`starter`: `creator`, `shop`, `event`, `pro`, `org`). Then `POST /api/pages` with `locale` set to the page language below (the first page becomes the home page) and `PUT /api/settings` with
   the time zone, the page language and `plan` from `pnpm usage --json` (the site can't see the owner's Cloudflare plan). Fill in what they told you, and remove what a starter added that doesn't fit them: its text is written for a typical page of that kind.
   **Don't publish yet, unless they said to.** Send a preview link that lasts a day (`POST /api/pages/<id>/preview-link` with `{ "minutes": 1440 }`), and publish when they say they're happy. Don't wait for that before step 2: they may close the window after looking.
   The page language (`locale`) is the one the owner's request names (the install prompt in the README
   and on fluxbio.link ends with it, e.g. "Use English (en) as the page language"), else the
   language they write to you in. Leave `languages` empty unless they want other languages too. If they would rather
   click through it, the setup wizard at `https://<site>/admin/` does the same; step 2 is then done from 設定.
2. **Connect their AI.** `POST /api/tokens` with `{ "name": "<the AI>", "scope": "full" }` returns a
   token once.
   - If you are that AI and keep running on their machine (Claude Code): install the skill with
     `mkdir -p ~/.claude/skills/fluxbio && curl -fsSL https://<site>/skill.md -o ~/.claude/skills/fluxbio/SKILL.md`
     and, with their permission, add `export FLUXBIO_TOKEN=<token>` and `export FLUXBIO_DIR=<this folder>` to their shell profile (`~/.zshrc` on a Mac). Ask for that in their words: "May I save a key on this computer, so I can change your site next time without asking you for anything?"
   - For another AI, point them to 設定 in the dashboard instead of pasting the token into a chat
     yourself: it makes a token and gives them a prompt to paste.
3. **Tell the owner**, as `trying-it` says: the preview link, how much free quota there is, and what to say next time. They don't need the dashboard. Give them its address (`https://<site>/admin/`) and the admin password once, suggest saving it in their password app, and say you can set a new one if they lose it.
   Then delete `.secrets.env`. Finish with the "first conversation" in `https://<site>/api/guide/first-conversation`, keeping it short for someone new.

### 1.8 Optional settings

**Change the password.** This signs everyone out and revokes every API token, so make new tokens
for shortcuts and scripts afterwards.

```sh
pnpm exec cf workers secrets update ADMIN_PASSWORD --worker flux-bio --type secret_text --text '<new password>'
```

**Use a custom domain.** The domain's zone must be on the same Cloudflare account. Either:

- in the dashboard, open Workers & Pages → the Worker → Settings → Domains & Routes → Add →
  Custom domain; or
- add a route in `cloudflare.config.ts`, give the hostname a proxied DNS record, and redeploy:

  ```ts
  import { bindings, defineConfig, triggers } from 'cf/config'
  // inside worker: { … }
  triggers: [triggers.fetch({ pattern: 'links.example.com/*', zone: 'example.com' })],
  ```

Then check it with `POST /api/settings/verify-domain` and save it with `PUT /api/settings` (or ask
the owner's AI to). Once saved, short links, QR codes and the API's `short` field use the domain.

**Pictures as static files.** Each picture a visitor's browser doesn't have yet costs a Worker request and a KV read, and
on a page with several they are most of what a view costs. `pnpm deploy:images --site https://<site>` downloads the pictures
the site's pages use into `public/media/` (gitignored) and deploys with them as static files: Cloudflare answers those
without running the Worker, free and unlimited, at the same `/media/<id>`, with the headers in `public/_headers`. A picture
uploaded since then is served from KV as before, until the next run, and a picture no page uses any more is left out.
It needs a full token in `FLUXBIO_TOKEN` or the admin password in `.secrets.env`, and the owner's computer: the dashboard
can't deploy. So offer it, in plain words, when the owner adds pictures or asks about quota, and after new uploads. A deploy
without it (`pnpm run deploy`) ships whatever `public/media/` holds, nothing on a fresh checkout, and the pictures go back
to costing quota without anything breaking. `.github/workflows/deploy.yml` uses it when the repository has a
`FLUXBIO_TOKEN` secret (a full token made on the live site) and a `FLUXBIO_SITE` variable, and deploys without the
pictures if fetching them fails. With `--mode staging` it reads and deploys the test site.

**A test site.** To try a change first, run it on the owner's computer: `pnpm exec cf dev --mode staging` (with
`ADMIN_PASSWORD` in `.dev.vars`) makes nothing on Cloudflare and uses none of their quota, and only that computer can open it.
Deploy one to Cloudflare only if the owner asks, say to show someone else, and say first that it takes a second D1 database
and shares the account's quota. `--mode staging` deploys a second FluxBio of the owner's, the Worker `<name>-staging`, with its own D1,
KV and stats:

```sh
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.staging.env
pnpm exec cf deploy --mode staging --secrets-file .secrets.staging.env   # first time
pnpm exec cf deploy --mode staging                                       # later
```

It sets `TEST_SITE` to `"true"`: `robots.txt` turns every crawler away, the sitemap is empty, responses say
`x-robots-tag: noindex`, and `testSite` in `GET /api/state` and a line at the top of `/llms.txt` tell an agent where it is.
Whether to use one is the owner's call: before a new version of FluxBio, an agent asks whether to go straight to the
live site or try it on their computer first. Moving changes to the live site is by hand, one page at a time, never with `POST /api/import`,
which would replace everything there. The guide's "Test site" recipe has the steps.

A test site takes a D1 database, and the free plan allows 10 per account. If that limit stops the deploy, ask the owner what to do
and never delete a database on your own. The failed deploy leaves an empty KV namespace behind, which has to go before the next
try.

## 2. Manage an existing FluxBio through its API

Every deployment describes itself, without sign-in:

- `/llms.txt`: a guide for agents working for the owner: how to connect, recipes, when to warn
  the owner (publishing, broken short links, deleting pages, quotas) and
  which suggestions to offer. `/skill.md` is the same guide as an Agent Skill. Its longer parts are at `/api/guide/<topic>`, read when
  needed, so that loading the guide stays cheap.
- `/api/openapi.json`: the OpenAPI 3.1 document of what an API token can do (owner-only routes are left
  out), e.g. for ChatGPT actions or n8n.

If you are managing a deployment for its owner, read its `/llms.txt` first. Before you change anything, save a backup on
their computer as it says, or ask them to press 下載備份 on 設定 if you can't save files there. Then ask how they want to go
about it: straight to the live site, or a preview or a test site first.

Authenticate with `Authorization: Bearer <ADMIN_PASSWORD>`, or with an API token made in the
dashboard (設定 → API token). Tokens look like `fbk_…`; a `links` token may only create short
links (`POST /api/links` and `/api/links/bulk`), a `full` token may do everything except manage
tokens and wipe data. Everything speaks JSON. Request and response types are in
`src/shared/api.ts`; the page content schema is `PageContentSchema` in `src/shared/content.ts`.

Every route, with its parameters, is in `/api/openapi.json` and, as a list, at the end of `/llms.txt`. Both are built from `OPERATIONS` in `src/worker/lib/openapi.ts`, and
`tests/agent.test.ts` fails on a route that isn't there, so read that file when no deployment is running.

Example: add a link to a page and publish it.

```sh
SITE=https://<site>; AUTH="Authorization: Bearer $ADMIN_PASSWORD"
PAGE=$(curl -s -H "$AUTH" $SITE/api/state | jq -r '.settings.home')
curl -s -H "$AUTH" $SITE/api/pages/$PAGE > page.json
jq '.page.draft' page.json > draft.json
VERSION=$(jq -r '.page.draftUpdatedAt' page.json)
jq '.items += [{"id":"shop-link-1","kind":"link","title":"我的商店","subtitle":"","url":"https://shop.example","slug":"shop","icon":"auto","featured":false,"hidden":false,"startsAt":null,"endsAt":null}]' draft.json > next.json
VERSION=$(curl -s -X PUT -H "$AUTH" -H "If-Match: $VERSION" -H 'content-type: application/json' --data @next.json $SITE/api/pages/$PAGE/draft | jq -r '.draftUpdatedAt')
curl -s -X POST -H "$AUTH" -H "If-Match: $VERSION" $SITE/api/pages/$PAGE/publish
```

Rules worth knowing:

- **Nobody overwrites anybody.** The owner in the dashboard and their AI edit the same drafts. `PUT /api/pages/:id/draft` needs `If-Match` with the `draftUpdatedAt` that was read (`428`
  without it), and answers `409` `draft-changed` if the draft has moved on. The save is one atomic `UPDATE`, and `draft_updated_at` only goes up. Publishing takes `If-Match` too, and gives the new version.
  The dashboard sends it with every autosave, asks which copy to keep on a `409`, and loads a newer draft when its window gets focus, if it has no edits of its own.
  It asks with `If-None-Match` and the version it holds, and `GET /api/pages/:id` answers `304` while the draft is still that one, without reading the page.
- **Going back.** Every publish leaves a row in `page_versions`, the last 20 per page, with who published it (`owner`, or `token:<name>`). `POST /api/pages/:id/versions/:versionId/restore` puts one in
  the draft; going live is an ordinary publish, so links come back through the same code. Versions aren't in backups, and an import clears them. The first publish on a page without any also saves what was live.
- **Items.** `draft.items` is the page, top to bottom. Each item has a `kind`: `link`, `heading`,
  `video` (YouTube or Vimeo URL), `gallery` (up to 10 images), `product` (up to 8 cards)
  or `hours` (opening hours Monday first, address, phone, map).
  `newItem(kind)` in `src/shared/content.ts` shows the shape of each. Ids are 4–32 characters of
  `A-Za-z0-9_-` and must be unique within a page.
- **Translations.** `draft.translations` holds the owner's text in other languages:
  `{ "ja": { "<text as written>": "<translation>" } }`, matched by exact wording and cleaned of texts
  no longer on the page when publishing. What gets translated is `mapTexts` in
  `src/shared/translations.ts`. Nothing in the Worker translates: the owner's AI does it, as its guide
  says. Visitors get their browser's language, or `?lang=<code>`, and untranslated text as written.
- **Slugs and handles share one namespace**, the first path segment. Leave a link's `slug` as `""`
  and publish fills it in. Slugs are case-insensitive and may use any letters, digits, `-` and
  `_`. Some words are reserved, such as `admin`, `api`, `media` and `assets`.
- **Scheduling.** A link's `startsAt`/`endsAt` (epoch ms) hide it from the page outside that window,
  and its short link shows "not open yet" or "expired" (with a button back to the page).
- **Buttons show the real address.** In a public page's HTML, link buttons, products, gallery images and the map button are `<a href="<the address>" ping="/_c/<handle>/<id>/<part>">`, so a visitor can see where one goes. `TAP_SCRIPT` in `src/templates/render.ts` takes the attribute off and POSTs to that address on a tap, with `fetch` and `keepalive`, because Firefox ignores `ping` by default and ad blockers stop it; without JavaScript the attribute does the job, and the page works either way. That counts the tap under the same id as a click on the link's short link, and costs what a redirect costs (one Worker request, one KV read). Someone who blocks both goes uncounted. Every link still gets a short link when published, for sharing elsewhere.
- **Hiding the address.** `hideUrl` on a link makes its button `/<slug>` instead: that suits affiliate links, and every click counts. A link with a password, UTM tags, device addresses, `lineExternal` or `inAppPrompt` does the same whatever `hideUrl` says (`linkNeedsWorker` in `lib/ops.ts`, kept in the page's snapshot as `viaShortLink`), because a button that skipped the redirect would skip those. Changing one of them rewrites the page's snapshot.
- **The LINE button.** `lineButton` in a page's content floats a LINE button at the bottom right, and a tap on it counts under `<page id>.line`.
- **Social icons.** They're never counted unless `countSocials` is on in a page's content; then they report a tap the way buttons do. Email icons aren't counted. Video players still go through a `/_c` redirect, because they open inside their frame.
- **Short links only.** With `bio` off, a page's address, `/_draft` and `/_c` answer not found with no
  suggestions, `/robots.txt` and `/sitemap.xml` list no pages, and a short link's own system pages don't point
  back to its page. Every short link keeps redirecting and counting, `/media/` stays public, and pages can
  still be edited and published through the API. A page's handle stays taken, so switching back on can't clash.
- **Bio links vs. standalone links.** Bio links are the links on a page. Their URL, title and
  schedule change only through the draft and publish; `PATCH /api/links/:id` refuses those fields
  for bio links. A slug is different, like a page's own address: `PATCH` or `PUT /api/pages/:id/links/:itemId/short` changes it at once, in the draft and what's published too, and the second also makes the short link of a link that hasn't been published yet. Renaming a live one is two KV writes and two deletes, because the page's copy changes too. Removing a link from the page archives its short link.
- **QR code pictures.** A link's `qr.logo` of `default`, which is also what a link with no saved style has, shows its page's `qrLogo`, else the site's
  `qrLogo`, else nothing. Codes are drawn in the dashboard, or for an agent by `GET /api/links/:id/qr` (an SVG file, at most one KV read for its picture), so these cost visitors nothing and write no KV. Changing one changes codes in the dashboard and new
  downloads, not files already saved or printed.
- **Smart routing** (per short link): `lineExternal` adds `openExternalBrowser=1` inside LINE;
  `inAppPrompt` shows Instagram, Threads and Facebook users how to open the link in their browser
  first (`?inapp=preview` shows that page anywhere); `iosUrl`/`androidUrl` send those devices
  elsewhere, e.g. to an app store.
- **Images nothing uses.** An upload stays in KV after the last page stops showing it. `GET /api/media/unused` lists those, and `DELETE` removes them:
  ids that appear nowhere in a draft, a published page, a kept version, a QR code, the settings or a saved theme, and weren't uploaded in the last 7 days
  (`lib/media.ts`; D1 looks through every text, so a new field that holds a picture needs nothing there). Nothing does this by itself.
- **Images.** Set `profile.avatar`, `seo.image`, gallery and product images to media ids from
  `/api/media`. With `seo.imageMode: "auto"` the dashboard draws a share card when publishing;
  pages published through the API fall back to the avatar. An agent that can run commands uses a screenshot of the page instead: guide topic `share-image`, through
  Browser Run and the owner's `cf` login, so the Worker needs no binding for it.
- **Sources.** Add `?s=<source>` to a short link or a page URL to tag a traffic source, for
  example `?s=ig` or `?s=qr`. In-app browsers (Instagram, Threads, Facebook, LINE, X, TikTok,
  WeChat, Weibo, KakaoTalk, NAVER, Zalo, Snapchat, Pinterest, LinkedIn) and referrers are detected
  automatically (`src/shared/source.ts`); WhatsApp, Telegram, email and print arrive as direct.
- **UTM tags.** A short link's `utm` (`source`, `medium`, `campaign`, `content`) is added to its
  destination. A page URL can carry `utm_*` too; the page's links pass them on with `?s=`, so a
  click counts under the place the visitor came from. `content` tells apart places on one
  platform (bio, story, post).

## 3. The landing page

fluxbio.link is a separate static site in `landing/`, and nothing of it reaches a self-hosted FluxBio: `cf deploy` only uses `src/` and `public/`.
`pnpm landing` builds it, and `pnpm landing:deploy` deploys it as the Worker `fluxbio-showcase` on fluxbio.link (set in `landing/build.mjs`), which has files only and no script. So a visit uses no
Worker requests, D1 or KV, and it can't touch the account's quota.

- **Pages.** `/` is English, and `language.js` sends a browser that prefers another language to `/<code>/` (`pickLanguage` in `landing/render.ts`, the same rules as
  `matchLanguageTag`). Without JavaScript it stays English. Each is made from `landing/template.html` and `landing/locales/<code>.json`.
- **Previews.** `/preview/<code>/<theme>` is the sample page in `landing/fixtures.ts` drawn in that theme, in that language (`landing/sample/<code>.json`), and
  `/preview/<code>/<theme>-<starter>` is someone else's page in it. They are files made from the real renderer in `src/templates/` at build time, always as if on the same
  Wednesday at noon, so a new theme is on the site once it is in `THEME_SAMPLES` (`landing/previews.ts`).
- **Movement** is in `landing/public/motion.js`, and the page works without it. The phones in the hero take turns while they can be seen, until someone chooses one, and never
  for someone who asked for less motion. On a touch screen a finger moves between the phones and, on a phone, the templates.
- **Fonts.** The pages' own fonts come from the site itself, so a visit connects to nobody else for them (`landing/fonts.ts`). IBM Plex is IBM's
  own web font files, unchanged, in `landing/public/fonts/` with their licence: its reserved name is "Plex", so a file cut down here couldn't keep
  the name. Noto Sans TC, for the Traditional Chinese page, is one file with only the characters that page shows: `pnpm landing:fonts` has Google
  Fonts cut it and keeps it in `landing/.fonts/`, out of git, and a deploy runs it first, so new copy needs nothing done. Without that file, or
  once the page shows a character it lacks, the page links the font at Google. The Arabic page links IBM Plex Sans Arabic there too, and the
  sample pages in the phones load each theme's fonts as any FluxBio page does.
- **Pictures.** `landing/public/` holds what is copied as it is: `images/`, and the dashboard screenshots in `<code>/dash-*.webp`, showing the made-up shop.
  `pnpm shots --locale <code>` retakes a language's set, and `pnpm shots --category creator --out <dir>` another kind of page. No real person's page or data belongs on the
  landing page. The photographs in `images/` were made with an image generator, and the people and places in them are invented; `link-web.webp` comes from `pnpm brand`.
  Pictures on it are WebP at quality 80, and `pnpm shots` and `pnpm brand` save theirs that way.

## 4. Develop

```sh
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD for local dev
pnpm dev         # cf dev: Vite + workerd on http://localhost:5173, dashboard at /admin/
pnpm test        # Vitest inside the Workers runtime (tests/)
pnpm typecheck   # generates .cloudflare/types, then type-checks the Worker, dashboard and config
pnpm build       # builds into .cloudflare/output
pnpm i18n check  # lists dashboard text that isn't translated yet
pnpm landing     # builds the landing page (see "The landing page"); pnpm landing:deploy also deploys it
pnpm landing:fonts  # makes the Traditional Chinese landing page's font from the characters it shows now (a deploy does this itself)
pnpm shots       # retakes the landing page's dashboard screenshots from the sample pages, in a throwaway local site
pnpm brand       # remakes the favicon, app icons and the landing page's logo pictures from LOGO_PATH in src/templates/icons.ts
pnpm deploy:images --site <url>  # deploy with the site's pictures as static files, which cost no quota (--no-deploy, --mode staging)
pnpm usage       # today's free KV and D1 quota used and left, and each D1 database's size, on the signed-in Cloudflare account (--date, --days, --json)
```

Run `pnpm typecheck` and `pnpm test` before finishing any change. GitHub Actions
(`.github/workflows/deploy.yml`) runs both on every pull request and push; in `0t2/flux-bio`, a
push to `main` then deploys the landing page, and flux-bio if something it uses changed, with the `CLOUDFLARE_API_TOKEN` repository
secret.

### Layout

```
cloudflare.config.ts    Worker name, bindings (DB, KV, ASSETS, ANALYTICS…), secrets, test site
src/worker/             Hono app
  index.ts              routes and error handling
  routes/site.ts        public pages, redirects and smart routing, block clicks (/_c), draft preview links (/_draft), system pages, media
  routes/api.ts         JSON API, sessions, API tokens
  lib/schemas.ts        request bodies of the JSON API (zod)
  lib/openapi.ts        every API operation, built into /api/openapi.json at build time (vite.openapi.ts)
  lib/agent.ts          /llms.txt and /skill.md: the main guide for agents managing a deployment
  lib/agentTopics.ts    /api/guide/<topic>: the parts of the guide read only when needed
  lib/db.ts             D1 schema (runtime migrations) and queries
  lib/cache.ts          KV keys: name:<handle or slug>, site, media:<id>, font:<file>
  lib/fonts.ts          copies a page's fonts from Google Fonts to KV when it is published (served at /_fonts/)
  lib/ops.ts            pages, publish, settings, short links (they keep D1 and KV in sync)
  lib/stats.ts          counting views and clicks, D1 stats queries
  lib/statsHistory.ts   old stats: days into months, the download, clearing old months
  lib/analytics.ts      Analytics Engine events and SQL
  lib/backup.ts         export, import, wipe
  lib/seo.ts            robots.txt, sitemap.xml and the addresses of a page in each language
src/templates/          public page and system page renderers, themes and their compositions, icons (MIT). Shared with the dashboard preview
src/shared/             types, zod schemas, slugs, sources, time, opening hours, languages, translations, starters, QR styles,
                        the Google Fonts list (googleFonts.ts, generated by scripts/google-fonts.mjs) and its search
src/admin/              dashboard SPA (React 19, wouter, dnd-kit). Entry is admin/index.html
  state/app.tsx         deployment-wide state: settings, pages, the page being edited
  state/page.tsx        one page's draft, autosave and publish (draws the share card first)
  editors/              the editor panel for each item kind, and the profile (name, avatar, bio)
  pages/settings/       the switch for bio pages, API tokens and the prompt for connecting an AI, usage, the backup and stats downloads, wipe
  components/VisitorMap.tsx  the visitor map on the stats pages; its land outline (worldMap.ts) is generated
                        by scripts/world-map.mjs from Natural Earth (public domain)
public/                 static files: the icons and headers
landing/                the fluxbio.link site: its template, texts per language, sample pages (fixtures.ts holds one made-up person or
                        business per kind of page, sample/<code>.json their words), files to copy (public/) and build.mjs
docs/                   README in the other 12 languages
themes/                 the color sets of the themes (MIT), listed on 外觀
tests/                  Vitest tests (run in workerd)
```

### How it works

- **The API is the product.** Anything the owner can do, an agent must be able to do with a
  `full` token, except managing tokens and wiping. When you add or change a route,
  describe it in `OPERATIONS` in `src/worker/lib/openapi.ts` (`tests/agent.test.ts` fails on an
  undocumented route). If it changes something the owner would want to be warned about, or gives
  them something worth suggesting, add it to the guide in `src/worker/lib/agent.ts`, or to a topic in `agentTopics.ts` if only some conversations need it. Turning zod
  schemas into JSON Schema costs too much CPU for a request, so `vite.openapi.ts` does it at
  build time.
- **D1 is the source of truth.** It holds `pages`, `page_versions`, `links`, `stats` and
  `api_tokens`, which the Worker creates and upgrades on first use. To change the schema, append a
  migration to `MIGRATIONS` in `src/worker/lib/db.ts`. Never edit an existing migration.
- **KV holds what visitors read.** One record per name (`name:<handle or slug>`), holding the published page's snapshot or
  the short link that has that name, the `site` record (the home page's snapshot, the look of system pages), uploaded
  images, and the font files of published pages. A page view, a redirect and a tap on a button each cost one KV read
  (`tests/kv-cost.test.ts` checks this): pages and short links share their names, so `/<anything>` is one read whichever it
  is, and `/` reads `site`, which carries the home page. So a change to what the home page shows visitors has to reach
  `site` too, and one that must never be left to an old copy takes the copy out of `site` first (`dropCopies` with `home`;
  `tests/home-copy.test.ts`). In KV the site's time zone is only in `site`, so changing it rewrites no page or short link:
  a copy of the Worker that doesn't know it asks D1, at most once in 5 minutes (`siteTimeZone`), after the response has
  left unless the page shows opening hours. System pages go by the `site` record a copy of the Worker last saw, for up to
  a minute (`systemSite`), because anyone can ask for addresses that don't exist. Any change to D1 that visitors would see
  must also rewrite KV; follow the patterns in `lib/ops.ts`. A missing KV entry is rebuilt from D1
  on the next visit, so KV can be treated as a cache.
- **With `bio` off, KV holds no pages.** So a redirect needs no extra read to know the setting: switching
  off deletes every page's snapshot, the one in `site` too (D1 first, or a visit could rebuild one), and `snapshotOf` returns null
  while it is off, for every write and for the rebuild from D1. A page's address then costs a miss and one
  D1 read, and answers not found. Switching off costs one KV delete per published page plus the `site` record,
  which carries `bio` and `homeUrl` for `/`. Switching on writes only `site`: a visit puts back each page's snapshot. In the dashboard no page is
  loaded while it is off, so nothing outside the page routes may need `usePage()`; use `useOptionalPage()`.
- **Stats are recorded in two places.** There are no cookies, IPs are not stored, and bots and
  link-preview fetchers are skipped.
  - *D1, exact.* One counter row per day × target × kind × source in
    `stats(day, target, kind, dim, value, count, page)`. Targets: a page view counts under the page id,
    a short link click under the link id, a tap on a link's button under the link id too, a click inside a block under `<item id>.<part>`
    (`play`, `map`, `more`, or a product or image id), a social icon on a page with `countSocials` on under `<social id>.social`, and
    the LINE button under `<page id>.line`. Those with a `.` also keep their page in `page`, so a page's numbers survive
    deleting a block and no list of pages is read to tell whose a click was; a link's page is in `links`. Days are in the time zone from settings.
    Days are kept for 13 whole months (6 once the database passes 70% of the plan's size), then each month becomes one row whose
    `day` is `YYYY-MM`, which sorts before that month's days and so is never in a range of days (`lib/statsHistory.ts`).
    That, and deleting the months the owner asks to clear, happens a slice at a time after `GET /api/state`, within a daily
    budget of rows written. `GET /api/stats/export` downloads every row; `GET /api/usage` says how full the database is.
    The Worker can't see the owner's Cloudflare plan, so `settings.plan` (`free` or `paid`) says it.
  - *Workers Analytics Engine, detailed, last 90 days.* One raw event per hit in the instance's own
    dataset (`ANALYTICS`, named after the Worker). The blob order is `EVENT_FIELDS` in
    `lib/analytics.ts` (kind, target, source, country, device, browser, os, referrer host, daily
    visitor hash, region, city, utm_content, language, network, slug, destination URL, utm_source,
    utm_medium, utm_campaign, page) and the doubles are `EVENT_NUMBERS`: the local day (yyyymmdd)
    and hour, the latitude and longitude rounded to 0.1°, the network's AS number, and `layout`.
    `network` is the AS organization (e.g. "Chunghwa Telecom"). Network queries require an AS number
    above 0, and campaign queries ignore `utm_content` where `layout` is 0. AE allows 20 blobs and the list is
    full: put new fields in doubles. Append, never reorder.
    `lib/analytics.ts` reads them through the Analytics SQL binding (`ANALYTICS_SQL`, no API token);
    its sampling column is `sampleInterval`, not `_sample_interval`.
  - *Never store anything that identifies a person.* That means no IP address, no user-agent string
    and no precise coordinates: Cloudflare's estimate of where the IP is (a city's position, not
    GPS) is rounded to 0.1°, about a town. `tests/analytics.test.ts` checks this; keep it passing. Cloudflare's per-request Workers Logs would record request headers, so they stay off (`invocationLogs: false`), and only `console.error` is logged.
- **A page can be something other than links.** `custom` in its content makes it the owner's own HTML or a redirect (`CustomPageSchema`). Everything else about a page still applies: the draft, publishing, versions, backups, stats, being the home page. Its HTML is sent with a CSP `sandbox` and no `allow-same-origin` (`CUSTOM_CSP`), because it shares an address with the dashboard: without that, a script in it could use the owner's session. Keep that header on every route that serves it.
- **Public pages are plain HTML.** Apart from custom pages, `renderBioPage()` builds them with no JavaScript but `TAP_SCRIPT`, which the CSP allows by its hash and a page with nothing to report leaves out, and the
  dashboard preview renders the same function in an iframe sandboxed without scripts, and updates it in place (`lib/morph.ts`) so an edit doesn't reload it. Videos and maps sit in
  frames that show a picture and load the real player or map only when tapped. The only other script on
  a public page is the copy button of the in-app browser notice, allowed by a per-response nonce.
- **Fonts come from Google, or from the Worker.** By default public pages link to Google Fonts,
  which costs no quota. A Chinese, Japanese or Korean font comes cut into a hundred files or so, and its stylesheet, the list
  of them, is about 35 KB that holds up the first paint. So a live page asks Google for such a font with exactly the characters
  it shows this visitor (`&text=`), which is one small rule and one file (`fontLinks` in `src/templates/render.ts`,
  `tests/font-links.test.ts`): every character where the font is the page's own, as on a page in Traditional Chinese, and only
  the Chinese where it stands behind the visitor's own fonts, as the built-in Chinese font does on a page in English
  (`fallbackFonts`), or nothing when there is none. Google cuts a font to 800 characters at most and sends all of it when asked
  for more (`GOOGLE_TEXT_LIMIT`), so a page that shows more links the whole font. A cut font is kept by a browser for a day,
  the whole one's files for a year. Other families, and the dashboard's preview, link whole. With `settings.hostFonts` on (外觀 has the switch, with a help dialog aimed
  at owners with visitors in the EU), publishing asks Google Fonts for each family the page uses
  with only the characters it can show (its text, the built-in text of its languages, ASCII),
  stores the woff2 files in KV under `font:<page id>-<fingerprint>-<n>` and lists them in the page's
  `fonts` column (`lib/fonts.ts`); the page declares them with `@font-face` and loads them from
  `/_fonts/`, so visitors never connect to Google. Files are kept while the characters stay the same
  and deleted when unused; turning the switch on or off copies or drops every published page's
  files. With it on, a page whose fonts couldn't be copied (Google unreachable, or imported and not
  published since) uses the visitor's own fonts, never Google's. The dashboard preview always links
  to Google; system pages always use the visitor's own fonts. Picking a Google font is left to the
  owner's AI; see "Fonts and the free plan" below for what it costs.

### Constraints

- **CPU budget.** The free plan allows 10 ms of CPU per request. Public routes must stay light: no
  image processing, no slow password hashing, no SSR framework. The dashboard resizes images and
  draws share cards in the browser before uploading them.
- **KV writes.** The free plan allows 1,000 KV writes a day, per account (`pnpm usage` shows what is left today). Publishing writes the page, one per changed
  link, and for the home page the `site` record twice (without its copy of the page, then with the new one), and with `hostFonts` on, when the page's characters change, one per font file plus one per
  old file deleted; keep bulk operations within that.
- **No limit on pages or short links, so no whole-table reads.** A site can hold any number of both. The free plan still applies: 5 million D1 rows read a day (queries fail past that), 50 queries per request, 100 bound values per query, five terms in a compound SELECT, and 10 ms of CPU. So a lookup goes through an index for the names or ids it needs (`ownersOf`, `getLinksByIds`, `listLinkPage`, `listPageRows`), D1 does the work on a list of pages rather than the Worker parsing every draft, and a change to a whole site drops at most `KV_OPS_AT_ONCE` copies for visits to rebuild, answering `copiesLeft` if some stayed. `tests/scale.test.ts` holds a large site to these numbers; a query that names `stats_target_day` with `INDEXED BY` does so because SQLite otherwise scans the day's rows. Only backups read everything, a slice at a time.
- **No extra Cloudflare products.** The app uses Workers, D1, KV and Analytics Engine, none of which
  need manual setup. Do not add R2, Durable Objects or Queues without a strong reason; each one
  adds setup steps for people who self-host.
- **Language.** Write code comments and docs in English. Write UI copy in Traditional Chinese
  (zh-TW), then translate it: see "Translations" below.
- **Licenses.** `src/templates/` and `themes/` are MIT. Everything else is AGPL-3.0-only.

### Translations

The dashboard and public pages come in 13 languages: zh-TW, zh-CN, en, ja, ko, es, pt-BR, fr, de, id,
th, vi and ar.

- **Right to left.** `ar` runs right to left (`RIGHT_TO_LEFT` in `src/shared/locale.ts`). Its pages get `dir="rtl"` and everything turns
  round by itself as long as CSS uses logical properties (`margin-inline-start`, `inset-inline-end`, `text-align:start`), which
  `tests/rtl.test.ts` checks; physical `left:50%` is only for centering with `translateX(-50%)`. Arrows along the line of text turn round
  (`Icon` in the dashboard, CSS on public pages). Addresses, code and charts stay left to right, and spacing between letters is off, because it
  pulls Arabic's joined letters apart. Another right-to-left language takes its code there, its translations and a font stack in `src/templates/themes.ts`.
- **Dashboard** (`src/admin/i18n/`). The Traditional Chinese text is the key: write
  `t('發布')`, `t('已刪除「{name}」', { name })`, or `tr('請到 {link} 頁修改', { link: <Link … /> })`
  for a sentence with an element inside. Text in module-level constants, `src/shared`,
  `src/templates` or the Worker is marked with `msg('…')` (or `fill()` with values) and passed through
  `t()` where it's shown; never call `t()` at module scope. When the same words mean different things,
  give the key a context: `t('[state]關閉')` (Off) vs `t('關閉')` (Close). Each other language is
  `src/admin/i18n/locales/<code>.json`, keyed by that text. After changing copy, add the new keys to
  every locale file; `pnpm i18n check` and `tests/i18n.test.ts` fail on untranslated text, missing
  keys and mismatched `{placeholders}`. The owner picks the language (sidebar, 設定, login page); it
  starts from the browser's.
- **Text from the API** (errors, publish problems, stats labels) is in English, from `src/shared/serverWords.ts`, with `key` and `params`
  next to it that the dashboard translates (`src/templates/msg.ts`). So are a starter's words in each language, for pages made through the API.
  That file is generated from the dashboard's locale files: run `pnpm i18n server` after changing them or adding a key the Worker uses.
- **Nothing in Chinese reaches anyone who doesn't read it.** `tests/no-chinese.test.ts` checks what the API sends and creates, the guide, and the landing page in
  every other language, and `pnpm shots` refuses a screenshot with Chinese in it.
- **Landing page and README.** The landing page's texts are `landing/locales/<code>.json`; README.md is English and
  `docs/README.<code>.md` holds the other languages. `tests/landing.test.ts` checks that every
  language has its texts, sample page and README.
- **Public pages** have their own small dictionaries: `STRINGS` in `src/templates/render.ts`,
  `TEXT` in `src/templates/system.ts` and `src/shared/hours.ts`, typed so a missing language is a
  type error. The `locale` setting is the page language; `languages` turns on more, picked per
  visitor from `Accept-Language` (`resolveLocale` in `src/shared/locale.ts`). The owner sets both on
  外觀 (`src/admin/editors/PageLanguages.tsx`) or through the API. The owner's own text is translated
  by their AI into `content.translations` (see "Rules worth knowing").

### Add a theme

A theme is a composition, not a palette. On a public page it is three things: its colors and fonts (`SEEDS` in
`src/templates/themes.ts`), the rules of its layout (`THEME_CSS` in `src/templates/compositions.ts`), and the color
sets it offers (`themes/community.json`). The dashboard's thumbnails (`src/admin/components/MiniBio.tsx`) use the real
composition in a shadow root, and the landing page's lists come from the themes, so neither needs its own drawing.

- **A color set** needs no code: add it to `themes/community.json` (see `themes/README.md`). 外觀 shows the sets of the
  theme in use. Keep each theme to a few: owners pick, they don't tune. Anything
  else is what their AI is for.
- **A new base theme:** add the id to `THEME_IDS` in `src/shared/content.ts`, its seed to `SEEDS`, its composition to
  `THEME_CSS`, whose sample page suits it to `THEME_SAMPLES` (`landing/previews.ts`), its name to the dashboard's
  locale files, and at least one color set. Every color in a composition must be a variable from `pageVars()` or a mix
  of them, so it keeps working in colors an AI picks. Then `pnpm test`.
- **What an AI can set** through the API, and the dashboard can't: `accent`, `accent2`, `bg`, `fg`, `font`, `headFont`,
  `bodyFont`, `button`, `bgImage` and `bgDim` in `appearance`. A page with any of these shows on 外觀 as a look made by
  AI, and picking a color set clears them. `coverImage` is the page's own picture: the owner uploads it in the profile,
  and picking a color set keeps it.
- **Fonts.** `headFont` and `bodyFont` take any family on the list in `src/shared/googleFonts.ts`
  (refresh it with `scripts/google-fonts.mjs`). A family missing from a newer list is dropped from
  stored pages instead of breaking them (`storedContent`).
- **Colors.** An appearance's `bg` and `fg` ("" for the theme's own) go through `themeWithColors`:
  a dark theme's background stays dark and a light theme's light (`fitBackground`), text below
  4.5:1 falls back to the theme's, and secondary text, panels and lines are worked out from them. In themes that put text on it (`TEXT_ON_SECOND_COLOR`), `accent2` moves toward the background until that text reads, and so do tinted buttons (`ACCENT_TINT`). A new theme with text on its second color goes on that list, which `tests/themes.test.ts` checks.
- **Stored ids stay.** Theme ids are in every saved page, so a theme's look and name can change but its id can't. That
  is why `liquid` is Neon and `brutal` is Tiles.

### Fonts and the free plan

Every theme comes with its fonts and the dashboard has no font control; it shows a sentence the
owner can say to their AI (and a prompt to copy in the font help on 外觀), and the guide in
`src/worker/lib/agent.ts` tells that AI how to pick a Google Fonts family (`GET /api/fonts`,
`appearance.headFont`, `bodyFont`) and what to say about cost.

Loaded from Google (`hostFonts` off, the default), fonts cost the site nothing. With `hostFonts` on,
on the free plan (per day, for the whole site: 100,000 Worker requests, 100,000 KV reads, 1,000 KV
writes):

- Every font file is one Worker request and one KV read per new visitor (browsers keep it a year).
  A page has two files for its theme's fonts (the font and its heading face). A picked family adds
  one, or up to four for body text in a family without variable weights.
- Publishing changed text rewrites a page's font files and deletes the old ones: about two KV
  writes per file.

When an owner keeps `hostFonts` on but wants it cheaper and you can change the code, these are the
options, easiest first. Tell the owner the trade-off and get a yes before building one. Turning
`hostFonts` off costs nothing at all, but visitors connect to Google again.

1. **Fewer files, no code.** Through the API: no picked font, or one for headings.
2. **Cloudflare's cache in front of the Worker** (Workers Caching). Responses with
   `cache-control: public, max-age=…, immutable` (font files and `/media/`) are then answered
   without running the Worker or reading KV; they still count as requests. It works on workers.dev.
   Before turning it on, make sure nothing else can be cached: bio pages send `no-cache`, redirects
   `no-store`, and every API response must say `no-store` (check `routes/api.ts`). Find how
   `cloudflare.config.ts` turns it on with `pnpm exec cf cli search "worker cache"`. The Cache API
   (`caches.default`) is the older way and does nothing on workers.dev.
3. **Device fonts only.** Pass `fonts: []` to `renderBioPage()` in `serveBio` (system pages already
   do), or make it a third choice next to `hostFonts`: no font files and no Google.
4. **Inline small files.** Put Latin files under about 20 KB into the `@font-face` rules as `data:`
   URLs in `headHtml()`: no extra requests, but every view downloads them again, a third larger
   in base64. Not for Chinese, Japanese or Korean files.

The owner's own font files (uploads) aren't supported. Latin files could be stored like images, but
Chinese, Japanese and Korean fonts are megabytes each and would need subsetting in the browser first.

## 5. Gotchas

- **`cf` is in beta.** Find commands with `pnpm exec cf cli search "<what you want to do>"`, then
  read `<command> --help`. Keep search queries free of names, domains and IDs.
- **Compatibility date.** `cloudflare.config.ts` and `vitest.config.ts` both set it. Keep them in
  sync.
- **Separate local state.** `cf dev` and `pnpm test` keep their own local D1 and KV state. A page
  you publish in one does not show up in the other.
- **Analytics Engine locally.** `cf dev` leaves out both Analytics bindings (`cloudflare.config.ts`), so it needs no sign-in and
  `insights` is `null` in local development and tests. That is expected. Its SQL API is in beta.
- **Analytics Engine delay.** New events take about a minute to show up in queries.
- **Renaming the Worker** also renames its Analytics Engine dataset. Events written before the
  rename stay in the old dataset.
- **Vitest caches globbed files.** Tests that list files with `import.meta.glob` (translations, the
  landing pages, READMEs) can miss a newly added file locally. Run `pnpm exec vitest --clearCache`;
  CI starts clean.
- **Tests never reach Google.** `hostFonts` is off unless a test turns it on, and `tests/setup.ts`
  answers for Google Fonts as if it were down anyway; `tests/fonts.test.ts` answers with fonts.
- **Publishing can fail with `409`.** It happens when a link's slug is already a page handle,
  a standalone short link, or a link on another page. The error lists which link.
