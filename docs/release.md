# Alpha release guide

## Current readiness

The functional CLI and public core API are implemented, tested, and published. The canonical public
repository is `https://github.com/lovlyDev/pkgWise`. MIT licensing, author metadata, the `lovlydev` npm
account, personal scope, GitHub `npm` environment, and OIDC Trusted Publishing are configured.

The first public versions were published on 2026-08-18 as `pkgwise@0.1.0-alpha.0` and
`@lovlydev/pkgwise-core@0.1.0-alpha.0`. npm assigns `latest` to a package's first release even when
`--tag next` is supplied, so both `latest` and `next` initially identify this alpha. The first stable
release must move `latest` to the stable version.

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

Both packages remain version-locked through the alpha. User-visible changes require a Changeset.
Prereleases are published with the npm dist-tag `next`; `latest` must not point to an alpha.

The manual `Publish alpha` GitHub workflow runs the full release check, then publishes
`@lovlydev/pkgwise-core` before `pkgwise` with public access and npm provenance. It is manual by design until
the repository, npm scope, and Trusted Publisher ownership have been verified. The operator must enter
the exact synchronized alpha version; the workflow rejects a mismatched or non-alpha version, prevents
parallel publish runs, and preserves the verified tarballs as a workflow artifact.

## First-publish checks

- verify `npm whoami` and scope ownership;
- confirm package names immediately before publishing;
- inspect `.artifacts/*.tgz` from CI;
- publish the first versions manually with 2FA, core before CLI;
- configure Trusted Publishing for both packages, then use the manual workflow for later versions;
- verify `npm view pkgwise dist-tags --json` and `npm view @lovlydev/pkgwise-core dist-tags --json`;
- install `pkgwise@next` in a clean directory and run `pkgwise --version`, `pkgwise doctor`, and a scan;
- record known alpha limitations in the GitHub release.
