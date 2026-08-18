# @lovlydev/pkgwise-core changelog

## 0.1.0-alpha.1

- Added deterministic security, reliability, compatibility, and partial quality scoring with explicit
  category coverage, confidence, contribution explanations, and model versioning.
- Added configurable category weights and score-aware policy conditions that remain unevaluated when
  their required evidence coverage or confidence is unavailable.

## 0.1.0-alpha.0

- Initial alpha implementation of project discovery, lockfile parsing, dependency graph analysis,
  configuration, policy, cache operations, npm Registry metadata, and OSV advisories.
- Opt-in project-wide OSV enrichment with coordinate deduplication, bounded concurrency, cache reuse,
  explicit provider coverage, security findings, and policy evaluation.
