# @kwitsch/claude-code-plugin-cli

## 0.2.0

### Minor Changes

- 2b514c3: `claude-code-hook-types` warns about `${...}` placeholders in `mcp_tool` hook `input` that are not fields of the event's hook input, and the new `--strict` option fails on them; core exports the check as `checkHookPlaceholders` with the new issue code `hook-placeholder-unknown`.

### Patch Changes

- Updated dependencies [2b514c3]
  - @kwitsch/claude-code-plugin-core@0.5.0

## 0.1.1

### Patch Changes

- 1175c60: The package README now documents installation, usage and options with examples, instead of pointing to the repository README.
- Updated dependencies [1175c60]
  - @kwitsch/claude-code-plugin-core@0.4.1

## 0.1.0

### Minor Changes

- d654012: First release of `claude-code-hook-types`, which writes the hook input types file named by `hookTypes` in the hooks template, or checks it with `--check`.

### Patch Changes

- Updated dependencies [d654012]
  - @kwitsch/claude-code-plugin-core@0.4.0
