# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, `pnpm update:code` in your FluxBio folder brings its code to the newest release and shows the releases in between: read them before you deploy. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.5 - 2026-11-20

### Fixed
- The guide a test site or a local copy serves no longer gives the live site's commands: its deploys say `--mode staging`, and it no longer tells your AI to save that guide as the live site's skill. [#52](https://github.com/0t2/flux-bio/pull/52)
- On a Worker with more than one site, "Remove FluxBio" in the guide no longer has your AI delete the whole Worker and the first site's database to take out one site. [#52](https://github.com/0t2/flux-bio/pull/52)
- `pnpm run deploy` goes by the version of your Worker that is running, which is not always the newest after a rollback in Cloudflare's dashboard. `pnpm deploy:images` reads a second site's pictures with that site's own token, and `pnpm reset-password --mode staging` leaves the live site's tokens on file alone. [#52](https://github.com/0t2/flux-bio/pull/52)
- Running a test site on your computer (`cf dev --mode staging`) no longer needs a Cloudflare sign-in. [#52](https://github.com/0t2/flux-bio/pull/52)
- `GET /api/update` answers that it doesn't know (`latest` is null) for a version or a changelog it can't place, where it could say the site was up to date. [#52](https://github.com/0t2/flux-bio/pull/52)

## 0.4.4 - 2026-11-20

### Fixed
- `pnpm reset-password` checks that the address you give is served by the Worker your folder deploys before it changes anything. Run with a test site's or a local site's address, as their sign-in pages gave it, it replaced the live site's password. It also takes the list of sites from the running Worker, saves the password before setting it, and says which site got no token. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm run deploy` looks at every Worker on the account before it makes a new site: it only saw the first ten, so an existing FluxBio further down the list was missed. It also stops when a Worker can't be read, and no longer makes a test site for a live site that isn't there. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm update:code` no longer replaces a file of your own when a new release starts using its name, loses a file a release renamed only in its capitals, or stops halfway where a file became a folder. [#51](https://github.com/0t2/flux-bio/pull/51)
- `worker.json` takes any Worker name Cloudflare does: underscores, and up to 63 characters. [#51](https://github.com/0t2/flux-bio/pull/51)

## 0.4.3 - 2026-11-20

### New
- `pnpm update:code` brings the code in your FluxBio folder to the newest release. It shows what the update brings, stops if one of FluxBio's files was changed there, and leaves your own files alone. Deploying stays a separate step. [#50](https://github.com/0t2/flux-bio/pull/50)

## 0.4.2 - 2026-11-20

### New
- The FAQ on fluxbio.link and in your site's guide answers "How do I get new versions?": ask your AI, look at Settings in the dashboard, or watch the project's releases on GitHub to be emailed each one. [#49](https://github.com/0t2/flux-bio/pull/49)

## 0.4.1 - 2026-11-20

### New
- Settings in the dashboard tells you when a newer FluxBio is out, says first if it has a security fix, and gives the sentence to say to your AI to update. It asks GitHub only when you open that page, and when your site is up to date the version at the bottom says so. [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### Action needed
- If you changed `cloudflare.config.ts` (another `WORKER_NAME`, a custom domain, or `ANALYTICS` taken out), put that in `worker.json` in your FluxBio folder before you deploy this version, for example `{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }`. That file isn't part of the code, so updates leave it alone from now on. If you forget, the deploy stops and tells you the name to write. [#45](https://github.com/0t2/flux-bio/pull/45)

### New
- `pnpm run deploy` asks Cloudflare what is running before it uploads anything, and stops a deploy that would make a second, empty site, take one of your sites offline, replace another Worker or replace your password. Use it in place of `cf deploy`. [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` sets a new admin password and makes a new API token for each of your sites, without printing either. The sign-in page's "Forgot your password?" gives this command now. [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### New
- If the folder you deployed from is gone, deleted or left on another computer, your AI can rebuild it: your site's guide has the steps at `/api/guide/rebuild`, with your Worker's name in them. Your site keeps running meanwhile, and nothing on it is lost. [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### New
- `GET /api/update` says whether a newer FluxBio is out: how many releases your site is behind, and whether one of them fixes a security problem or has an Action needed. It reads this changelog from GitHub, and only when asked. Your AI asks once a conversation, and tells you first when a security fix is waiting. [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### New
- Releases have version numbers. A site says which one it runs in `version` of `GET /api/state` and at the top of `/llms.txt`, and each heading here is one. The number says what updating takes: when the middle number changes (0.3.4 to 0.4.0) there is an Action needed, and when only the last one does, deploying is enough. A site that still says 0.2.1 is from before this release, so go by the day it was last updated. [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### New
- This changelog, here and at [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### Action needed
- Update and redeploy to get the link-password fix below. Nothing else about your site changes. [#38](https://github.com/0t2/flux-bio/pull/38)

### Security
- A password on a page's link could be skipped: the page's `/_c/<handle>/<id>/link` address answered with the link's real address. A link whose button goes through its short link (a password, a hidden address, device addresses, UTM tags) is no longer handed out or counted there. [#38](https://github.com/0t2/flux-bio/pull/38)

### Fixed
- The right link password never reached the destination in Chromium. [#38](https://github.com/0t2/flux-bio/pull/38)
- Publishing no longer drops what was typed after the click, and an autosave during a publish is no longer refused. [#38](https://github.com/0t2/flux-bio/pull/38)
- Each settings switch in the dashboard sends only what it changes. Before, toggling one could undo what the owner's AI had set since, the domain and time zone included. [#38](https://github.com/0t2/flux-bio/pull/38)
- Wiping a site could leave a database with no tables when KV refused a delete, and past 5,000 KV keys it stopped and said it was done. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### Changed
- The settings switch is named Short links only, and on means bio pages are off. It was named for bio pages but described what turning it off does, so an owner of a short-links-only site read it backwards. [#37](https://github.com/0t2/flux-bio/pull/37)

### Fixed
- `pnpm dev` failed to start because `cloudflare.config.ts` imported a module the Worker also imports. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### Action needed
- If you ship your pictures as static files with `pnpm deploy:images`, deploy this version and then run it once more: it now reads each site's pictures through the new `GET /api/media/{id}` and rebuilds the bundle from them. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### Security
- The custom domain check is bound to the hostname it was asked about, so a check answered for one hostname can't be passed off for another. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- On a Worker that holds more than one site, each site's pictures shipped as static files now live in a folder of that site, and a site is served only its own at `/media/<id>`. Before, all sites shared one folder. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### New
- `GET /api/media/{id}` gives the current bytes of a picture to a token, for backups and for `pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Changed
- `pnpm deploy:images` downloads every picture on each run, since an upload or a restore can overwrite an id, and checks which site and which mode it is reading before it downloads. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- The guide the owner's AI reads backs up with `GET /api/media/{id}` into a snapshot folder it never overwrites, and sets up a first page in a defined order. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### Action needed
- If your database was last opened by a build from before this day's `7b0bad4`, deploy the build just before the squash (`8d0c435`) first and open the site once, then deploy this one. Migrations were squashed into one, and a database that has run fewer than ten of the old ones (`SELECT value FROM _meta WHERE key = 'schema_version'` below 10) is now treated as up to date, so it would miss columns and indexes. New installs and databases at 10 are not affected. [#27](https://github.com/0t2/flux-bio/pull/27)
- Use pnpm 10.34.5 or newer to install. The project now names pnpm 12.18.0 in `package.json`, and an older pnpm stops with "Failed to switch pnpm". The installer in `AGENTS.md` replaces it, and its steps changed (`pnpm runtime set node 24 --global`, `bin` in the pnpm folder). pnpm's settings are now in `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### Security
- Pages of links load pictures only from the site itself (plus YouTube thumbnails on a page with a video), where they loaded from any https address. [#32](https://github.com/0t2/flux-bio/pull/32)
- A page's own CSS is read as a browser reads it before it is accepted, and may load only the site's own pictures. [#32](https://github.com/0t2/flux-bio/pull/32)

### New
- Several sites in one Worker, each with its own database, KV, stats, settings and domain, listed in `sites.json`. Without that file a Worker is one site, as before. [#23](https://github.com/0t2/flux-bio/pull/23)
- Embed blocks that open Ko-fi's or Calendly's panel over the page on a tap, and a floating button for either. Nothing loads from them before the tap. [#28](https://github.com/0t2/flux-bio/pull/28)
- The owner's AI can give a page of links CSS of its own (`appearance.css`), so "make my page look like this picture" keeps the page of links. [#32](https://github.com/0t2/flux-bio/pull/32)
- A page background can repeat at a set size, for patterns (`appearance.bgTile`). [#29](https://github.com/0t2/flux-bio/pull/29)
- Social icons can go after the links (`appearance.socialPlace`), and the name can be hidden but kept as the page's heading (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- Pictures nothing uses can be listed and deleted: `GET` and `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- Settings shows the plan, the database's size and the day's use of the free quota, and `pnpm usage` reads it from the account. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- Daily stats are kept for 13 months, then merged into one row per month, and every count can be downloaded as CSV. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` ships a site's pictures as static files, which cost no Worker request or KV read. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- An issue form for asking for a new block. [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link has a traffic and cost estimator. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### Changed
- No limit on pages or short links: nothing a visitor or the owner waits for reads a whole table, and the dashboard loads short links a screenful at a time. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- Cheaper to run: a page view takes one KV read, D1 queries that don't depend on each other go together, the dashboard asks the Worker for less, and a page view takes about a third of the CPU. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- Pages and the dashboard's preview ask Google for a Chinese font with only the characters they show, not the whole font. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- The code that read data saved in older shapes is gone: old settings and page shapes, old backup files, `ADMIN_TOKEN`, the `/shorten` page and old dashboard addresses. [#27](https://github.com/0t2/flux-bio/pull/27)
- The prompt that installs FluxBio downloads the code first and has the agent read `AGENTS.md` from the folder, in all 13 languages. [#21](https://github.com/0t2/flux-bio/pull/21)
- The guide the owner's AI reads is split into a short main guide and topics read when needed, and says how each theme colors buttons, how fonts load and how to make a pattern. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- A deploy from GitHub Actions of a FluxBio site happens only in this repository and only when it names a site. A copy deploys nothing. [#14](https://github.com/0t2/flux-bio/pull/14)

### Fixed
- Saving a custom domain failed with 522 for every domain it was meant to confirm. [#35](https://github.com/0t2/flux-bio/pull/35)
- A page published before `appearance.css` existed answered 500 until it was published again. [#32](https://github.com/0t2/flux-bio/pull/32)
- The dashboard no longer puts a CSP violation in the browser console on every load. [#20](https://github.com/0t2/flux-bio/pull/20)
- Fixes for an AI rebuilding a page from screenshots: CSS attribute selectors on addresses, `null` for cover and background pictures in `POST /api/themes`, and theme names in the owner's language from `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### New
- First public release: Link in bio, short links and click tracking on one Cloudflare Worker, run by the owner's AI. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)
