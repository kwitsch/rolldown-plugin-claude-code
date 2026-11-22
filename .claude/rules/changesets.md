---
paths:
  - ".changeset/**"
  - "packages/*/CHANGELOG.md"
  - "packages/*/package.json"
  - "packages/*/src/**"
---

# Changesets and releases

- Any change under `packages/*` needs a changeset (`pnpm changeset`); the `changeset` CI job fails without one. A pull request with no package impact adds an empty changeset instead.
- The three packages form one fixed version group in `.changeset/config.json`: a bump for one lifts all three. Write one changeset that lists the packages it affects, with one English sentence about the user-visible change.
- While the version is below 1.0.0, a breaking change is a `minor` bump and says so in the text (`refactor!:` commit, "BREAKING" in the changeset). Never remove a public option without that.
- Never edit `version` fields or `CHANGELOG.md` by hand and never run `changeset version` or `changeset publish` locally. The `release` workflow opens the Version Packages pull request and publishes after it merges.
- The preset's peer range on tsdown (`~0.23.7`) is deliberately narrow; widening it is a feature change with a changeset.
