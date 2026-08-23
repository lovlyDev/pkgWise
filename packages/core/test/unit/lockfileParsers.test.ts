import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNpmLockfile } from '../../src/project/lockfile/parseNpmLockfile.js';
import { parsePnpmLockfile } from '../../src/project/lockfile/parsePnpmLockfile.js';
import { summarizeDependencyGraph } from '../../src/project/lockfile/summarizeDependencyGraph.js';

describe('lockfile parsers', () => {
  it('resolves npm hoisting and nested package locations deterministically', () => {
    const graph = parseNpmLockfile(
      JSON.stringify({
        name: 'fixture',
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { a: '^1.0.0' }, devDependencies: { tool: '^1.0.0' } },
          'node_modules/a': {
            version: '1.0.0',
            dependencies: { shared: '^2.0.0' },
            optionalDependencies: { missing: '^1.0.0' },
          },
          'node_modules/a/node_modules/shared': { version: '2.0.0' },
          'node_modules/shared': { version: '1.0.0' },
          'node_modules/tool': { version: '1.0.0', dependencies: { shared: '^1.0.0' } },
        },
      }),
    );

    assert.deepEqual(summarizeDependencyGraph(graph), {
      packageCount: 4,
      edgeCount: 5,
      unresolvedDependencyCount: 1,
      maximumDepth: 2,
    });
    assert.deepEqual(summarizeDependencyGraph(graph, false), {
      packageCount: 2,
      edgeCount: 3,
      unresolvedDependencyCount: 1,
      maximumDepth: 2,
    });
  });

  it('combines pnpm package metadata and snapshot relationships', () => {
    const graph = parsePnpmLockfile(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      a:
        specifier: ^1.0.0
        version: 1.0.0
    devDependencies:
      tool:
        specifier: ^1.0.0
        version: 1.0.0
packages:
  a@1.0.0: {}
  shared@1.0.0: {}
  shared@2.0.0: {}
  tool@1.0.0: {}
snapshots:
  a@1.0.0:
    dependencies:
      shared: 2.0.0
    optionalDependencies:
      missing: 1.0.0
  shared@1.0.0: {}
  shared@2.0.0: {}
  tool@1.0.0:
    dependencies:
      shared: 1.0.0
`);

    assert.equal(graph.lockfileVersion, '9.0');
    assert.deepEqual(summarizeDependencyGraph(graph), {
      packageCount: 4,
      edgeCount: 5,
      unresolvedDependencyCount: 1,
      maximumDepth: 2,
    });
  });

  it('rejects unsupported lockfile versions instead of guessing', () => {
    assert.throws(
      () => parseNpmLockfile('{"lockfileVersion":1,"packages":{}}'),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'PW_LOCKFILE_VERSION_UNSUPPORTED',
    );
  });

  it('preserves pnpm peer-context keys and resolves npm aliases', () => {
    const graph = parsePnpmLockfile(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      alias:
        specifier: npm:real@^1.0.0
        version: npm:real@1.0.0
packages:
  real@1.0.0: {}
  consumer@1.0.0(peer@2.0.0): {}
snapshots:
  real@1.0.0: {}
  consumer@1.0.0(peer@2.0.0): {}
`);

    assert.equal(graph.importer.dependencies[0]?.targetId, 'real@1.0.0');
    const consumer = graph.packages.find((item) => item.name === 'consumer');
    assert.equal(consumer?.version, '1.0.0(peer@2.0.0)');
  });

  it('combines only selected pnpm workspace importers', () => {
    const graph = parsePnpmLockfile(
      `
lockfileVersion: '9.0'
importers:
  .: {}
  packages/a:
    dependencies:
      a-dep:
        specifier: 1.0.0
        version: 1.0.0
  packages/b:
    dependencies:
      b-dep:
        specifier: 1.0.0
        version: 1.0.0
packages:
  a-dep@1.0.0: {}
  b-dep@1.0.0: {}
snapshots:
  a-dep@1.0.0: {}
  b-dep@1.0.0: {}
`,
      ['packages/b'],
    );

    assert.equal(graph.importer.id, 'packages/b');
    assert.deepEqual(
      graph.importer.dependencies.map((item) => item.name),
      ['b-dep'],
    );
    assert.deepEqual(summarizeDependencyGraph(graph), {
      packageCount: 1,
      edgeCount: 1,
      unresolvedDependencyCount: 0,
      maximumDepth: 1,
    });
  });
});
