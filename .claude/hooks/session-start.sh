#!/bin/bash
# Cloud sessions (claude.ai/code) start from a fresh clone, so install the
# dependencies and a .dev.vars for `pnpm dev`. Local sessions skip this.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
pnpm install --frozen-lockfile > /dev/null
[ -f .dev.vars ] || cp .dev.vars.example .dev.vars
