# The landing page (fluxbio.link)

For AI coding agents working on fluxbio.link, the project's own site. Nobody who hosts their own FluxBio needs anything in this folder, and
an agent helping someone deploy or run their FluxBio can skip it: the repository's `AGENTS.md` covers the product. What is here is for whoever
maintains the site, and its commands deploy to fluxbio.link, which only the maintainer's Cloudflare account can do.

fluxbio.link is a separate static site in `landing/`, and nothing of it reaches a self-hosted FluxBio: `cf deploy` only uses `src/` and `public/`.
`pnpm landing` builds it, and `pnpm landing:deploy` deploys it as the Worker `fluxbio-showcase` on fluxbio.link (set in `landing/build.mjs`), which has files only and no script, and
answers at that address alone: its `workers.dev` address is off. So a visit uses no
Worker requests, D1 or KV, and it can't touch the account's quota.

```sh
pnpm landing           # builds it into landing/.cloudflare/output
pnpm landing:deploy    # on the account that serves fluxbio.link only: fetches the screenshots a checkout lacks, builds and deploys
pnpm landing:fonts     # makes the Traditional Chinese page's font from the characters it shows now (a deploy from GitHub Actions does this itself)
pnpm landing:pictures  # fetches from fluxbio.link the dashboard screenshots this checkout lacks (--check only lists them)
pnpm shots             # retakes the dashboard screenshots from the sample pages, in a throwaway local site
```

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
  `pnpm shots --locale <code>` retakes a language's set, and `pnpm shots --category creator --out <dir>` another kind of page.
  The screenshots are not in git, because every retake would add megabytes to the repository for good: they are on the maintainer's computer
  and on the site. `pnpm landing:deploy` first fetches from fluxbio.link the ones a checkout lacks (`pnpm landing:pictures`), which is how a
  deploy from GitHub Actions keeps them, and stops if one can't be had. New ones reach the site by deploying from the computer that took them.
  The READMEs show them from fluxbio.link. No real person's page or data belongs on the
  landing page. The photographs in `images/` were made with an image generator, and the people and places in them are invented; `link-web.webp` comes from `pnpm brand`.
  Pictures on it are WebP at quality 80, and `pnpm shots` and `pnpm brand` save theirs that way.

## Retake the dashboard screenshots

The landing page and the READMEs show four screens of the dashboard in each language: the editor with its preview (`dash-links`), a QR code
(`dash-qr`), the stats (`dash-stats`) and 外觀 (`dash-appearance`). After a change to how any of those looks, they are out of date until
retaken. They are not in git, so they are never part of a pull request: say in yours that they need retaking, and do this after it is merged.

It takes the maintainer's computer, which is signed in to Cloudflare. A session that can't deploy (a cloud session) stops at saying so.

1. Be on `main`, up to date with `origin/main`, with nothing uncommitted. `pnpm landing:deploy` publishes the landing page as this folder has
   it: from a branch it would put unmerged copy on fluxbio.link, and from an old `main` it would take the site back.
2. Stop `pnpm dev` if it is running, because the script needs port 5173. Then take every language, about half a minute each:

   ```sh
   for code in $(ls landing/locales | sed 's/\.json$//'); do pnpm shots --locale "$code" || break; done
   ```

   The script stops at a screenshot with Chinese in it in another language, which means dashboard text isn't translated yet
   (`pnpm i18n check`). The editor's preview is taken as if in the middle of the made-up shop's opening hours, so it says open
   at whatever hour, and on whatever day, the screenshots are retaken.
3. Look at them before anyone else does: `pnpm landing`, then open the built page, and show the maintainer.
4. With the maintainer's yes, `pnpm landing:deploy`. This is the live site.
5. Check that the site has them: `curl -s https://fluxbio.link/en/dash-links.webp | cmp - landing/public/en/dash-links.webp` says nothing when they match.

From then on every deploy from GitHub Actions takes the screenshots from the site, so nothing else needs doing. If only some languages were
retaken, the others stay as they are on the site.
