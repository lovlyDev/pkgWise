import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PkgWiseError, createPkgWise, type ProgressEvent } from '../../src/public/index.js';

describe('comparePackages', () => {
  it('compares two installed candidates from one shared analysis snapshot', async () => {
    const root = await createFixture();
    try {
      const progress: ProgressEvent[] = [];
      const comparison = await createPkgWise().comparePackages({
        packageA: 'a@1.0.0',
        packageB: 'b@2.0.0',
        projectRoot: root,
        targetNode: '22.0.0',
        onProgress: (event) => progress.push(event),
      });

      assert.equal(
        progress.filter((event) => event.type === 'phase-started' && event.phase === 'discovery')
          .length,
        1,
      );
      assert.deepEqual(
        comparison.metrics.map((metric) => metric.name),
        ['version', 'directness', 'scopes', 'depth', 'footprint', 'findings'],
      );
      assert.equal(
        comparison.metrics.find((item) => item.name === 'footprint')?.status,
        'different',
      );
      assert.equal(comparison.candidates[0].findings.length, 1);
      assert.equal(comparison.candidates[1].findings.length, 0);
      assert.equal(comparison.conclusion.winner, 'not-declared');
      assert.match(
        comparison.context.unavailableData.join(' '),
        /engine compatibility is unavailable/,
      );
      assert.equal(comparison.candidates[0].packages[0]?.resolvedDependencyCount, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('supports metric selection and omitting contextual recommendation', async () => {
    const root = await createFixture();
    try {
      const client = createPkgWise();
      const comparison = await client.comparePackages({
        packageA: 'a@1.0.0',
        packageB: 'b@2.0.0',
        projectRoot: root,
        metrics: ['footprint'],
        includeRecommendation: false,
      });

      assert.deepEqual(
        comparison.metrics.map((metric) => metric.name),
        ['footprint'],
      );
      assert.equal(comparison.recommendation, undefined);
      await assert.rejects(
        client.comparePackages({
          packageA: 'a@1.0.0',
          packageB: 'b@2.0.0',
          projectRoot: root,
          metrics: ['imaginary'],
        }),
        (error: unknown) => error instanceof PkgWiseError && error.code === 'PW_CONFIG_INVALID',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pkgwise-compare-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'compare-project', dependencies: { a: '1.0.0', b: '2.0.0' } }),
  );
  await writeFile(
    join(root, 'package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { a: '1.0.0', b: '2.0.0' } },
        'node_modules/a': {
          version: '1.0.0',
          dependencies: { child: '1.0.0', missing: '1.0.0' },
        },
        'node_modules/b': { version: '2.0.0' },
        'node_modules/child': { version: '1.0.0' },
      },
    }),
  );
  return root;
}
