---
paths:
  - "README.md"
  - "CONTRIBUTING.md"
  - "packages/*/README.md"
---

# Documentation

- Each package README is the user documentation of its package: installation, usage, options and runnable examples. The preset README documents the `PluginConfig` options and the build flow, the Rolldown plugin README direct Rolldown use, the CLI README `hookTypes` and the command, the core README the API and every issue code. Each topic lives in one README; the others link to it.
- Package READMEs are shown on npmjs, so links out of them are absolute GitHub URLs (`https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/<dir>#<anchor>`). The root `README.md` uses relative links.
- The root `README.md` contains only the repository structure and the package dependencies, and links to each package README. Development, releases and the maintainer setup live in `CONTRIBUTING.md`.
- Option names, the `PluginConfig` shape (`hooksTemplate`, `mcpTemplate`, `scripts.bin`, `scripts.skills`, `manifest`, `assets`, `bundles`, `files`), the hooks template fields (`mod`, `hookTypes`) and issue codes in the docs must match `packages/core/src`. Change both in one commit.
- Examples are runnable: a config snippet should be accepted by the current types, and a shell snippet should work as written.
- Fenced code blocks always carry a language (markdownlint MD040).
- The "Maintainer setup" section in `CONTRIBUTING.md` lists the one-time repository settings (GitHub App, auto-merge, protection of `main`). Keep it in line with `.github/workflows`.
- Formatting is dprint's job: run `pnpm format` instead of hand-wrapping. A block that must show exact generated output gets `<!-- dprint-ignore -->` above it.
