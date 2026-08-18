# Alpha release guide

## Current readiness

The functional CLI and public core API are implemented and tested. The canonical public repository is
`https://github.com/lovlyDev/pkgWise`. MIT licensing, author metadata, the `lovlydev` npm account, and
the personal `@lovlydev` scope are configured. Before automated releases:

1. publish both packages once with the authenticated npm account;
2. protect the GitHub `main` branch;
3. create the GitHub `npm` environment;
4. configure npm Trusted Publishing for both packages with the `publish-alpha.yml` workflow.

Registry checks on 2026-08-18 returned 404 for both `pkgwise` and `@lovlydev/pkgwise-core`, so they appeared
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
