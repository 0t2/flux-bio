@AGENTS.md

## Working on this repository with Claude Code

- Run `pnpm typecheck` and `pnpm test` before finishing. Both work in cloud sessions
  (claude.ai/code), where `.claude/hooks/session-start.sh` installs the dependencies first.
- Hand changes back as a pull request. Merging into `main` deploys the landing page, and flux-bio if something it
  uses changed (`.github/workflows/deploy.yml`). The maintainer manages Cloudflare secrets and pushes release
  tags from their own machine; cloud sessions can't sign in to Cloudflare or push tags.
- Ask the maintainer before deleting Cloudflare resources or secrets.
- Never store a visitor's IP address, raw User-Agent or precise coordinates: location is kept to
  0.1°, about a town (`tests/analytics.test.ts` checks this). Never commit secrets (`.secrets*.env`,
  `.dev.vars`).
