# @kwitsch/claude-code-plugin-core

## 0.1.0

### Minor Changes

- 2aee7d6: Breaking: the top-level `bin` and `skillScripts` options are replaced by one `scripts` option with optional `bin` and `skills` entries, for example `scripts: { bin: ["src/bin/doctor.ts"], skills: { dprint: ["src/skills/dprint/run-dprint.ts"] } }`. The old keys are removed without aliases. Build outputs are unchanged.
