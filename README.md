# PkgWise

PkgWise is an explainable, local-first dependency analysis tool for JavaScript and TypeScript projects.

The project is in early development. Project scanning, package inspection, comparison, remote security enrichment, and policy enforcement are available; scoring is still being implemented.

## Development

Requirements: Node.js 22+ and pnpm 11.

```bash
pnpm install --ignore-scripts
pnpm check
pnpm verify:pack
```

Run the built CLI:

```bash
pnpm build
node packages/cli/dist/bin/pkgwise.js --help
node packages/cli/dist/bin/pkgwise.js --offline doctor
```

## Current CLI surface

```text
pkgwise scan [path] [--remote]
pkgwise inspect <package>
pkgwise compare <package-a> <package-b>
pkgwise explain <fingerprint-or-package>
pkgwise doctor
pkgwise cache status
pkgwise cache clear
```

`scan` performs safe project discovery, validates `package.json`, detects the package manager/lockfile, and builds a transitive dependency graph from npm lockfile v2/v3 or pnpm lockfile schema 6–9. Reports include stable package IDs, direct scopes, minimum depth, duplicate-version groups, dependency cycles, bounded shortest paths, and deterministic local findings for version fragmentation and unresolved relations. `scan --remote` checks every unique exact lockfile coordinate against OSV with bounded concurrency, cache reuse, explicit security coverage, and policy-ready vulnerability findings. Package-cycle findings are opt-in with `--rule reliability/dependency-cycle`; terminal presentation supports `--severity`, `--include`, and `--max-findings`. Static JSON configuration can control development-dependency inclusion, enabled rules, and auditable finding/coverage policy gates; a failed configured policy exits with code `1`. See [configuration and policy](docs/configuration.md). `scan` supports terminal, JSON, Markdown, and SARIF 2.1.0 output; focused commands support terminal, JSON, and safe generic Markdown. `explain` reruns local analysis and selects a finding by fingerprint, unique fingerprint prefix, rule ID, or package name. `inspect` provides local installed-version, locator, scope, depth, path, and related-finding context. With `--remote` it also supports project-independent npm Registry inspection, exact versions and dist-tags, exact-coordinate OSV advisory lookup, alias-deduplicated security findings, persistent cache, and socket-free offline reads. See [provider behavior](docs/providers.md). `compare` evaluates two installed candidates from one shared snapshot using version, directness, scopes, depth, immediate resolved footprint, and finding counts without declaring an overall winner. `cache status` reports owned entries, bytes, expiry, corruption, and providers; `cache clear --yes` validates the versioned ownership marker and directory containment before removing anything, and supports provider-only cleanup. Unsupported manager families fall back to an explicitly partial manifest-only report; malformed supported lockfiles fail instead of silently degrading. GitHub enrichment and scoring are still under development, so the overall analysis remains partial.

## Architecture

- `packages/core` — public programmatic API and domain/application implementation.
- `packages/cli` — CLI input, output, and process boundary only.
- `docs` — public configuration, provider, cache, and release documentation.

PkgWise never executes code from the project it analyzes. The core package does not print to the console or terminate the process.

## Alpha release status

The codebase now includes linting, Changesets, cross-platform CI, deterministic package allowlists,
tarball install/bin smoke tests, and a manual provenance-enabled alpha publishing workflow. Publishing
remains intentionally blocked until a license and canonical repository metadata are supplied. See the
[alpha release guide](docs/release.md).
