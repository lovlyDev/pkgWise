# Release guide

## Current readiness

The functional CLI and public core API are implemented, tested, and published. The canonical public
repository is `https://github.com/lovlyDev/pkgWise`. MIT licensing, author metadata, the `lovlydev` npm
account, personal scope, GitHub `npm` environment, and OIDC Trusted Publishing are configured.

The first public versions were published on 2026-08-18 as `pkgwise@0.1.0-alpha.0` and
`@lovlydev/pkgwise-core@0.1.0-alpha.0`. npm assigns `latest` to a package's first release even when
`--tag next` is supplied, so both `latest` and `next` initially identified this alpha. Starting with
`0.1.0-alpha.1`, both tags intentionally follow the newest verified alpha so a default
`npm install pkgwise` does not install an older prerelease. The first stable release will keep `latest`
on the stable version.

The `0.1.0-alpha.1` release adds explainable scoring and is the first release published automatically
from a GitHub prerelease through OIDC Trusted Publishing.

The `0.1.0-alpha.2` release adds project-wide npm Registry intelligence, maintenance and supply-chain
findings, and numeric evidence-backed results across all six scoring categories during remote scans.

## Local release verification

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm verify:pack
pnpm release:metadata
pnpm release:check
```

`verify:pack` starts from clean generated directories, builds both packages, creates real npm tarballs,
installs those tarballs together into a temporary project, imports `@lovlydev/pkgwise-core`, executes the
installed `pkgwise` binary, and verifies that no `workspace:` dependency leaked into the published CLI.

`release:metadata` validates license, author, repository, homepage, issue tracker, package access, and
published license files. It must pass before packaging or publishing.

## Version and tag

Both packages remain version-locked. User-visible changes require a Changeset. Prereleases are published
automatically with the npm dist-tag `next`; after verification, `latest` is synchronized to the same
version during the public alpha. Stable releases are published directly with `latest`.

Publishing a GitHub Release automatically runs `.github/workflows/publish-alpha.yml`. The workflow checks
out the release tag, verifies that both package manifests have the same version as the tag, runs the full
release check, publishes `@lovlydev/pkgwise-core` before `pkgwise`, and preserves the verified tarballs as
a workflow artifact. A GitHub prerelease is sent to npm with `next`; a normal GitHub release is sent with
`latest`. npm authenticates the workflow through OIDC Trusted Publishing, so no long-lived npm token is
stored in GitHub.

Trusted Publishing authorizes package publication but not the separate `npm dist-tag add` administration
operation. During the alpha, synchronizing `latest` after an automatic prerelease therefore requires an
npm 2FA confirmation by an owner of both packages.

Before publishing the GitHub Release, commit and push the synchronized package versions and create a tag
named `v<version>` on that commit. For example, package version `0.2.0-alpha.1` must use tag
`v0.2.0-alpha.1` and the GitHub Release must be marked as a prerelease. If automatic publishing needs to
be retried, run `Publish npm release` manually with the exact version and matching `next` or `latest` tag.

## First-publish checks

- verify `npm whoami` and scope ownership;
- confirm package names immediately before publishing;
- inspect `.artifacts/*.tgz` from CI;
- publish the first versions manually with 2FA, core before CLI;
- configure Trusted Publishing for both packages and the GitHub `npm` environment;
- verify `npm view pkgwise dist-tags --json` and `npm view @lovlydev/pkgwise-core dist-tags --json`;
- after prerelease verification, synchronize `latest` to the verified alpha for both packages;
- install default `pkgwise` in a clean directory and run `pkgwise --version`, `pkgwise doctor`, and a scan;
- record known alpha limitations in the GitHub release.
