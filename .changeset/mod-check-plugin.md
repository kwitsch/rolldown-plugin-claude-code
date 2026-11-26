---
"@kwitsch/rolldown-plugin-claude-code": minor
"@kwitsch/tsdown-preset-claude-code": minor
---

BREAKING: every mod build now runs the Claude Code mod check (`checkMod`), so a mod that imports `node:*`, a bare package or anything other than a relative path or `claude-code`, or that has no `register` export, fails the build with a `mod-invalid` problem; Claude Code itself rejects such mods at load time.
