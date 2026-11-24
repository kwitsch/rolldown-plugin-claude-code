---
"@kwitsch/rolldown-plugin-claude-code": patch
"@kwitsch/tsdown-preset-claude-code": patch
---

Copy every `files` entry with mode 0644 whatever the source mode, and set tsdown's `nodeProtocol: true` by default so bundled dependencies that import Node builtins without `node:` pass the layout check.
