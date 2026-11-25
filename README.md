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

## Bundles and files

Set `bundles` to a map from an output folder to the TypeScript entry of a shared bundle, relative to the project root. The bundle is built once: its entry goes to `<folder>/index.mjs` and every chunk it loads with `import()` to `<folder>/[name]-[hash].mjs`. Scripts import the bundle's source entry as usual, for example `import { prettier } from "./vendor/index.js"`; the build keeps that import external and rewrites it to the relative path of the built entry, so the bundle is shared instead of inlined. Types come from the real source, and aliases that point to the entry work too.

Set `files` to a map from an output path to a single source file that is copied there. A source may be absolute or relative to the project root, which lets the config resolve runtime files of a dependency from `node_modules`.

```ts
// tsdown.config.ts
import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const javaEntry = require.resolve("prettier-plugin-java");

export default await pluginConfig({
  mcpTemplate: "mcp.template.json",
  scripts: {
    skills: {
      "universal-format": ["src/skills/universal-format/format-files.ts"],
    },
  },
  bundles: { "mcp/vendor": "src/mcp/vendor/index.ts" },
  files: {
    "mcp/vendor/web-tree-sitter.wasm": createRequire(javaEntry).resolve(
      "web-tree-sitter/web-tree-sitter.wasm",
    ),
    "mcp/vendor/tree-sitter-java_orchard.wasm": path.join(
      path.dirname(javaEntry),
      "tree-sitter-java_orchard.wasm",
    ),
    "mcp/main.wasm": createRequire(require.resolve("prettier-plugin-sh"))
      .resolve("sh-syntax/main.wasm"),
  },
});
```

```text
plugin/
├─ .claude-plugin/plugin.json
├─ .mcp.json
├─ mcp/
│  ├─ server.mjs                    # imports "./vendor/index.mjs"
│  ├─ main.wasm                     # from files
│  └─ vendor/
│     ├─ index.mjs                  # bundle entry
│     ├─ prettier-<hash>.mjs        # chunks
│     ├─ web-tree-sitter.wasm       # from files
│     └─ tree-sitter-java_orchard.wasm
└─ skills/universal-format/
   ├─ SKILL.md                      # from assets
   └─ format-files.mjs              # imports "../../mcp/vendor/index.mjs"
```

Bundle rules:

- Import only the bundle's source entry; it is the bundle's only interface. Importing another file from the entry's folder fails the build, because that code would be inlined a second time.
- A bundle is ESM, fully minified, without comments, without a shebang and keeps mode `0644`. Dependencies are inlined, dynamic `import()` is allowed, and only `node:*` imports and the bundle's own chunks stay external. The preset sets tsdown's `nodeProtocol: true` for every build, so a bare builtin import such as `fs` in a dependency becomes `node:fs`; `overrides.nodeProtocol` changes it.
- Two bundle folders must not be equal or nested, and no other entry output, asset or `.mjs` file from `files` may lie inside a bundle folder (`entry-conflict`): chunk names are not known before the build.
- Mods must not import a bundle; such an import fails the build.

`files` rules:

- Every copy gets mode `0644`, whatever the mode of its source; put a file that must stay executable into `assets`.
- Only single files are copied; a missing source or a directory is `path-missing`. Put whole folders into `assets` or list their files.
- A target must be relative without `..` (`path-invalid`) and must not equal a generated file, an entry output or an asset (`entry-conflict`). Non-`.mjs` files may go into a bundle folder, next to its chunks.
- Copies happen in the build that writes the metadata, after the assets; in watch mode every source is watched.

## Installation

The packages are published to npmjs. Install the preset together with tsdown:

```sh
pnpm add -D @kwitsch/tsdown-preset-claude-code tsdown
```

- **Which package:** use the preset `@kwitsch/tsdown-preset-claude-code` with tsdown, the plugin `@kwitsch/rolldown-plugin-claude-code` alone to use Rolldown directly, and the core `@kwitsch/claude-code-plugin-core` only for your own tooling.
- **Compatibility:** Node 26 or newer, tsdown `~0.23.7`, Rolldown `^1.3.0`. Claude Code is checked nightly against its latest release.
- **pnpm 11:** the default `minimumReleaseAge` (1 day) delays installing a fresh release; add `minimumReleaseAgeExclude: ["@kwitsch/*"]` to your `pnpm-workspace.yaml` to install it immediately.
- **From GitHub Packages:** version 0.1.0 was published to GitHub Packages only. If you installed it from there, remove the line `@kwitsch:registry=https://npm.pkg.github.com` from your `.npmrc` (and the token, if you set it only for this: `pnpm config delete "//npm.pkg.github.com/:_authToken"`), raise the packages to the latest version and run `pnpm install`; the tarball addresses in your lockfile change.

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

Releases use [Changesets](https://github.com/changesets/changesets). Each package has its own version: a changeset lists the packages whose users see the change, and Changesets also bumps every package that depends on a listed one.

- Every pull request that changes a file in `packages/*` needs a changeset: run `pnpm changeset` and commit the generated file. CI checks this with `pnpm changeset status`.
- Changes that need no release (tests, internal refactors, package docs) get an empty changeset: `pnpm changeset --empty`.
- After a merge to `main`, the `release` workflow opens or updates the "Version Packages" pull request with the bumped versions and changelogs.
- Merging that pull request publishes the packages with new versions to npmjs with provenance, pushes one git tag per published package and creates one GitHub release per published package.

### Maintainer setup

1. Create a GitHub App with the repository permissions Contents and Pull requests set to read and write, and install it on this repository only. Copy its **Client ID** from the GitHub App page (it sits next to the App ID and is a different value) into the repository variable `RELEASE_APP_CLIENT_ID` (Settings -> Secrets and variables -> Actions -> Variables), and store a private key of the App in the repository secret `RELEASE_APP_PRIVATE_KEY`. The `release` workflow stays inactive until the variable exists; the Version Packages pull request opens on the next push to `main` after that.
2. Enable "Allow auto-merge" (Settings -> General -> Pull Requests). Dependabot pull requests rely on it.
3. Protect `main`: require a pull request and the status checks of the `ci` and `e2e` workflows, including the `changeset` job.
4. Publishing to npmjs: the account that owns the scope `@kwitsch` has two-factor authentication on. For each package (`@kwitsch/claude-code-plugin-core`, `@kwitsch/rolldown-plugin-claude-code`, `@kwitsch/tsdown-preset-claude-code` and `@kwitsch/claude-code-plugin-cli`), add a trusted publisher under Settings -> Trusted publishing (GitHub Actions, user `kwitsch`, repository `rolldown-plugin-claude-code`, workflow `release.yml`, no environment), or with `npm trust github <package> --repo kwitsch/rolldown-plugin-claude-code --file release.yml --allow-publish`. The `release` job has no npm token: it publishes through OIDC with provenance and needs `id-token: write`. Keep the file name `release.yml`; renaming it breaks every entry. A trusted publisher needs a package that already exists on npm: before merging the first Version Packages pull request that bumps `@kwitsch/claude-code-plugin-cli`, publish its version `0.0.0` once by hand (`pnpm build` in the repository root, then `pnpm publish --access public` in `packages/cli`, which rewrites `workspace:*`; npm asks for the two-factor code) and add its trusted publisher for `release.yml`.

## License

MIT
