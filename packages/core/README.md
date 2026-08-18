# @pkgwise/core

Programmatic API for PkgWise dependency analysis. It parses supported npm and pnpm lockfiles without
executing project code, builds a dependency graph, produces evidence-backed findings, and provides
cached npm Registry and OSV enrichment.

```ts
import { createPkgWise } from '@pkgwise/core';

const pkgwise = createPkgWise();
const report = await pkgwise.analyzeProject({ root: process.cwd(), remote: true });
console.log(report.findings);
```

Node.js 22 or newer is required. The package is ESM-only. See the main PkgWise repository for the CLI,
configuration reference, limitations, and security model.
