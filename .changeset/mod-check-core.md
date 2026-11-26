---
"@kwitsch/claude-code-plugin-core": minor
---

Add `checkMod(code, file)`, which checks a built hooks module against the Claude Code mod rules (including the required `register` export) and reports violations with the new issue code `mod-invalid`; core now depends on `es-module-lexer`.
