# Configuration and policy

PkgWise loads static JSON only. It never imports project JavaScript while discovering configuration.

## Discovery and precedence

The first available source wins:

1. global CLI option `--config <path>`;
2. `<project-root>/pkgwise.config.json`;
3. the `pkgwise` field in the root `package.json`;
4. built-in defaults.

Explicit scan options override configuration. `--production` and `--include-dev` override
`project.includeDev`; one or more `--rule` options replace the configured rule set for that scan.

## Implemented schema

The current executable validates this subset strictly. Unknown properties and rule IDs fail with
`PW_CONFIG_INVALID` instead of being ignored.

```json
{
  "schemaVersion": 1,
  "project": {
    "includeDev": true
  },
  "rules": {
    "reliability/version-fragmentation": { "enabled": true },
    "compatibility/unresolved-dependency": { "enabled": true },
    "reliability/dependency-cycle": false
  },
  "scoring": {
    "categoryWeights": {
      "security": 0.3,
      "maintenance": 0.2,
      "supply-chain": 0.15,
      "reliability": 0.15,
      "compatibility": 0.1,
      "quality": 0.1
    }
  },
  "policy": {
    "minimumOverallCoverage": 0,
    "fail": [
      {
        "type": "finding",
        "minimumSeverity": "medium",
        "evidenceKinds": ["confirmed-fact"],
        "minimumConfidence": 0.8,
        "rules": ["compatibility/unresolved-dependency"],
        "packages": ["example-package"],
        "scopes": ["runtime", "optional"],
        "directOnly": true
      },
      {
        "type": "coverage",
        "below": 0.7
      },
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

All fields within one finding condition are AND predicates. Entries in `policy.fail` are independent
OR conditions: any matching entry fails the policy. Severity uses `critical`, `high`, `medium`, `low`,
or `info`; thresholds include that severity and every more severe finding.

Score conditions may target `overall`, `security`, `maintenance`, `supply-chain`, `reliability`,
`compatibility`, or `quality`. A score condition that lacks its required coverage or confidence is
reported as `not-evaluated`. See [scoring](scoring.md) for formulas, current signal coverage, and labels.

The report records the selected configuration source, enabled rules, policy status, violations, and
matching finding fingerprints. Exit code `0` means the policy passed or no fail policy was configured;
exit code `1` means analysis completed but the configured policy failed; invalid configuration exits
with code `2`.

Coverage reflects the configured weighted scoring categories. Local locked scans currently cover
reliability and compatibility signals; `--remote` adds exact-coordinate OSV security coverage. Fields not
listed above are not accepted by the current executable yet.
