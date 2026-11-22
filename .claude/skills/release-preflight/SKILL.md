---
name: release-preflight
description: Check, read-only, what a push or merge to main would trigger in the release workflow. Use before merging a pull request, before any push to main, and before touching release.yml, the changesets config or repository settings.
---

# release-preflight

Background: `release.yml` runs on every push to `main` and is live whenever the repository variable `RELEASE_APP_CLIENT_ID` exists. With no pending changeset, `changeset publish` publishes any version missing from the registry. This once published 0.0.0 by accident. Never rely on an earlier check; run these now. Everything here is read-only.

1. Variable: `gh variable list` — does `RELEASE_APP_CLIENT_ID` exist? Secret: `gh secret list` — `RELEASE_APP_PRIVATE_KEY`.
2. Pending changesets on the target: `ls .changeset/*.md` (ignoring `README.md`); an open Version Packages PR: `gh pr list --head changeset-release/main`.
3. Versions already published: compare each `packages/*/package.json` version with the tags `git tag -l "@kwitsch/*@<version>"` (after `git fetch --tags`). A version without a tag would be published by the next run.
4. Recent runs: `gh run list --workflow release --limit 3`.
5. Protection and settings that matter: `gh api repos/{owner}/{repo}/branches/main/protection` (a 404 means none).

Report the verdict in plain words: what a push to `main` would do (nothing, open or update the Version Packages PR, publish version X), and anything surprising. Do not push, merge, tag, publish or change settings; hand that decision back to the maintainer.
