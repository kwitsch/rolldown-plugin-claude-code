---
paths:
  - ".github/**"
---

# GitHub workflows

- Pin actions to a major tag (`actions/checkout@v7`) and update through Dependabot. Node is 26, pnpm comes from `pnpm/action-setup` (version from `packageManager`).
- Job names `ci`, `pack-check`, `changeset` and the e2e job are the status checks meant to be required on `main`. Once protection is on, renaming a job or a workflow silently drops it from the rule; change the protection rule in the same step.
- `release.yml` is live: any push to `main` runs it as soon as the repository variable `RELEASE_APP_CLIENT_ID` exists. Without a pending changeset, `changeset publish` publishes every version missing from the registry. Before a change that touches `release.yml`, the changesets config or `main`'s content, check the variable and the pending changesets first; never rely on an earlier check.
- The App token step takes `client-id` (variable `RELEASE_APP_CLIENT_ID`), never `app-id`; the private key is the secret `RELEASE_APP_PRIVATE_KEY`.
- Packages publish to npmjs through trusted publishing: the `release` job has no `registry-url`, `NODE_AUTH_TOKEN` or npm token (a set `NODE_AUTH_TOKEN` makes npm skip the OIDC exchange, and a failed exchange shows up as a 404). It needs `id-token: write`, and the trusted publisher entries name `release.yml`: renaming that file breaks all three.
- `dependabot-auto-merge.yml` queues auto-merge only for patch and minor updates and never for `tsdown` or any major. Workflows on Dependabot pull requests see no Actions secrets; do not make `ci` or `e2e` depend on one.
