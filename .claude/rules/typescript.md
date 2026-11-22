---
paths:
  - "packages/*/src/**/*.ts"
  - "e2e/**/*.ts"
  - "fixtures/*/src/**/*.ts"
  - "fixtures/*/*.config.ts"
  - "tsconfig.base.json"
  - ".oxlintrc.json"
---

# TypeScript

- Never use `any` (oxlint `typescript/no-explicit-any` is an error). Use `unknown` and narrow it.
- `isolatedDeclarations` is on: every exported function, constant and class member needs an explicit type. A default-export expression needs an annotated variable first (see `e2e/vitest.config.ts`).
- `module: nodenext`: relative imports end in `.js` even for `.ts` files. Type-only imports use `import type` (`verbatimModuleSyntax`).
- Target is Node 26. Prefer `node:` built-ins over dependencies.
- Prefer `readonly` properties and `readonly T[]` in exported types, matching the existing API.
- Tests sit next to the code as `<name>.test.ts` and use vitest. Import the unit through the package's `index.js` where the public API is under test, as `script-entries.test.ts` does.
- A deliberate shortcut gets a one-line comment: `shortcut: <limit>, <when to upgrade>`.
