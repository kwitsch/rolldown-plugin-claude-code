---
"@kwitsch/rolldown-plugin-claude-code": minor
"@kwitsch/tsdown-preset-claude-code": minor
---

BREAKING: copy every `files` entry with mode 0644 whatever the source mode (an executable source no longer stays executable), set tsdown's `nodeProtocol: true` by default so bundled dependencies that import Node builtins without `node:` pass the layout check, and make the layout check name the `node:` import and the `nodeProtocol` option when it rejects a bare builtin.
