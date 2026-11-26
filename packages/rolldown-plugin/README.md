# @kwitsch/rolldown-plugin-claude-code

Rolldown plugin that builds Claude Code plugins. Each Rolldown build produces one entry of the plugin (a mod, a command hook, an MCP server, a bin or skill script, or a shared bundle); the plugin checks that output and writes `.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, the assets and the copied files.

With tsdown, use [`@kwitsch/tsdown-preset-claude-code`](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/tsdown-preset#readme) instead: it generates the Rolldown inputs, output names, shebangs and file modes described below. Use this package directly when you build with Rolldown yourself.

## Installation

```sh
pnpm add -D @kwitsch/rolldown-plugin-claude-code rolldown
```

Requires Node 26 or newer and Rolldown `^1.3.0`.

## Usage

A plugin with one mod:

```jsonc
// hooks.template.json
{
  "mod": "./src/register.ts",
  "hooks": {}
}
```

```ts
// rolldown.config.ts
import { claudeCode } from "@kwitsch/rolldown-plugin-claude-code";
import { defineConfig } from "rolldown";

export default defineConfig({
  input: { "hooks/register": "src/register.ts" },
  platform: "node",
  external: ["claude-code"],
  plugins: [claudeCode({ hooksTemplate: "hooks.template.json" })],
  output: {
    dir: "plugin",
    format: "es",
    entryFileNames: "[name].js",
    cleanDir: true,
  },
});
```

```sh
pnpm exec rolldown -c rolldown.config.ts
```

The result is `plugin/.claude-plugin/plugin.json` (from `package.json`), `plugin/hooks/hooks.json` with `"modules": ["./register.js"]` and the built `plugin/hooks/register.js`.

### Several entries

Every entry needs a build of its own, because each must be a single chunk with a fixed file name. Give exactly one build `emitMetadata: true` (the default) and all others `emitMetadata: false`:

```ts
// rolldown.config.ts
import { claudeCode } from "@kwitsch/rolldown-plugin-claude-code";
import { defineConfig } from "rolldown";

const options = { hooksTemplate: "hooks.template.json", strict: true };

export default defineConfig([
  {
    input: { "hooks/register": "src/register.ts" },
    platform: "node",
    external: ["claude-code"],
    plugins: [claudeCode(options)],
    output: {
      dir: "plugin",
      format: "es",
      entryFileNames: "[name].js",
      cleanDir: true,
    },
  },
  {
    input: { "hooks/pre-tool": "src/pre-tool.ts" },
    platform: "node",
    plugins: [claudeCode({ ...options, emitMetadata: false })],
    output: {
      dir: "plugin",
      format: "es",
      entryFileNames: "[name].mjs",
      banner: "#!/usr/bin/env node",
      minify: true,
    },
  },
]);
```

Here the hooks template has `"mod": "./src/register.ts"` and a command hook `"command": "./src/pre-tool.ts"`; see the [preset README](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/tsdown-preset#hooks-template) for how templates are rewritten.

### Rules for each build

- **Input name:** the output path without its extension, for example `hooks/register` for a mod, `hooks/pre-tool` for a command hook, `mcp/server` for an MCP server, `bin/doctor` or `skills/<skill>/<name>` for scripts and `<folder>/index` for a bundle.
- **Output:** `output.dir` is required (`output.file` is not supported) and `output.format` must be `"es"`. A mod ends in `.js`, everything else in `.mjs`.
- **One chunk:** a mod or script build must produce exactly one chunk; only a bundle may load chunks with `import()`, named `<folder>/[name]-[hash].mjs`.
- **Imports:** a mod may import only relative paths and `claude-code`; the build fails on `node:*` and on an import of a bundle. A script keeps only `node:*` and bundle entries external, a bundle only `node:*` and its own chunks.
- **Shebang:** scripts must start with `#!/usr/bin/env node`, mods and bundles must not.
- **File modes:** the plugin sets no file mode on built entries. Hooks and MCP servers start via `node` and need none; run `chmod 755` on built `bin` scripts yourself (the preset does this for every script).

## Options

`claudeCode(options)` accepts every project option of the preset: `root`, `hooksTemplate`, `mcpTemplate`, `manifest`, `assets`, `scripts`, `bundles` and `files`. They are documented in the [preset README](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/tsdown-preset#options). In addition:

| Option         | Default | Meaning                                                                                                      |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `emitMetadata` | `true`  | Write `plugin.json`, `hooks.json` and `.mcp.json`, copy assets and files and check the layout of this build. |
| `strict`       | `false` | Treat warnings as errors. Without it, warnings are logged through Rolldown.                                  |
| `output`       | —       | Output path of the entry this build produces. Without it, the entry is derived from the input name.          |

Errors fail the build with a `[claude-code]` message listing every problem; the codes are documented in [`@kwitsch/claude-code-plugin-core`](https://github.com/kwitsch/rolldown-plugin-claude-code/tree/main/packages/core#issues).

## API

- `claudeCode(options?: ClaudeCodeOptions): Plugin` – the Rolldown plugin.
- `loadProject(options?: ProjectOptions): Promise<LoadedProject>` – reads `package.json`, the templates, the scripts, bundles, files and assets, and returns the manifest, the rendered `hooks.json` and `.mcp.json`, every entry with its absolute `sourcePath` and output path, and all issues. It throws only when `package.json` cannot be read. The preset uses it to generate one build per entry.
- `formatProblems(lines: readonly string[]): string` and `issueLine(issue: Issue, codeWidth: number): string` – format problems the way the plugin prints them.

```ts
import {
  formatProblems,
  issueLine,
  loadProject,
} from "@kwitsch/rolldown-plugin-claude-code";

const project = await loadProject({ hooksTemplate: "hooks.template.json" });
for (const entry of project.entries) console.log(entry.kind, entry.output);
const errors = project.issues.filter((issue) => issue.severity === "error");
if (errors.length > 0) {
  const width = Math.max(...errors.map((issue) => issue.code.length));
  console.error(formatProblems(errors.map((issue) => issueLine(issue, width))));
}
```

Releases are published from GitHub Actions with npm provenance: the package page on npmjs links the commit and the workflow run that built each version.
