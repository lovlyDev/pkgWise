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
      }
    ]
  }
}
```

All fields within one finding condition are AND predicates. Entries in `policy.fail` are independent
OR conditions: any matching entry fails the policy. Severity uses `critical`, `high`, `medium`, `low`,
or `info`; thresholds include that severity and every more severe finding.

The report records the selected configuration source, enabled rules, policy status, violations, and
matching finding fingerprints. Exit code `0` means the policy passed or no fail policy was configured;
exit code `1` means analysis completed but the configured policy failed; invalid configuration exits
with code `2`.

Coverage is currently `0` until remote providers and scoring are implemented. Consequently, a positive
coverage threshold intentionally fails today. The complete target schema remains specified in
[the normative configuration specification](spec/13-configuration.md); fields not listed above are not
accepted by the current executable yet.
