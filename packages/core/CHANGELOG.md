# @kwitsch/claude-code-plugin-core

## 0.6.0

### Minor Changes

- e927d8a: Add `checkMod(code, file)`, which checks a built hooks module against the Claude Code mod rules (including the required `register` export) and reports violations with the new issue code `mod-invalid`; core now depends on `es-module-lexer`.

## 0.5.0

### Minor Changes

- 2b514c3: `claude-code-hook-types` warns about `${...}` placeholders in `mcp_tool` hook `input` that are not fields of the event's hook input, and the new `--strict` option fails on them; core exports the check as `checkHookPlaceholders` with the new issue code `hook-placeholder-unknown`.

## 0.4.1

### Patch Changes

- 1175c60: The package README now documents installation, usage and options with examples, instead of pointing to the repository README.

## 0.4.0

### Minor Changes

- d654012: Add `renderHookInputTypes`, which generates TypeScript types for the `input` of `mcp_tool` hooks, the hooks template field `hookTypes`, and the issue codes `hook-input-invalid` and `hook-types-stale`.

## 0.3.0

No changes in this release.

## 0.2.0

### Minor Changes

- 36cc936: Add the `bundles` option for shared multi-chunk bundles imported by several scripts, and the `files` option for copying single files to fixed output paths.

## 0.1.2

### Patch Changes

- 056ceb6: Releases are published through npm trusted publishing with provenance; the package READMEs now say so. No code changes.

## 0.1.1

### Patch Changes

- 0cb951e: Publish to npmjs instead of GitHub Packages: install with `pnpm add -D @kwitsch/tsdown-preset-claude-code tsdown`, without a token or an `.npmrc`. If you installed 0.1.0 from GitHub Packages, remove the `@kwitsch:registry` line from your `.npmrc`. No code changes.

## 0.1.0

### Minor Changes

- 2aee7d6: Breaking: the top-level `bin` and `skillScripts` options are replaced by one `scripts` option with optional `bin` and `skills` entries, for example `scripts: { bin: ["src/bin/doctor.ts"], skills: { dprint: ["src/skills/dprint/run-dprint.ts"] } }`. The old keys are removed without aliases. Build outputs are unchanged.
