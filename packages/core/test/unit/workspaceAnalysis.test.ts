import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createPkgWise, PkgWiseError } from '../../src/public/index.js';

describe('workspace analysis', () => {
  it('selects an npm workspace by package name and changes graph roots', async () => {
    const root = await createNpmWorkspaceFixture();
    try {
      const report = await createPkgWise().analyzeProject({
        root,
        workspaces: ['@fixture/a'],
      });

      assert.equal(report.project.workspaces.availableCount, 2);
      assert.deepEqual(report.project.workspaces.selected, [
        { name: '@fixture/a', path: 'packages/a' },
      ]);
      assert.equal(report.graph.directDependencyCount, 1);
      assert.equal(report.graph.packageCount, 1);
      assert.equal(report.packages[0]?.name, 'a-dep');
      assert.equal(report.packages[0]?.direct, true);
      assert.ok(!report.packages.some((item) => item.name === 'root-only'));
      assert.match(report.diagnostics[0]?.message ?? '', /1 selected workspace/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('selects all workspaces and rejects unknown selectors deterministically', async () => {
    const root = await createNpmWorkspaceFixture();
    try {
      const report = await createPkgWise().analyzeProject({ root, workspaces: ['*'] });
      assert.equal(report.project.workspaces.selected.length, 2);
      assert.deepEqual(
        report.packages.map((item) => item.name),
        ['a-dep', 'b-dep'],
      );

      await assert.rejects(
        createPkgWise().analyzeProject({ root, workspaces: ['missing'] }),
        (error: unknown) =>
          error instanceof PkgWiseError && error.code === 'PW_WORKSPACE_NOT_FOUND',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('discovers pnpm workspaces and selects the matching lockfile importer', async () => {
    const root = await createPnpmWorkspaceFixture();
    try {
      const report = await createPkgWise().analyzeProject({
        root,
        workspaces: ['@fixture/pnpm-app'],
      });

      assert.equal(report.project.manager, 'pnpm');
      assert.equal(report.project.workspaces.availableCount, 1);
      assert.deepEqual(report.project.workspaces.selected, [
        { name: '@fixture/pnpm-app', path: 'apps/web' },
      ]);
      assert.equal(report.graph.directDependencyCount, 1);
      assert.equal(report.graph.packageCount, 1);
      assert.equal(report.packages[0]?.name, 'workspace-dep');
      assert.equal(report.packages[0]?.version, '2.0.0');
      assert.ok(!report.packages.some((item) => item.name === 'root-only'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createNpmWorkspaceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pkgwise-workspaces-'));
  await mkdir(join(root, 'packages', 'a'), { recursive: true });
  await mkdir(join(root, 'packages', 'b'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'workspace-root',
      private: true,
      packageManager: 'npm@11.0.0',
      workspaces: ['packages/*'],
      dependencies: { 'root-only': '1.0.0' },
    }),
  );
  await writeFile(
    join(root, 'packages', 'a', 'package.json'),
    JSON.stringify({ name: '@fixture/a', dependencies: { 'a-dep': '1.0.0' } }),
  );
  await writeFile(
    join(root, 'packages', 'b', 'package.json'),
    JSON.stringify({ name: '@fixture/b', dependencies: { 'b-dep': '1.0.0' } }),
  );
  await writeFile(
    join(root, 'package-lock.json'),
    JSON.stringify({
      name: 'workspace-root',
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { 'root-only': '1.0.0' } },
        'packages/a': { name: '@fixture/a', dependencies: { 'a-dep': '1.0.0' } },
        'packages/b': { name: '@fixture/b', dependencies: { 'b-dep': '1.0.0' } },
        'node_modules/a-dep': { version: '1.0.0', integrity: 'sha512-a' },
        'node_modules/b-dep': { version: '1.0.0', integrity: 'sha512-b' },
        'node_modules/root-only': { version: '1.0.0', integrity: 'sha512-root' },
      },
    }),
  );
  return root;
}

async function createPnpmWorkspaceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pkgwise-pnpm-workspaces-'));
  await mkdir(join(root, 'apps', 'web'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'workspace-root',
      private: true,
      packageManager: 'pnpm@10.0.0',
      dependencies: { 'root-only': '1.0.0' },
    }),
  );
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  await writeFile(
    join(root, 'apps', 'web', 'package.json'),
    JSON.stringify({ name: '@fixture/pnpm-app', dependencies: { 'workspace-dep': '2.0.0' } }),
  );
  await writeFile(
    join(root, 'pnpm-lock.yaml'),
    [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      root-only:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      '  apps/web:',
      '    dependencies:',
      '      workspace-dep:',
      '        specifier: 2.0.0',
      '        version: 2.0.0',
      'packages:',
      '  root-only@1.0.0: {}',
      '  workspace-dep@2.0.0: {}',
      'snapshots:',
      '  root-only@1.0.0: {}',
      '  workspace-dep@2.0.0: {}',
      '',
    ].join('\n'),
  );
  return root;
}
