---
paths:
  - "e2e/**"
---

# End-to-end tests

- `e2e` runs against the real Claude Code CLI (`claude` on `PATH`; `claude.ts` is the vitest global setup and fails with an install hint when it is missing). It is not part of `pnpm test`; run `pnpm test:e2e`.
- `validate.test.ts` runs `claude plugin validate --strict` on every fixture's `expected/`. `rules.test.ts` compares the CLI's verdict with `validateManifest` from core for the same manifest. A new or changed manifest rule in core needs a case in `rules.test.ts`.
- Compare only `manifest.errors` and `manifest.warnings` from the CLI report; directory findings flag README and LICENSE even without a profile.
- `live.test.ts` runs the CLI for real and is skipped without `ANTHROPIC_API_KEY`. Keep its prompts tiny and tools disabled.
- A nightly e2e run against the latest CLI catches format drift; a failure there opens a `format-drift` issue. Treat a drift failure as a core rule change to investigate, not a flaky test.
