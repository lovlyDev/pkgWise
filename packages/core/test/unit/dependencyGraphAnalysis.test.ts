import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeDependencyGraph } from '../../src/project/lockfile/analyzeDependencyGraph.js';
import { parseNpmLockfile } from '../../src/project/lockfile/parseNpmLockfile.js';

describe('analyzeDependencyGraph', () => {
  it('reports stable packages, duplicate versions, and strongly connected cycles', () => {
    const graph = parseNpmLockfile(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { a: '^1.0.0', b: '^1.0.0' } },
          'node_modules/a': {
            version: '1.0.0',
            dependencies: { b: '^1.0.0', shared: '^1.0.0' },
          },
          'node_modules/b': {
            version: '1.0.0',
            dependencies: { a: '^1.0.0', shared: '^2.0.0' },
          },
          'node_modules/shared': { version: '1.0.0' },
          'node_modules/b/node_modules/shared': { version: '2.0.0' },
        },
      }),
    );

    const first = analyzeDependencyGraph(graph);
    const second = analyzeDependencyGraph(graph);

    assert.deepEqual(first, second);
    assert.equal(first.summary.packageCount, 4);
    assert.equal(first.summary.maximumDepth, 2);
    assert.deepEqual(first.duplicateVersions, [
      { name: 'shared', versions: ['1.0.0', '2.0.0'], packageCount: 2 },
    ]);
    assert.equal(first.cycles.length, 1);
    assert.equal(first.cycles[0]?.packageIds.length, 2);
    assert.ok(first.packages.every((item) => /^[a-f0-9]{64}$/.test(item.id)));
    assert.deepEqual(
      first.packages.filter((item) => item.direct).map((item) => item.name),
      ['a', 'b'],
    );
    assert.ok(
      first.packages.every((item) => {
        const path = first.pathsByPackageId.get(item.id);
        return path?.packages.length === item.minimumDepth && path.packages.at(-1)?.id === item.id;
      }),
    );
  });

  it('recognizes a self-loop as a cycle', () => {
    const graph = parseNpmLockfile(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { recursive: '1.0.0' } },
          'node_modules/recursive': {
            version: '1.0.0',
            dependencies: { recursive: '1.0.0' },
          },
        },
      }),
    );

    const result = analyzeDependencyGraph(graph);
    assert.equal(result.cycles.length, 1);
    assert.equal(result.cycles[0]?.packageIds.length, 1);
  });
});
