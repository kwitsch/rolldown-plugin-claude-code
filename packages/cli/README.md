# @kwitsch/claude-code-plugin-cli

Command-line tools for Claude Code plugin projects.

## Installation

```sh
pnpm add -D @kwitsch/claude-code-plugin-cli
```

## Usage

```sh
pnpm exec claude-code-hook-types --check hooks.template.json
```

`claude-code-hook-types` writes the TypeScript file named by `hookTypes` in the hooks template (default `hooks.template.json`); with `--check` it only verifies that the file is up to date. See the [project README](https://github.com/kwitsch/rolldown-plugin-claude-code#hook-input-types) for the template fields and compatibility.

Releases are published from GitHub Actions with npm provenance: the package page on npmjs links the commit and the workflow run that built each version.
