---
name: add-fixture
description: Add a new fixture package under fixtures/ with golden output and register it in the e2e validate test. Use when a new feature combination needs an end-to-end example.
argument-hint: <fixture-name> <what it covers>
---

# add-fixture

Copy the closest existing fixture (`mod-only` for plain rolldown, `script-only` or `mod-and-script` for the preset, `mcp-server`, `bin-and-skill`) instead of starting from scratch.

1. Create `fixtures/<name>/` with `package.json`, a config (`tsdown.config.ts`, or `rolldown.config.ts` for a plain-rolldown fixture), `src/`, and the templates the feature needs (`hooks.template.json`, `mcp.template.json`, `assets/`).
2. `package.json` rules: name `@fixtures/<name>`, `private: true`, `version 0.0.0`, `license` then `"author": "Kwitsch"`, a `description` starting with `Fixture:`, a `build` script (`tsdown`) and a `test` script (`diff -r expected plugin && test -x ...` for every output that must be executable). Dependencies: `@kwitsch/tsdown-preset-claude-code` as `workspace:*`, tools as `catalog:`.
3. A hooks module may import only relative paths and `claude-code`; shared code inlined into it stays pure. Only scripts may import `node:*`.
4. `pnpm install`, `pnpm build`, check `fixtures/<name>/plugin`, then copy it to `fixtures/<name>/expected` (see `refresh-goldens` for the review rule).
5. Add the name to the `it.each([...])` list in `e2e/validate.test.ts`.
6. Run the `verify` skill including e2e. `claude plugin validate --strict` must pass on the fixture.
7. Commit as `test(fixtures): add <name> fixture`. A fixture needs no changeset.
