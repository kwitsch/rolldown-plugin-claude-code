# @kwitsch/tsdown-preset-claude-code

tsdown preset for building Claude Code plugins. It turns a project with a `package.json`, TypeScript sources, optional hooks and MCP templates and an `assets` folder into a finished plugin directory: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, one minified file per hook, server and script, and a final layout check.

This is the recommended entry point. It wraps [`@kwitsch/rolldown-plugin-claude-code`](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/rolldown-plugin#readme) and generates one tsdown config per entry, so you do not write Rolldown inputs and output names by hand.

## Installation

```sh
pnpm add -D @kwitsch/tsdown-preset-claude-code tsdown
```

- **Compatibility:** Node 26 or newer, tsdown `~0.23.7`. Claude Code is checked nightly against its latest release.
- **Runtime:** generated hooks start via `node`, so users of a built plugin need Node 26 or newer in their `PATH`.
- **pnpm 11:** the default `minimumReleaseAge` (1 day) delays installing a fresh release; add `minimumReleaseAgeExclude: ["@kwitsch/*"]` to your `pnpm-workspace.yaml` to install it immediately.
- **From GitHub Packages:** version 0.1.0 was published to GitHub Packages only. If you installed it from there, remove the line `@kwitsch:registry=https://npm.pkg.github.com` from your `.npmrc` (and the token, if you set it only for this: `pnpm config delete "//npm.pkg.github.com/:_authToken"`), raise the packages to the latest version and run `pnpm install`; the tarball addresses in your lockfile change.

## Quick start

```text
my-plugin/
├─ package.json
├─ tsdown.config.ts
├─ hooks.template.json
├─ src/
│  ├─ register.ts
│  └─ pre-tool.ts
└─ assets/
   └─ skills/hello/SKILL.md
```

```ts
// tsdown.config.ts
import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({ hooksTemplate: "hooks.template.json" });
```

```json
{
  "mod": "./src/register.ts",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./src/pre-tool.ts",
            "args": ["--verbose"]
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "echo done" }]
      }
    ]
  }
}
```

```json
{
  "name": "@acme/my-plugin",
  "version": "1.0.0",
  "description": "My Claude Code plugin.",
  "license": "MIT",
  "author": "Acme",
  "type": "module",
  "scripts": { "build": "tsdown" }
}
```

`pnpm build` writes:

```text
plugin/
├─ .claude-plugin/plugin.json   # name "my-plugin", version, description, author, license
├─ hooks/
│  ├─ hooks.json                # "modules": ["./register.js"], command rewritten to node
│  ├─ register.js               # the mod
│  └─ pre-tool.mjs              # the command hook, mode 0755, with shebang
└─ skills/hello/SKILL.md        # copied from assets
```

```json
{
  "modules": ["./register.js"],
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool.mjs", "--verbose"]
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "echo done" }]
      }
    ]
  }
}
```

Test the result with `claude --plugin-dir plugin`.

## Options

`pluginConfig(options)` returns a promise of tsdown configs; export it with `export default await`. A project that defines no mod, command script, MCP server, bin or skill script and no bundle fails with "nothing to build".

| Option          | Default         | Meaning                                                                                                                  |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `root`          | `process.cwd()` | Project root that holds `package.json`.                                                                                  |
| `outDir`        | `"plugin"`      | Plugin output directory, relative to `root`. It is removed before every build and must not contain the root or a source. |
| `strict`        | `true`          | Treat warnings as errors.                                                                                                |
| `validate`      | `"auto"`        | Run `claude plugin validate --strict` after the build: `true`, `false`, or `"auto"` (only when `claude` is on `PATH`).   |
| `overrides`     | `{}`            | Extra tsdown options applied to every generated config before the generated fields.                                      |
| `hooksTemplate` | —               | Path of the hooks template, relative to `root`. See [Hooks template](#hooks-template).                                   |
| `mcpTemplate`   | —               | Path of the `.mcp.json` template, relative to `root`. See [MCP servers](#mcp-servers).                                   |
| `manifest`      | —               | Fields that override or extend the generated `plugin.json`. See [Manifest](#manifest).                                   |
| `assets`        | `"assets"`      | Folder copied unchanged into the plugin. A missing default folder is fine; a missing explicit folder is `path-missing`.  |
| `scripts`       | —               | `bin` and `skills` scripts. See [Bin and skill scripts](#bin-and-skill-scripts).                                         |
| `bundles`       | —               | Shared bundles. See [Bundles and files](#bundles-and-files).                                                             |
| `files`         | —               | Single files to copy. See [Bundles and files](#bundles-and-files).                                                       |

With `validate` enabled, the check has a 30 second timeout; a failure aborts the build with a hint to set `validate: false`.

## Manifest

`plugin.json` is generated from `package.json`:

- `name` without its scope (`@acme/my-plugin` becomes `my-plugin`); a missing name is `name-missing`.
- `version`, `description` (trimmed), `keywords`, `homepage` and `license` as they are.
- `author` as `{ name, email, url }`; a string such as `"Jane <jane@example.com> (https://example.com)"` is parsed. An author without a name is dropped with an `author-invalid` warning.
- `repository` as an `http(s)` URL; anything else is dropped with a `repository-invalid` warning.

Every field in `manifest` wins over the mapped value, and fields `package.json` has no equivalent for (for example `commands`, `agents`, `skills`, `outputStyles`) go there too. Paths in the manifest must exist in the built plugin, so the files usually come from `assets`.

```ts
// tsdown.config.ts
import { pluginConfig } from "@kwitsch/tsdown-preset-claude-code";

export default await pluginConfig({
  hooksTemplate: "hooks.template.json",
  manifest: { name: "acme", agents: ["./agents/reviewer.md"] },
});
```

## Hooks template

The hooks template is the `hooks/hooks.json` you would write by hand, with TypeScript paths instead of built files. Paths in it are relative to the template's directory.

- **`mod`:** a relative path to a `.ts`, `.mts` or `.tsx` file. It is built to `hooks/<name>.js` and becomes `"modules": ["./<name>.js"]`. Do not write `modules` yourself; it is `template-invalid`. A mod has no shebang and keeps only `claude-code` external. Claude Code itself accepts only relative imports and `claude-code` in a mod, so keep `node:*` imports out of it; imported helpers are inlined.
- **Command hooks:** a hook of type `command` whose `command` is a relative `.ts` or `.mts` path is built to `hooks/<name>.mjs` and rewritten to `"command": "node"` with `${CLAUDE_PLUGIN_ROOT}/hooks/<name>.mjs` as the first argument. Put arguments into `args`, never into `command`. Two hooks that share a source share the output.
- **`hookTypes`:** a path to a generated file with the input types of `mcp_tool` hooks. It is written by the CLI; see [`@kwitsch/claude-code-plugin-cli`](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/cli#readme).
- Everything else, including `command` hooks that run a shell command, is copied unchanged.

A built command script is one minified ESM file with a `#!/usr/bin/env node` shebang and mode `0755`; imported helpers are inlined and only `node:*` imports stay external. The preset sets tsdown's `nodeProtocol: true`, so a bare builtin import such as `fs` in a dependency becomes `node:fs`.

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

## Assets

Everything in the `assets` folder is copied into the plugin with its relative path and file mode, so a shell script in `assets/bin/` stays executable. Symlinks are not copied (`path-invalid` warning). Use it for `SKILL.md` files, agents, commands, output styles and any other static file the manifest points to.

## Problems

Every problem is printed with its severity and code, and the build fails on any error, or on any warning under `strict`:

```text
[claude-code] 2 problems
  error    path-missing  hooks.template.json: script "src/pre-tool.ts" not found
  warning  entry-unused  assets/skills/hello/SKILL.md: "hello.mjs" is not named in SKILL.md
```

The full list of codes is documented in [`@kwitsch/claude-code-plugin-core`](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/core#issues).

Releases are published from GitHub Actions with npm provenance: the package page on npmjs links the commit and the workflow run that built each version.
