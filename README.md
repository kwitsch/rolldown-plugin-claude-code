# rolldown-plugin-claude-code

Build Claude Code plugins with Rolldown and tsdown. Status: M0 bootstrap — the workspace and tooling are in place, no functionality yet.

## Packages

| Directory                  | npm name                               | Role                                         | Depends on                             |
| -------------------------- | -------------------------------------- | -------------------------------------------- | -------------------------------------- |
| `packages/core`            | `@kwitsch/claude-code-plugin-core`     | Bundler-neutral core for Claude Code plugins | —                                      |
| `packages/rolldown-plugin` | `@kwitsch/rolldown-plugin-claude-code` | Rolldown plugin                              | `@kwitsch/claude-code-plugin-core`     |
| `packages/tsdown-preset`   | `@kwitsch/tsdown-preset-claude-code`   | tsdown preset                                | `@kwitsch/rolldown-plugin-claude-code` |

Dependency direction: preset -> plugin -> core.

## Development

Target runtime is Node 26; pnpm is pinned via the `packageManager` field.

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm format
pnpm format:check
```

Installation instructions (GitHub Packages) follow with the first release.

## License

MIT
