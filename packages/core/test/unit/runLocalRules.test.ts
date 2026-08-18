import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PkgWiseError } from '../../src/errors/PkgWiseError.js';
import { analyzeDependencyGraph } from '../../src/project/lockfile/analyzeDependencyGraph.js';
import { parseNpmLockfile } from '../../src/project/lockfile/parseNpmLockfile.js';
import { runLocalRules } from '../../src/rules/runLocalRules.js';

describe('runLocalRules', () => {
  const graph = analyzeDependencyGraph(
    parseNpmLockfile(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { a: '1.0.0', b: '1.0.0' } },
          'node_modules/a': {
            version: '1.0.0',
            dependencies: { b: '1.0.0', missing: '1.0.0', shared: '1.0.0' },
            optionalDependencies: { optionalMissing: '1.0.0' },
          },
          'node_modules/b': {
            version: '1.0.0',
            dependencies: { a: '1.0.0', shared: '2.0.0' },
          },
          'node_modules/shared': { version: '1.0.0' },
          'node_modules/b/node_modules/shared': { version: '2.0.0' },
        },
      }),
    ),
  );

  it('runs default local rules without enabling informational package cycles', () => {
    const first = runLocalRules(graph);
    const second = runLocalRules(graph);

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.map((finding) => finding.ruleId),
      ['compatibility/unresolved-dependency', 'reliability/version-fragmentation'],
    );
    assert.ok(first.every((finding) => /^[a-f0-9]{64}$/.test(finding.fingerprint)));
    assert.ok(first.every((finding) => finding.evidence.length === 1));
    assert.ok(first.every((finding) => finding.dependencyPaths.length > 0));
    assert.equal(
      first.some((finding) => finding.title.includes('optionalMissing')),
      false,
    );
  });

  it('runs only an explicitly selected cycle rule', () => {
    const findings = runLocalRules(graph, ['reliability/dependency-cycle']);

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.severity, 'info');
    assert.equal(findings[0]?.priority, 'informational');
  });

  it('rejects an unknown rule ID', () => {
    assert.throws(
      () => runLocalRules(graph, ['unknown/rule']),
      (error: unknown) => error instanceof PkgWiseError && error.code === 'PW_CONFIG_INVALID',
    );
  });
});
