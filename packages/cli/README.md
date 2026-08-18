# PkgWise

Explainable, local-first dependency analysis for JavaScript and TypeScript projects.

```bash
npx pkgwise scan .
npx pkgwise --concurrency 4 scan . --remote
npx pkgwise inspect lodash@4.17.20 --remote
npx pkgwise --offline scan . --remote
```

PkgWise parses project metadata and supported lockfiles without executing dependency code. Remote
inspection uses the public npm Registry and OSV API. `scan --remote` queries OSV for every unique exact
package coordinate in the lockfile. Both paths support an owned checksum-validated cache and can be
run without network access after data has been cached.

Scan reports include evidence-backed category scores, overall coverage and confidence, contribution
explanations, and score-aware policy conditions. Missing provider data is excluded rather than scored as
zero.

Node.js 22 or newer is required. This package is an alpha: report and API contracts may still evolve.
