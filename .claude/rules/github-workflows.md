---
paths:
  - ".github/**"
---

# GitHub workflows

- Pin actions to a major tag (`actions/checkout@v7`) and update through Dependabot. Node is 26, pnpm comes from `pnpm/action-setup` (version from `packageManager`).
- Job names `ci`, `pack-check`, `changeset` and the e2e job are required status checks. Renaming a job or a workflow silently drops it from branch protection; change the protection rule in the same step.
- `release.yml` is live: any push to `main` runs it as soon as the repository variable `RELEASE_APP_CLIENT_ID` exists. Without a pending changeset, `changeset publish` publishes every version missing from the registry. Before a change that touches `release.yml`, the changesets config or `main`'s content, check the variable and the pending changesets first; never rely on an earlier check.
- The App token step takes `client-id` (variable `RELEASE_APP_CLIENT_ID`), never `app-id`; the private key is the secret `RELEASE_APP_PRIVATE_KEY`.
- pnpm 11 ignores registry credentials in a project `.npmrc`. Put the GitHub Packages token in with `pnpm config set "//npm.pkg.github.com/:_authToken" "$TOKEN"`, and keep the README install steps in line.
- `dependabot-auto-merge.yml` queues auto-merge only for patch and minor updates and never for `tsdown` or any major. Workflows on Dependabot pull requests see no Actions secrets; do not make `ci` or `e2e` depend on one.
