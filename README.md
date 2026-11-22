# rolldown-plugin-claude-code

Build Claude Code plugins with Rolldown and tsdown.

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

Set `scripts.bin` to TypeScript files that are built to `bin/<name>.mjs`, and `scripts.skills` to a map from a skill name to TypeScript files that are built to `skills/<skill>/<name>.mjs`. Unlike template paths, these paths are relative to the project root. Imported helpers are inlined, and the same build rules as for command hooks apply: one minified ESM file per script, a `#!/usr/bin/env node` shebang, mode `0755` and only `node:*` imports left external.

```ts
// tsdown.config.ts
import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({
  hooksTemplate: "hooks.template.json",
  scripts: {
    bin: ["src/bin/doctor.ts"],
    skills: {
      dprint: [
        "src/skills/dprint/run-dprint.ts",
        "src/skills/dprint/check-dprint.ts",
      ],
    },
  },
});
```

The `SKILL.md` stays hand-written in `assets/skills/<skill>/SKILL.md` and calls the script as `node ${CLAUDE_SKILL_DIR}/run-dprint.mjs`. A skill without that `SKILL.md` fails the build with `path-missing`, and a `SKILL.md` that does not name `<name>.mjs` gets an `entry-unused` warning, which fails the build under `strict`.

- Claude Code adds `bin/` to the PATH of the Bash tool; the command is named like the file, for example `doctor.mjs`.
- claude.ai rejects any plugin with a top-level `bin/` when it is distributed through organization settings (see [Host a marketplace](https://code.claude.com/docs/en/plugins/host-marketplace)). The build does not warn about this.

## Installation

The packages are published to GitHub Packages. Add an `.npmrc` to your project:

```ini
@kwitsch:registry=https://npm.pkg.github.com
```

Store the token in your user-level configuration, not in the project (pnpm 11 ignores credentials in a project `.npmrc`):

```sh
pnpm config set "//npm.pkg.github.com/:_authToken" "$GITHUB_TOKEN"
```

Then install the preset together with tsdown:

```sh
pnpm add -D @kwitsch/tsdown-preset-claude-code tsdown
```

- **Token:** GitHub Packages requires a personal access token (classic) with the `read:packages` scope, even for public packages (see [Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)). Keep it out of the project; the command above writes it to your user-level config. In GitHub Actions run that command with the workflow's `GITHUB_TOKEN`; locally use your personal token.
- **Which package:** use the preset `@kwitsch/tsdown-preset-claude-code` with tsdown, the plugin `@kwitsch/rolldown-plugin-claude-code` alone to use Rolldown directly, and the core `@kwitsch/claude-code-plugin-core` only for your own tooling.
- **Compatibility:** Node 26 or newer, tsdown `~0.23.7`, Rolldown `^1.3.0`. Claude Code is checked nightly against its latest release.
- **pnpm 11:** the default `minimumReleaseAge` (1 day) delays installing a fresh release; add `minimumReleaseAgeExclude: ["@kwitsch/*"]` to your `pnpm-workspace.yaml` to install it immediately.
- **Outlook:** from v1.0.0 the packages are also published to npmjs, then without a token.

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

## Releases

Releases use [Changesets](https://github.com/changesets/changesets). The three packages form a fixed group and always share one version.

- Every pull request that changes a file in `packages/*` needs a changeset: run `pnpm changeset` and commit the generated file. CI checks this with `pnpm changeset status`.
- Changes that need no release (tests, internal refactors, package docs) get an empty changeset: `pnpm changeset --empty`.
- After a merge to `main`, the `release` workflow opens or updates the "Version Packages" pull request with the bumped versions and changelogs.
- Merging that pull request publishes all three packages to GitHub Packages with the same version, pushes one git tag per package and creates one GitHub release per package.

### Maintainer setup

1. Create a GitHub App with the repository permissions Contents and Pull requests set to read and write, and install it on this repository only. Copy its **Client ID** from the GitHub App page (it sits next to the App ID and is a different value) into the repository variable `RELEASE_APP_CLIENT_ID` (Settings -> Secrets and variables -> Actions -> Variables), and store a private key of the App in the repository secret `RELEASE_APP_PRIVATE_KEY`. The `release` workflow stays inactive until the variable exists; the Version Packages pull request opens on the next push to `main` after that.
2. Enable "Allow auto-merge" (Settings -> General -> Pull Requests). Dependabot pull requests rely on it.
3. Protect `main`: require a pull request and the status checks of the `ci` and `e2e` workflows, including the `changeset` job.

## License

MIT
