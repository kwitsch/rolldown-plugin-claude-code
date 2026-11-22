---
paths:
  - "fixtures/**"
---

# Fixtures

- Each fixture is a private workspace package named `@fixtures/<name>`, built with the preset (or plain rolldown for `mod-only`). `expected/` is the golden output and is committed; `plugin/` is the build output and is git-ignored.
- Every fixture `package.json` needs `"author": "Kwitsch"` (string form, after `license`). The real `claude plugin validate --strict` fails without it, and the golden `plugin.json` then carries `author: { name }`.
- The fixture `test` script compares `expected` with `plugin` and checks executable bits. After a change that alters output, rebuild the fixture, review the diff, and copy `plugin/` to `expected/` deliberately; never edit goldens by hand to make a test pass.
- A hooks module (a `mod`) may import only relative paths and `claude-code`; the real CLI rejects even `node:fs`. Shared modules that get inlined into a mod must be pure. Only scripts (`bin`, skill scripts) may import `node:*`.
- Keep fixtures minimal: one fixture per feature combination, and no fixture depends on another.
- `fixtures/*/expected` and `fixtures/*/plugin` are excluded from dprint and oxlint; do not reformat them.
