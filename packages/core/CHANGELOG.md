# @kwitsch/claude-code-plugin-core

## 0.1.2

### Patch Changes

- 056ceb6: Releases are published through npm trusted publishing with provenance; the package READMEs now say so. No code changes.

## 0.1.1

### Patch Changes

- 0cb951e: Publish to npmjs instead of GitHub Packages: install with `pnpm add -D @kwitsch/tsdown-preset-claude-code tsdown`, without a token or an `.npmrc`. If you installed 0.1.0 from GitHub Packages, remove the `@kwitsch:registry` line from your `.npmrc`. No code changes.

## 0.1.0

### Minor Changes

- 2aee7d6: Breaking: the top-level `bin` and `skillScripts` options are replaced by one `scripts` option with optional `bin` and `skills` entries, for example `scripts: { bin: ["src/bin/doctor.ts"], skills: { dprint: ["src/skills/dprint/run-dprint.ts"] } }`. The old keys are removed without aliases. Build outputs are unchanged.
