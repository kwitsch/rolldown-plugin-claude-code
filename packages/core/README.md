# @kwitsch/claude-code-plugin-core

Bundler-neutral core for building Claude Code plugins: it maps `package.json` to a plugin manifest, renders the hooks and MCP templates, resolves script and bundle entries, generates hook input types and validates the manifest and the built layout. It has no dependencies and, apart from `validateLayout`, does no file system access.

To build a plugin, use [`@kwitsch/tsdown-preset-claude-code`](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/tsdown-preset#readme) or [`@kwitsch/rolldown-plugin-claude-code`](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/rolldown-plugin#readme). Use the core directly only for your own tooling, for example another bundler integration or a custom check.

## Installation

```sh
pnpm add @kwitsch/claude-code-plugin-core
```

Requires Node 26 or newer.

## Example

```ts
import {
  pluginManifest,
  renderHooksTemplate,
  validateManifest,
} from "@kwitsch/claude-code-plugin-core";

const { manifest, issues } = pluginManifest(
  {
    name: "@acme/my-plugin",
    version: "1.0.0",
    author: "Acme <dev@acme.example>",
  },
  { keywords: ["example"] },
);
// manifest: { name: "my-plugin", version: "1.0.0", author: { name: "Acme", email: "dev@acme.example" }, keywords: ["example"] }
const problems = [
  ...issues,
  ...(manifest === undefined ? [] : validateManifest(manifest)),
];

const hooks = renderHooksTemplate({
  mod: "./src/register.ts",
  hooks: {
    PreToolUse: [{
      matcher: "Bash",
      hooks: [{ type: "command", command: "./src/pre-tool.ts" }],
    }],
  },
});
// hooks.entries: [{ kind: "mod", source: "src/register.ts", output: "hooks/register.js" },
//                 { kind: "script", source: "src/pre-tool.ts", output: "hooks/pre-tool.mjs" }]
// hooks.hooksJson.modules: ["./register.js"]
// the command hook becomes { type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool.mjs"] }
console.log(problems, hooks.issues);
```

## API

Every function except `validateLayout` is pure and none throws on bad input; each returns its result together with a list of `Issue`s. Paths in entries are POSIX paths, relative to the template's directory (templates) or to the project root (scripts and bundles).

| Function                                        | Returns                                     | Purpose                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pluginManifest(pkg, overrides?)`               | `{ manifest, issues }`                      | Maps `package.json` fields to a `PluginManifest`; `overrides` win. `manifest` is `undefined` without a name.                       |
| `validateManifest(manifest)`                    | `readonly Issue[]`                          | Checks name, author, homepage, field types, component paths and unknown fields.                                                    |
| `renderHooksTemplate(template)`                 | `{ hooksJson, entries, hookTypes, issues }` | Turns `mod` into `modules`, rewrites TypeScript command hooks to `node` and lists the entries to build.                            |
| `renderMcpTemplate(template)`                   | `{ mcpJson, entries, issues }`              | Rewrites MCP servers whose `command` is a TypeScript file to `node mcp/<name>.mjs`.                                                |
| `renderHookInputTypes(template)`                | `{ source, issues }`                        | Generates the TypeScript source with the `input` types of all `mcp_tool` hooks of a hooks template.                                |
| `scriptEntries({ scripts })`                    | `{ entries, issues }`                       | Maps `scripts.bin` and `scripts.skills` to `bin/<name>.mjs` and `skills/<skill>/<name>.mjs`.                                       |
| `bundleEntries({ bundles, files })`             | `{ entries, files, issues }`                | Maps shared bundles to `<folder>/index.mjs` and checks the `files` copies.                                                         |
| `validateLayout({ outDir, manifest, entries })` | `Promise<readonly Issue[]>`                 | Checks a built plugin directory: `plugin.json`, the paths named in the manifest, `hooks.json`, `.mcp.json` and every entry output. |

Exported types: `PluginConfig` (the project options shared by the preset and the Rolldown plugin), `PluginManifest`, `PluginAuthor`, `PluginDependency`, `PackageJson`, `PackageAuthor`, `PackageRepository`, `BuildEntry` (`kind` is `"mod"`, `"script"` or `"bundle"`), `FileCopy`, `LayoutInput`, `Issue`, `IssueCode`, `IssueSeverity` and the result type of each function.

## Issues

An `Issue` has a `severity` (`"error"` or `"warning"`), a `code`, a `message` and optionally the JSON `path` inside the checked object and the `file` it belongs to. `ISSUE_CODES` lists every code:

| Code                 | Meaning                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name-missing`       | `package.json` has no usable name and `manifest.name` is not set; no manifest is produced.                                                                                                                              |
| `name-invalid`       | The plugin name is not a valid name (error) or not kebab-case (warning).                                                                                                                                                |
| `name-reserved`      | The plugin name uses a word reserved for official plugins, such as `claude` or `anthropic`.                                                                                                                             |
| `author-invalid`     | The author has no name.                                                                                                                                                                                                 |
| `homepage-invalid`   | `homepage` is not a valid URL.                                                                                                                                                                                          |
| `repository-invalid` | `repository` is not an `http(s)` URL; it is left out of the manifest.                                                                                                                                                   |
| `field-unknown`      | The manifest has a field Claude Code does not know (warning).                                                                                                                                                           |
| `field-type`         | A manifest field or a `scripts`, `bundles` or `files` value has the wrong type.                                                                                                                                         |
| `path-invalid`       | A path is absolute, contains `..`, is not a `.ts`/`.mts` source where one is required, or points to a file where a directory is expected (or the reverse); a symlink in the assets folder is skipped with this warning. |
| `path-missing`       | A template, source, assets folder, `SKILL.md` or built file does not exist.                                                                                                                                             |
| `template-invalid`   | A template is not valid JSON or has an invalid field, such as arguments inside `command` or a hand-written `modules`.                                                                                                   |
| `entry-conflict`     | Two entries, files or bundles would write the same output, or an output lies inside a bundle folder.                                                                                                                    |
| `entry-unused`       | A skill script is not named in its `SKILL.md` (warning).                                                                                                                                                                |
| `hook-input-invalid` | With `hookTypes` set, an `mcp_tool` hook lacks a string `server`, a string `tool` or an object `input`.                                                                                                                 |
| `hook-types-stale`   | The file named by `hookTypes` is missing or differs from what the template generates.                                                                                                                                   |

Releases are published from GitHub Actions with npm provenance: the package page on npmjs links the commit and the workflow run that built each version.
