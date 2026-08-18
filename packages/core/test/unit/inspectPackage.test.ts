import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PkgWiseError, createPkgWise } from '../../src/public/index.js';

describe('inspectPackage', () => {
  it('inspects an exact installed version with paths and related findings', async () => {
    const root = await createFixture();
    try {
      const inspection = await createPkgWise().inspectPackage({
        packageSpec: 'shared@1.0.0',
        projectRoot: root,
      });

      assert.deepEqual(inspection.availableVersions, ['1.0.0', '2.0.0']);
      assert.equal(inspection.packages.length, 1);
      assert.equal(inspection.packages[0]?.version, '1.0.0');
      assert.equal(inspection.packages[0]?.minimumDepth, 2);
      assert.deepEqual(
        inspection.packages[0]?.dependencyPaths[0]?.packages.map((item) => item.name),
        ['a', 'shared'],
      );
      assert.equal(inspection.findings[0]?.ruleId, 'reliability/version-fragmentation');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires disambiguation for multiple versions and supports --all-versions semantics', async () => {
    const root = await createFixture();
    try {
      const client = createPkgWise();
      await assert.rejects(
        client.inspectPackage({ packageSpec: 'shared', projectRoot: root }),
        (error: unknown) =>
          error instanceof PkgWiseError && error.code === 'PW_PACKAGE_SELECTOR_AMBIGUOUS',
      );

      const inspection = await client.inspectPackage({
        packageSpec: 'shared',
        projectRoot: root,
        allVersions: true,
        includePaths: false,
      });
      assert.deepEqual(
        inspection.packages.map((item) => item.version),
        ['1.0.0', '2.0.0'],
      );
      assert.ok(inspection.packages.every((item) => item.dependencyPaths.length === 0));
      assert.ok(inspection.findings.every((item) => item.dependencyPaths.length === 0));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports an absent local package without inventing remote data', async () => {
    const root = await createFixture();
    try {
      await assert.rejects(
        createPkgWise().inspectPackage({ packageSpec: 'absent', projectRoot: root }),
        (error: unknown) => error instanceof PkgWiseError && error.code === 'PW_PACKAGE_NOT_FOUND',
      );
      await assert.rejects(
        createPkgWise().inspectPackage({ packageSpec: 'shared@^1.0.0', projectRoot: root }),
        (error: unknown) =>
          error instanceof PkgWiseError && error.code === 'PW_PACKAGE_SPEC_INVALID',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pkgwise-inspect-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'inspect-project', dependencies: { a: '1.0.0', b: '1.0.0' } }),
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
