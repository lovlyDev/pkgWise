import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createPkgWise, PkgWiseError } from '../../src/public/index.js';

describe('configuration and policy', () => {
  it('discovers project configuration and applies project, rule, and coverage settings', async () => {
    const root = await createFixture();
    try {
      await writeFile(
        join(root, 'pkgwise.config.json'),
        JSON.stringify({
          schemaVersion: 1,
          project: { includeDev: false },
          rules: { 'reliability/version-fragmentation': false },
          policy: { minimumOverallCoverage: 0.5 },
        }),
      );

      const report = await createPkgWise().analyzeProject({ root });

      assert.equal(report.configuration.source, 'project-file');
      assert.equal(report.graph.dependencyCounts.development, 0);
      assert.ok(!report.configuration.enabledRules.includes('reliability/version-fragmentation'));
      assert.equal(report.findings.length, 0);
      assert.equal(report.policy.status, 'failed');
      assert.equal(report.policy.violations[0]?.condition, 'minimumOverallCoverage');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads package.json configuration and fails a matching finding condition', async () => {
    const root = await createFixture({
      pkgwise: {
        schemaVersion: 1,
        policy: {
          fail: [
            {
              type: 'finding',
              minimumSeverity: 'low',
              rules: ['reliability/version-fragmentation', 'security/osv-vulnerability'],
            },
          ],
        },
      },
    });
    try {
      const report = await createPkgWise().analyzeProject({ root });

      assert.equal(report.configuration.source, 'package-json');
      assert.equal(report.policy.status, 'failed');
      assert.equal(report.policy.violations.length, 1);
      assert.deepEqual(report.policy.violations[0]?.findingFingerprints, [
        report.findings[0]?.fingerprint,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('gives an explicit configuration file precedence over project configuration', async () => {
    const root = await createFixture();
    const explicit = join(root, 'ci.pkgwise.json');
    try {
      await writeFile(
        join(root, 'pkgwise.config.json'),
        JSON.stringify({ schemaVersion: 1, policy: { minimumOverallCoverage: 1 } }),
      );
      await writeFile(
        explicit,
        JSON.stringify({
          schemaVersion: 1,
          rules: { 'reliability/version-fragmentation': false },
        }),
      );

      const report = await createPkgWise().analyzeProject({ root, configFile: explicit });

      assert.equal(report.configuration.source, 'explicit-file');
      assert.equal(report.configuration.relativePath, 'ci.pkgwise.json');
      assert.equal(report.policy.status, 'passed');
      assert.equal(report.policy.configured, false);
      assert.equal(report.findings.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unknown configuration fields with a stable error code', async () => {
    const root = await createFixture();
    try {
      await writeFile(
        join(root, 'pkgwise.config.json'),
        JSON.stringify({ schemaVersion: 1, unsupported: true }),
      );

      await assert.rejects(
        createPkgWise().analyzeProject({ root }),
        (error: unknown) =>
          error instanceof PkgWiseError &&
          error.code === 'PW_CONFIG_INVALID' &&
          error.userMessage.includes('/unsupported: unknown property'),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createFixture(
  manifestOverrides: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pkgwise-config-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'configuration-fixture',
      dependencies: { a: '1.0.0', b: '1.0.0' },
      devDependencies: { dev: '1.0.0' },
      ...manifestOverrides,
    }),
  );
  await writeFile(
    join(root, 'package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {
          dependencies: { a: '1.0.0', b: '1.0.0' },
          devDependencies: { dev: '1.0.0' },
        },
        'node_modules/a': { version: '1.0.0', dependencies: { shared: '1.0.0' } },
        'node_modules/b': { version: '1.0.0', dependencies: { shared: '2.0.0' } },
        'node_modules/shared': { version: '1.0.0' },
        'node_modules/b/node_modules/shared': { version: '2.0.0' },
        'node_modules/dev': { version: '1.0.0', dev: true },
      },
    }),
  );
  return root;
}
