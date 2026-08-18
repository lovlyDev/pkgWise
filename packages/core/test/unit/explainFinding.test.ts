import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PkgWiseError, createPkgWise } from '../../src/public/index.js';

describe('explainFinding', () => {
  it('selects a finding by fingerprint and includes bounded shortest paths', async () => {
    const root = await createFixture();
    try {
      const client = createPkgWise({ version: '0.1.0-test' });
      const report = await client.analyzeProject({ root });
      const fingerprint = report.findings[0]?.fingerprint;
      assert.ok(fingerprint !== undefined);

      const explanation = await client.explainFinding({ selector: fingerprint, projectRoot: root });

      assert.equal(explanation.finding.fingerprint, fingerprint);
      assert.equal(explanation.finding.dependencyPaths.length, 2);
      assert.ok(
        explanation.finding.dependencyPaths.every(
          (path) => path.packages.length === 2 && path.packages.at(-1)?.name === 'shared',
        ),
      );
      assert.equal(explanation.relatedPackages.length, 2);
      assert.equal(explanation.report.project.name, 'explain-project');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('supports a unique package selector and rejects a missing selector', async () => {
    const root = await createFixture();
    try {
      const client = createPkgWise();
      const explanation = await client.explainFinding({ selector: 'shared', projectRoot: root });
      assert.equal(explanation.finding.ruleId, 'reliability/version-fragmentation');

      await assert.rejects(
        client.explainFinding({ selector: 'does-not-exist', projectRoot: root }),
        (error: unknown) => error instanceof PkgWiseError && error.code === 'PW_FINDING_NOT_FOUND',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pkgwise-explain-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'explain-project', dependencies: { a: '1.0.0', b: '1.0.0' } }),
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
  return root;
}
