# rolldown-plugin-claude-code

Build Claude Code plugins with Rolldown and tsdown. Usage, options and examples live in the README of each package.

## Packages

| Package                                                                      | Directory                  | Role                                                      | Depends on                                                                 |
| ---------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`@kwitsch/tsdown-preset-claude-code`](packages/tsdown-preset/README.md)     | `packages/tsdown-preset`   | tsdown preset; the recommended way to build a plugin      | `@kwitsch/rolldown-plugin-claude-code`, `@kwitsch/claude-code-plugin-core` |
| [`@kwitsch/rolldown-plugin-claude-code`](packages/rolldown-plugin/README.md) | `packages/rolldown-plugin` | Rolldown plugin for builds without tsdown                 | `@kwitsch/claude-code-plugin-core`                                         |
| [`@kwitsch/claude-code-plugin-cli`](packages/cli/README.md)                  | `packages/cli`             | CLI `claude-code-hook-types` that writes hook input types | `@kwitsch/claude-code-plugin-core`                                         |
| [`@kwitsch/claude-code-plugin-core`](packages/core/README.md)                | `packages/core`            | Bundler-neutral core: manifest, templates, validation     | —                                                                          |

Peer dependencies: the preset needs `tsdown` `~0.23.7`, the Rolldown plugin needs `rolldown` `^1.3.0`. All packages need Node 26 or newer.

```text
tsdown-preset ──> rolldown-plugin ──> core
      └───────────────────────────────> core
cli ──────────────────────────────────> core
```

## Repository structure

```text
.
├─ packages/
│  ├─ core/              # @kwitsch/claude-code-plugin-core
│  ├─ rolldown-plugin/   # @kwitsch/rolldown-plugin-claude-code
│  ├─ tsdown-preset/     # @kwitsch/tsdown-preset-claude-code
│  └─ cli/               # @kwitsch/claude-code-plugin-cli
├─ fixtures/             # example plugins built in CI, each with its golden output in expected/
├─ e2e/                  # end-to-end tests: validates the fixtures with the real Claude Code CLI
├─ .changeset/           # pending changesets for the next release
├─ .github/              # CI, e2e, release and Dependabot workflows
├─ .claude/              # Claude Code rules and skills for working on this repository
├─ CONTRIBUTING.md       # development, releases and maintainer setup
└─ LICENSE               # MIT
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, releases and the maintainer setup.
