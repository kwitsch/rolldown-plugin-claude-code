---
"@kwitsch/claude-code-plugin-cli": minor
"@kwitsch/claude-code-plugin-core": minor
---

`claude-code-hook-types` warns about `${...}` placeholders in `mcp_tool` hook `input` that are not fields of the event's hook input, and the new `--strict` option fails on them; core exports the check as `checkHookPlaceholders` with the new issue code `hook-placeholder-unknown`.
