---
paths:
  - "**/*"
---

# Working on this repository

- Run all gates before committing: `pnpm format:check`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. Run `pnpm test:e2e` too when a core rule, a fixture or a template renderer changed. Re-run every gate after a fix that follows a review; an unused import after a fix breaks lint.
- Commit messages follow Conventional Commits in English: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, optional scope (`core`, `plugin`, `preset`, `fixtures`), `!` for breaking changes. One commit per logical task. Never amend or force-push a pushed branch; add a new commit.
- Work happens on a branch and lands through a pull request into `main`. Never push to `main` directly; the release workflow reacts to every push there.
- Never commit secrets, `plugin/` build output, `dist/` or `e2e/report.json`.
- Do not run commands that publish, tag or delete remote refs, packages or releases without the maintainer's explicit go-ahead.
