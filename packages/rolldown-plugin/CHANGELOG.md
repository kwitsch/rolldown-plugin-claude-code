# @kwitsch/rolldown-plugin-claude-code

## 0.5.0

### Minor Changes

- 6bde3b4: BREAKING: every mod build now runs the Claude Code mod check (`checkMod`), so a mod that imports `node:*`, a bare package or anything other than a relative path or `claude-code`, or that has no `register` export, fails the build with a `mod-invalid` problem; Claude Code itself rejects such mods at load time.

### Patch Changes

- Updated dependencies [e927d8a]
  - @kwitsch/claude-code-plugin-core@0.6.0

## 0.4.2

### Patch Changes

- Updated dependencies [2b514c3]
  - @kwitsch/claude-code-plugin-core@0.5.0

## 0.4.1

### Patch Changes

- 1175c60: The package README now documents installation, usage and options with examples, instead of pointing to the repository README.
- Updated dependencies [1175c60]
  - @kwitsch/claude-code-plugin-core@0.4.1

## 0.4.0

### Minor Changes

- d654012: The build fails with `hook-types-stale` when the hooks template sets `hookTypes` and that file is missing or differs from the generated hook input types.

### Patch Changes

- Updated dependencies [d654012]
  - @kwitsch/claude-code-plugin-core@0.4.0

## 0.3.0

### Minor Changes

- 2c4d932: BREAKING: copy every `files` entry with mode 0644 whatever the source mode (an executable source no longer stays executable), set tsdown's `nodeProtocol: true` by default so bundled dependencies that import Node builtins without `node:` pass the layout check, and make the layout check name the `node:` import and the `nodeProtocol` option when it rejects a bare builtin.

### Patch Changes

- @kwitsch/claude-code-plugin-core@0.3.0

## 0.2.0

### Minor Changes

- 36cc936: Add the `bundles` option for shared multi-chunk bundles imported by several scripts, and the `files` option for copying single files to fixed output paths.

### Patch Changes

- Updated dependencies [36cc936]
  - @kwitsch/claude-code-plugin-core@0.2.0

## 0.1.2

### Patch Changes

- 056ceb6: Releases are published through npm trusted publishing with provenance; the package READMEs now say so. No code changes.
- Updated dependencies [056ceb6]
  - @kwitsch/claude-code-plugin-core@0.1.2

## 0.1.1

### Patch Changes

- 0cb951e: Publish to npmjs instead of GitHub Packages: install with `pnpm add -D @kwitsch/tsdown-preset-claude-code tsdown`, without a token or an `.npmrc`. If you installed 0.1.0 from GitHub Packages, remove the `@kwitsch:registry` line from your `.npmrc`. No code changes.
- Updated dependencies [0cb951e]
  - @kwitsch/claude-code-plugin-core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [2aee7d6]
  - @kwitsch/claude-code-plugin-core@0.1.0
