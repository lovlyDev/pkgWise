# Scoring

PkgWise scores are navigation aids, not verdicts. Every overall score is accompanied by coverage,
confidence, category results, contribution values, and a model version. Findings and policy guardrails
remain the primary actionable output.

## Categories and default weights

| Category | Weight | Current alpha signal |
| --- | ---: | --- |
| Security | 0.30 | Exact-coordinate OSV advisories when `--remote` is enabled |
| Maintenance | 0.20 | npm deprecation, exact-release recency, and maintainer redundancy with `--remote` |
| Supply chain | 0.15 | Lockfile integrity, npm lifecycle scripts, and exact Registry resolution |
| Reliability | 0.15 | Version fragmentation across the resolved graph |
| Compatibility | 0.10 | Required dependency relations unresolved by the lockfile |
| Quality | 0.10 | Release stability plus npm license and repository metadata |

Unavailable signals are not treated as zero. A category needs at least 35% coverage before its numeric
score participates in the overall result. The overall score is weighted by category confidence, while
overall coverage continues to account for every configured category. The qualitative label is withheld
until overall coverage is at least 60% and confidence is at least 50%.

## Security model

Active OSV advisories start from severity values of 85 for low, 65 for medium, 35 for high, and 5 for
critical. Direct runtime dependencies receive full project impact; transitive, optional, and development
paths receive bounded context factors. Multiple advisories on one exact coordinate add at most 15 points
of extra penalty. Project aggregation emphasizes the worst five coordinates without allowing a very
large dependency tree to hide a serious direct issue.

Numeric scoring never changes advisory severity. Confirmed high or critical findings can still fail a
finding policy independently of the score.

## Reliability and compatibility

Fragmentation penalties account for distinct versions, major-version spread, and the number of affected
reachable locators. Compatibility penalties account for unresolved required relations, dependency scope,
and whether the relation starts at the project importer. Optional and local/workspace-style references
are excluded from unresolved-dependency penalties.

## Maintenance, supply chain, and quality

Maintenance uses the npm deprecation field as a confirmed fact, applies gradual release-age bands, and
adds a bounded single-maintainer penalty. The maximum current maintenance coverage is 65%; repository
archive state and release cadence remain intentionally unavailable rather than being assumed healthy.

Supply-chain scoring checks whether resolved lockfile records contain integrity metadata, whether an
exact Registry coordinate resolves, and whether the published manifest declares install-time lifecycle
scripts. Lifecycle scripts are common and are not treated as proof of compromise: direct runtime install
hooks receive a larger bounded penalty and generate potential-risk evidence for review.

Quality combines exact-version prerelease status with the presence of license and source-repository
metadata. Missing metadata receives a bounded penalty; PkgWise does not infer a license or repository.
Registry-dependent contribution coverage is scaled by evaluated/eligible exact coordinates.

## Configuration

Category weights are finite numbers from 0 to 1. They are normalized during aggregation, so they do not
need to sum to 1.

```json
{
  "schemaVersion": 1,
  "scoring": {
    "categoryWeights": {
      "security": 0.4,
      "maintenance": 0.1,
      "supply-chain": 0.1,
      "reliability": 0.2,
      "compatibility": 0.15,
      "quality": 0.05
    }
  },
  "policy": {
    "fail": [
      {
        "type": "score",
        "target": "overall",
        "below": 70,
        "minimumCoverage": 0.6,
        "minimumConfidence": 0.5
      }
    ]
  }
}
```

A score condition can target `overall` or any category. When the requested score is unavailable or does
not meet the condition's minimum coverage/confidence, the condition is reported as `not-evaluated`
instead of passing or failing silently.

## Labels

| Score | Label |
| ---: | --- |
| 85–100 | strong |
| 70–84.99 | generally healthy |
| 50–69.99 | review recommended |
| 0–49.99 | material concerns |

Reports retain values to two decimal places. The model version for this release is `1.1.0`.
