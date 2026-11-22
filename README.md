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

## Bin and skill scripts

Set `bin` to TypeScript files that are built to `bin/<name>.mjs`, and `skillScripts` to a map from a skill name to TypeScript files that are built to `skills/<skill>/<name>.mjs`. Unlike template paths, these paths are relative to the project root. Imported helpers are inlined, and the same build rules as for command hooks apply: one minified ESM file per script, a `#!/usr/bin/env node` shebang, mode `0755` and only `node:*` imports left external.

```ts
// tsdown.config.ts
import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({
  hooksTemplate: "hooks.template.json",
  bin: ["src/bin/doctor.ts"],
  skillScripts: {
    dprint: [
      "src/skills/dprint/run-dprint.ts",
      "src/skills/dprint/check-dprint.ts",
    ],
  },
});
```

The `SKILL.md` stays hand-written in `assets/skills/<skill>/SKILL.md` and calls the script as `node ${CLAUDE_SKILL_DIR}/run-dprint.mjs`. A skill without that `SKILL.md` fails the build with `path-missing`, and a `SKILL.md` that does not name `<name>.mjs` gets an `entry-unused` warning, which fails the build under `strict`.

- Claude Code adds `bin/` to the PATH of the Bash tool; the command is named like the file, for example `doctor.mjs`.
- claude.ai rejects any plugin with a top-level `bin/` when it is distributed through organization settings (see [Host a marketplace](https://code.claude.com/docs/en/plugins/host-marketplace)). The build does not warn about this.

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
