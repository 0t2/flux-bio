# Security

## Reporting a vulnerability

Please don't open a public issue. Report it privately on GitHub: this repository's **Security** tab → **Report a vulnerability**.

Say what someone could do, how to reproduce it, and which version or commit you tested.

Worth reporting, for example:

- reading or changing a site without signing in, or getting past an API token's scope;
- running script on a public page or in the dashboard through someone's content;
- a visitor's IP address, raw User-Agent or precise location being stored anywhere.

Problems in Cloudflare's own platform belong with [Cloudflare](https://www.cloudflare.com/disclosure/).

## How fixes reach a site

FluxBio has no central service. Each owner runs their own copy on their own Cloudflare account, so nobody else can see or patch their site. A fix reaches a site when its owner deploys the new version, and fixes go into the latest version only.

## If your own site is affected

- **A leaked API token:** revoke it on 設定 (Settings) in the dashboard and make a new one.
- **A leaked admin password:** change it (see section 1.8 of [AGENTS.md](AGENTS.md)). This signs everyone out and revokes every API token.
