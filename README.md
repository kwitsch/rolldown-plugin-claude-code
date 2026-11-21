# rolldown-plugin-claude-code

Build Claude Code plugins with Rolldown and tsdown. Status: M0 bootstrap — the workspace and tooling are in place, no functionality yet.

## Packages

| Directory                  | npm name                               | Role                                         | Depends on                             |
| -------------------------- | -------------------------------------- | -------------------------------------------- | -------------------------------------- |
| `packages/core`            | `@kwitsch/claude-code-plugin-core`     | Bundler-neutral core for Claude Code plugins | —                                      |
| `packages/rolldown-plugin` | `@kwitsch/rolldown-plugin-claude-code` | Rolldown plugin                              | `@kwitsch/claude-code-plugin-core`     |
| `packages/tsdown-preset`   | `@kwitsch/tsdown-preset-claude-code`   | tsdown preset                                | `@kwitsch/rolldown-plugin-claude-code` |

Dependency direction: preset -> plugin -> core.

## Runtime requirements

Generated hooks start via `node`, so users of a built plugin need Node 26 or newer in their `PATH`.

## MCP servers

Set `mcpTemplate` to a `.mcp.json` template: a server whose `command` is a relative `.ts` or `.mts` path is bundled to `mcp/<name>.mjs` and started as `node` with `${CLAUDE_PLUGIN_ROOT}/mcp/<name>.mjs` as its first argument; all other servers are copied unchanged, and without `mcpTemplate` no `.mcp.json` is generated.

```ts
// tsdown.config.ts
import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({
  hooksTemplate: "hooks.template.json",
  mcpTemplate: "mcp.template.json",
});
```

```jsonc
// mcp.template.json
{
  "mcpServers": {
    "db": {
      "command": "./src/server.ts",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": { "DB_URL": "${DB_URL}" }
    },
    "docs": { "type": "http", "url": "https://example.com/mcp" }
  }
}
```

```jsonc
// plugin/.mcp.json
{
  "mcpServers": {
    "db": {
      "command": "node",
      "args": [
        "${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs",
        "--config",
        "${CLAUDE_PLUGIN_ROOT}/config.json"
      ],
      "env": { "DB_URL": "${DB_URL}" }
    },
    "docs": { "type": "http", "url": "https://example.com/mcp" }
  }
}
```

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
