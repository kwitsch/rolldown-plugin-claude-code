---
name: add-changeset
description: Write the changeset file a package change needs, with the right bump and text. Use whenever packages/* changes, or when the `changeset` CI job fails.
argument-hint: <patch|minor|empty> <one sentence of user-visible change>
---

# add-changeset

`pnpm changeset` is interactive; write the file directly instead.

1. Pick the bump: a fix is `patch`; a feature or any breaking change is `minor` (below 1.0.0 breaking changes are `minor`, and the text starts with `Breaking:`). No package impact (CI or docs only): an empty changeset.
2. Create `.changeset/<kebab-case-summary>.md`:

   ```md
   ---
   "@kwitsch/claude-code-plugin-core": minor
   ---

   Breaking: one or two English sentences about what a user sees, with a short example if an option changed.
   ```

   List only the packages actually affected; the fixed group lifts all three anyway. Empty variant: front matter containing nothing between the two `---` lines.
3. Run `pnpm exec changeset status` and `pnpm format:check`.
4. Commit as `chore: add changeset for <topic>`. Never touch `version` fields or `CHANGELOG.md`.
