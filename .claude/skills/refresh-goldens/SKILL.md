---
name: refresh-goldens
description: Rebuild the fixtures and update their golden `expected/` directories after a deliberate change to the build output, such as a core change or a rolldown bump. Use when a fixture `test` fails with a diff between `expected` and `plugin`.
---

# refresh-goldens

Goldens are `fixtures/<name>/expected/`; build output is `fixtures/<name>/plugin/` (git-ignored). Never update goldens just to silence a failing test: first decide whether the diff is intended.

1. `pnpm build`, then `pnpm --filter "./fixtures/*" test` to see which fixtures differ.
2. For each failing fixture run `diff -r fixtures/<name>/expected fixtures/<name>/plugin` and read the diff. Intended changes (a new manifest field, a rolldown output change) continue; anything else is a bug to fix in the code, not in the golden.
3. Replace the golden: `rm -rf fixtures/<name>/expected && cp -r fixtures/<name>/plugin fixtures/<name>/expected`. For `mcp-server`, the `mcp/` directory is excluded from the comparison (`diff -x mcp`); copy it anyway so the golden stays complete.
4. Re-run `pnpm --filter "./fixtures/*" test`, then `pnpm test:e2e` (the validate case builds on `plugin/`).
5. Commit the goldens together with the code change that caused them, in the same commit, and mention the reason in the message.

The goldens are excluded from dprint and oxlint; do not reformat them.
