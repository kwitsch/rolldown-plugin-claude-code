---
paths:
  - "packages/*/package.json"
  - "packages/*/src/index.ts"
  - "packages/*/tsconfig.json"
  - "pnpm-workspace.yaml"
---

# Packages

- Four published packages: `core` (`@kwitsch/claude-code-plugin-core`), `rolldown-plugin` (`@kwitsch/rolldown-plugin-claude-code`), `tsdown-preset` (`@kwitsch/tsdown-preset-claude-code`), `cli` (`@kwitsch/claude-code-plugin-cli`). Dependencies point one way only: `tsdown-preset` -> `rolldown-plugin` -> `core`, and `cli` -> `core` (the cli depends on nothing else). Never import against that direction.
- `core` holds bundler-neutral functions: no bundler or tsdown import, and file system access only in `validateLayout`, which stats the build output. Everything else is pure. Results are plain data (`{ entries, issues }`-style); errors are `Issue` values, not exceptions. A new issue kind needs a code in `ISSUE_CODES` (`issue.ts`).
- `packages/*/src/index.ts` is the public API. Export a symbol there only when it is meant for consumers, and export its result and option types next to it.
- Versions of external dependencies live in the `catalog:` of `pnpm-workspace.yaml`; packages reference them as `catalog:` and each other as `workspace:*`. Pin catalog entries to exact versions. `peerDependencies` are ranges, not catalog entries.
- Each published package keeps the same metadata shape: `repository.directory`, `exports` to `dist/index.mjs`, `files` (`dist`, `README.md`, `LICENSE`), `engines.node >=26`, and `publishConfig.access` set to `public` (no registry: npm publishes to npmjs). The bin-only `cli` has `bin` (`claude-code-hook-types`) pointing to `dist/index.mjs` instead of `exports` and `types`. `pack-check` in CI fails when a tarball lacks one of these files or still contains `workspace:`.
- dprint sorts `package.json` keys; run `pnpm format` after editing one.
