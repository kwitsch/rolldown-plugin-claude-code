# Contributing

## Development

Target runtime is Node 26; pnpm is pinned via the `packageManager` field.

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm format
pnpm format:check
```

## Releases

Releases use [Changesets](https://github.com/changesets/changesets). Each package has its own version: a changeset lists the packages whose users see the change, and Changesets also bumps every package that depends on a listed one.

- Every pull request that changes a file in `packages/*` needs a changeset: run `pnpm changeset` and commit the generated file. CI checks this with `pnpm changeset status`.
- Changes that need no release (tests, internal refactors, package docs) get an empty changeset: `pnpm changeset --empty`.
- After a merge to `main`, the `release` workflow opens or updates the "Version Packages" pull request with the bumped versions and changelogs.
- Merging that pull request publishes the packages with new versions to npmjs with provenance, pushes one git tag per published package and creates one GitHub release per published package.

### Maintainer setup

1. Create a GitHub App with the repository permissions Contents and Pull requests set to read and write, and install it on this repository only. Copy its **Client ID** from the GitHub App page (it sits next to the App ID and is a different value) into the repository variable `RELEASE_APP_CLIENT_ID` (Settings -> Secrets and variables -> Actions -> Variables), and store a private key of the App in the repository secret `RELEASE_APP_PRIVATE_KEY`. The `release` workflow stays inactive until the variable exists; the Version Packages pull request opens on the next push to `main` after that.
2. Enable "Allow auto-merge" (Settings -> General -> Pull Requests). Dependabot pull requests rely on it.
3. Protect `main`: require a pull request and the status checks of the `ci` and `e2e` workflows, including the `changeset` job.
4. Publishing to npmjs: the account that owns the scope `@kwitsch` has two-factor authentication on. For each package (`@kwitsch/claude-code-plugin-core`, `@kwitsch/rolldown-plugin-claude-code`, `@kwitsch/tsdown-preset-claude-code` and `@kwitsch/claude-code-plugin-cli`), add a trusted publisher under Settings -> Trusted publishing (GitHub Actions, user `kwitsch`, repository `rolldown-plugin-claude-code`, workflow `release.yml`, no environment), or with `npm trust github <package> --repo kwitsch/rolldown-plugin-claude-code --file release.yml --allow-publish`. The `release` job has no npm token: it publishes through OIDC with provenance and needs `id-token: write`. Keep the file name `release.yml`; renaming it breaks every entry. A trusted publisher needs a package that already exists on npm: before merging the first Version Packages pull request that bumps `@kwitsch/claude-code-plugin-cli`, publish its version `0.0.0` once by hand (`pnpm build` in the repository root, then `pnpm publish --access public` in `packages/cli`, which rewrites `workspace:*`; npm asks for the two-factor code) and add its trusted publisher for `release.yml`.
