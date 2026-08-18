import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRegistryFindings } from '../../src/rules/createRegistryFindings.js';
import type { PackageReport, ProjectPackageMetadata } from '../../src/public/ClientResults.js';

describe('Registry findings', () => {
  it('emits stable evidence-backed deprecation and install-script findings', () => {
    const packages: PackageReport[] = [
      {
        id: 'old-1',
        name: 'old',
        version: '1.0.0',
        direct: true,
        directScopes: ['runtime'],
        minimumDepth: 1,
        dependencyPaths: [],
        pathsTruncated: false,
        resolvedDependencyCount: 0,
      },
    ];
    const metadata: ProjectPackageMetadata[] = [
      {
        name: 'old',
        version: '1.0.0',
        status: 'available',
        deprecated: 'Use new.',
        lifecycleScripts: ['install'],
        source: { provider: 'npm-registry', url: 'https://registry.npmjs.org/old', cache: 'miss' },
      },
    ];
    const first = createRegistryFindings(metadata, packages);
    const second = createRegistryFindings(metadata, packages);

    assert.deepEqual(
      first.map((item) => item.fingerprint),
      second.map((item) => item.fingerprint),
    );
    assert.deepEqual(
      first.map((item) => item.ruleId),
      ['maintenance/npm-deprecated', 'supply-chain/install-script'],
    );
    assert.equal(first[0]?.severity, 'medium');
    assert.equal(first[0]?.evidence[0]?.kind, 'confirmed-fact');
    assert.equal(first[1]?.evidence[0]?.kind, 'potential-risk');
  });
});
