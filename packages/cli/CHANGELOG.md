# PkgWise changelog

## 0.1.0-alpha.3

- Added npm and pnpm workspace selection by package name, relative path, repeated selectors, or `*`.
- Added selected workspace metadata and diagnostics to terminal, JSON, Markdown, and SARIF reports.

## 0.1.0-alpha.2

- Added npm Registry coverage and metadata provenance to terminal, JSON, Markdown, and SARIF scan output.
- Added six-category remote project scoring plus deprecation and install-script findings to `scan --remote`.

## 0.1.0-alpha.1

- Added explainable scores to terminal, JSON, Markdown, and SARIF scan reports.
- Added documentation for scoring formulas, category weights, coverage, confidence, and score policy.

## 0.1.0-alpha.0

- Initial alpha CLI with scan, inspect, compare, explain, doctor, and cache commands.
- Added `scan --remote` OSV enrichment with terminal, JSON, Markdown, SARIF, offline-cache, and policy
  support.
