# Alpha release guide

## Current readiness

The functional CLI and public core API are implemented and tested. The canonical public repository is
`https://github.com/lovlyDev/pkgWise`. Alpha publishing is blocked until the remaining owner-specific
metadata and service configuration are supplied:

1. choose a license and add the matching `LICENSE` text at the root and in both published package
   directories so every tarball carries it;
2. provide the npm `author` value;
3. ensure the publishing npm account owns or can create the `@pkgwise` scope;
4. push the initialized `main` branch and protect it;
5. configure npm Trusted Publishing for the GitHub `publish-alpha.yml` workflow and `npm` environment.

Registry checks on 2026-08-15 returned 404 for both `pkgwise` and `@pkgwise/core`, so they appeared
unpublished at that moment. Availability is not reserved until the first successful publish.

## Local release verification

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm verify:pack
pnpm release:metadata
pnpm release:check
```

`verify:pack` starts from clean generated directories, builds both packages, creates real npm tarballs,
installs those tarballs together into a temporary project, imports `@pkgwise/core`, executes the
installed `pkgwise` binary, and verifies that no `workspace:` dependency leaked into the published CLI.

`release:metadata` intentionally fails until license and author metadata are complete.
This prevents an accidental legally ambiguous publish.

## Version and tag

Both packages remain version-locked through the alpha. User-visible changes require a Changeset.
Prereleases are published with the npm dist-tag `next`; `latest` must not point to an alpha.

The manual `Publish alpha` GitHub workflow runs the full release check, then publishes
`@pkgwise/core` before `pkgwise` with public access and npm provenance. It is manual by design until
the repository, npm scope, and Trusted Publisher ownership have been verified. The operator must enter
the exact synchronized alpha version; the workflow rejects a mismatched or non-alpha version, prevents
parallel publish runs, and preserves the verified tarballs as a workflow artifact.

## First-publish checks

- verify `npm whoami` and scope ownership;
- confirm package names immediately before publishing;
- inspect `.artifacts/*.tgz` from CI;
- publish using the manual workflow;
- verify `npm view pkgwise dist-tags --json` and `npm view @pkgwise/core dist-tags --json`;
- install `pkgwise@next` in a clean directory and run `pkgwise --version`, `pkgwise doctor`, and a scan;
- record known alpha limitations in the GitHub release.
