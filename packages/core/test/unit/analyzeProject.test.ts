import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createPkgWise } from '../../src/public/index.js';

describe('analyzeProject', () => {
  it('creates a deterministic manifest-only dependency summary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-manifest-'));
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'fixture-project',
          version: '1.0.0',
          dependencies: { react: '^19.0.0' },
          devDependencies: { typescript: '^5.9.0' },
          optionalDependencies: { fsevents: '^2.3.3' },
        }),
      );

      const report = await createPkgWise({ version: '0.1.0-test' }).analyzeProject({ root });

      assert.equal(report.status, 'partial');
      assert.equal(report.project.name, 'fixture-project');
      assert.equal(report.project.manager, 'unknown');
      assert.equal(report.project.mode, 'manifest-only');
      assert.equal(report.graph.directDependencyCount, 3);
      assert.deepEqual(report.graph.dependencyCounts, {
        runtime: 1,
        development: 1,
        peer: 0,
        optional: 1,
      });
      assert.equal(report.coverage.overall, 0);
      assert.equal(report.packages.length, 3);
      assert.ok(report.packages.every((item) => item.direct && item.minimumDepth === 1));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('builds a transitive graph from an npm lockfile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-npm-lock-'));
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'locked-project', dependencies: { a: '^1.0.0' } }),
      );
      await writeFile(
        join(root, 'package-lock.json'),
        JSON.stringify({
          name: 'locked-project',
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { a: '^1.0.0' } },
            'node_modules/a': { version: '1.0.0', dependencies: { b: '^2.0.0' } },
            'node_modules/b': { version: '2.0.0' },
          },
        }),
      );

      const report = await createPkgWise({ version: '0.1.0-test' }).analyzeProject({ root });

      assert.equal(report.project.manager, 'npm');
      assert.equal(report.graph.packageCount, 2);
      assert.equal(report.graph.transitiveDependencyCount, 1);
      assert.equal(report.graph.edgeCount, 2);
      assert.equal(report.graph.maximumDepth, 2);
      assert.equal(report.graph.lockfileVersion, '3');
      assert.equal(report.graph.fidelity, 'full');
      assert.equal(report.packages.length, 2);
      assert.equal(report.packages.find((item) => item.name === 'b')?.minimumDepth, 2);
      assert.equal(report.diagnostics[0]?.code, 'PW_ANALYSIS_GRAPH_AND_SCORING_READY');
      assert.equal(report.scores.status, 'available');
      assert.equal(report.scores.overall, 100);
      assert.equal(report.scores.coverage, 0.28);
      assert.equal(
        report.scores.categories.find((category) => category.category === 'reliability')?.score,
        100,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('emits deterministic findings from the resolved graph', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-findings-'));
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'findings-project', dependencies: { a: '1.0.0', b: '1.0.0' } }),
      );
      await writeFile(
        join(root, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { a: '1.0.0', b: '1.0.0' } },
            'node_modules/a': { version: '1.0.0', dependencies: { shared: '1.0.0' } },
            'node_modules/b': { version: '1.0.0', dependencies: { shared: '2.0.0' } },
            'node_modules/shared': { version: '1.0.0' },
            'node_modules/b/node_modules/shared': { version: '2.0.0' },
          },
        }),
      );

      const client = createPkgWise({ version: '0.1.0-test' });
      const first = await client.analyzeProject({ root });
      const second = await client.analyzeProject({ root });

      assert.equal(first.findings.length, 1);
      assert.equal(first.findings[0]?.ruleId, 'reliability/version-fragmentation');
      assert.equal(first.findings[0]?.fingerprint, second.findings[0]?.fingerprint);
      assert.equal(first.policy.status, 'passed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enriches unique exact coordinates with OSV and applies security policy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-project-osv-'));
    const queries: string[] = [];
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'security-project',
          dependencies: { a: '1.0.0', b: '1.0.0' },
          pkgwise: {
            schemaVersion: 1,
            policy: {
              fail: [
                {
                  type: 'finding',
                  minimumSeverity: 'high',
                  rules: ['security/osv-vulnerability'],
                },
              ],
            },
          },
        }),
      );
      await writeFile(
        join(root, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { a: '1.0.0', b: '1.0.0' } },
            'node_modules/a': { version: '1.0.0', dependencies: { shared: '2.0.0' } },
            'node_modules/b': { version: '1.0.0', dependencies: { shared: '2.0.0' } },
            'node_modules/shared': { version: '2.0.0' },
            'node_modules/b/node_modules/shared': { version: '2.0.0' },
          },
        }),
      );
      const client = createPkgWise({
        fetch: (async (_input, init) => {
          const query = JSON.parse(String(init?.body)) as {
            package: { name: string };
            version: string;
          };
          queries.push(`${query.package.name}@${query.version}`);
          return new Response(
            JSON.stringify({
              vulns:
                query.package.name === 'shared'
                  ? [
                      {
                        id: 'GHSA-test-project',
                        summary: 'A project-wide vulnerability.',
                        database_specific: { severity: 'HIGH' },
                      },
                    ]
                  : [],
            }),
            { status: 200 },
          );
        }) as typeof globalThis.fetch,
      });

      const report = await client.analyzeProject({ root, remote: true, cache: false });

      assert.equal(queries.filter((query) => query === 'shared@2.0.0').length, 1);
      assert.equal(report.enrichment.osv.status, 'available');
      assert.equal(report.enrichment.osv.eligibleCoordinateCount, 3);
      assert.equal(report.enrichment.osv.evaluatedCoordinateCount, 3);
      assert.equal(report.coverage.security, 1);
      assert.equal(report.scores.coverage, 0.58);
      assert.ok((report.scores.overall ?? 100) < 100);
      assert.equal(
        report.scores.categories.find((category) => category.category === 'security')?.status,
        'available',
      );
      assert.equal(report.advisories.length, 1);
      const securityFinding = report.findings.find(
        (finding) => finding.ruleId === 'security/osv-vulnerability',
      );
      assert.equal(securityFinding?.severity, 'high');
      assert.equal(securityFinding?.subject.packageIds.length, 2);
      assert.equal(report.policy.status, 'failed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reuses cached OSV project responses in offline mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-project-osv-cache-'));
    const cacheDirectory = join(root, '.cache');
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'cached-security-project', dependencies: { cached: '1.0.0' } }),
      );
      await writeFile(
        join(root, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { cached: '1.0.0' } },
            'node_modules/cached': { version: '1.0.0' },
          },
        }),
      );
      const online = createPkgWise({
        fetch: (async () =>
          new Response(JSON.stringify({ vulns: [] }), { status: 200 })) as typeof globalThis.fetch,
      });
      await online.analyzeProject({ root, remote: true, cacheDirectory });
      const offline = createPkgWise({
        fetch: (async () => {
          throw new Error('network must not be called');
        }) as typeof globalThis.fetch,
      });

      const report = await offline.analyzeProject({
        root,
        remote: true,
        offline: true,
        cacheDirectory,
      });

      assert.equal(report.enrichment.osv.status, 'available');
      assert.equal(report.enrichment.osv.evaluatedCoordinateCount, 1);
      assert.equal(report.coverage.security, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
