---
name: verify
description: Run every quality gate of this repository (format, build, lint, typecheck, unit tests, optionally e2e) and report which one failed. Use before committing, after a review fix, and before opening or updating a pull request.
---

# verify

Run from the repository root (or the current worktree), in this order, stopping at the first failure:

1. `pnpm format:check` (on failure: `pnpm format`, then re-run it)
2. `pnpm build`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm test:e2e` only when a core rule, a fixture, a template renderer or the preset changed. It needs `claude` on `PATH`; if it is missing, say so instead of skipping silently. The `live run` group is skipped without `ANTHROPIC_API_KEY`; report that as skipped.

Report one line per gate: pass, fail with the first error, or skipped with the reason. Do not commit or push. If `pnpm install` is needed in a fresh worktree (`node_modules` missing), run `pnpm install --frozen-lockfile` first.

Common causes: an unused import after a fix (lint), `package.json` keys reordered by dprint (`pnpm format`), stale goldens after an output change (use the `refresh-goldens` skill).
