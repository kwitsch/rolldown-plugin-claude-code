---
paths:
  - "README.md"
  - "packages/*/README.md"
---

# Documentation

- The root `README.md` documents every public option and the build flow; the package READMEs stay short and point to it. Option names, the `PluginConfig` shape (`hooksTemplate`, `mcpTemplate`, `scripts.bin`, `scripts.skills`, `manifest`, `assets`) and issue codes in the docs must match `packages/core/src`. Change both in one commit.
- Examples are runnable: a config snippet should be accepted by the current types, and a shell snippet should work as written.
- Fenced code blocks always carry a language (markdownlint MD040).
- The "Maintainer setup" section lists the one-time repository settings (GitHub App, auto-merge, protection of `main`). Keep it in line with `.github/workflows`.
- Formatting is dprint's job: run `pnpm format` instead of hand-wrapping.
