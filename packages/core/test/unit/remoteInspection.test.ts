import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createPkgWise, PkgWiseError } from '../../src/public/index.js';

describe('remote npm inspection', () => {
  it('resolves a dist-tag, writes cache, and serves it without a socket in offline mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-remote-'));
    const cacheDirectory = join(root, '.cache');
    let npmCalls = 0;
    let osvCalls = 0;
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('api.osv.dev')) {
        osvCalls += 1;
        assert.match(String(init?.body), /"version":"3\.0\.0-beta\.1"/);
        return new Response(
          JSON.stringify({
            vulns: [
              {
                id: 'GHSA-test-0001',
                aliases: ['CVE-2026-0001'],
                summary: 'A confirmed test vulnerability.',
                modified: '2026-01-01T00:00:00Z',
                database_specific: { severity: 'HIGH' },
                references: [{ type: 'ADVISORY', url: 'https://osv.dev/GHSA-test-0001' }],
              },
              {
                id: 'GHSA-withdrawn-0002',
                summary: 'Historical withdrawn advisory.',
                withdrawn: '2026-01-02T00:00:00Z',
                modified: '2026-01-02T00:00:00Z',
              },
              {
                id: 'GHSA-alias-0003',
                aliases: ['GHSA-test-0001'],
                summary: 'Duplicate alias record.',
                modified: '2026-01-03T00:00:00Z',
                database_specific: { severity: 'MODERATE' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      npmCalls += 1;
      assert.match(String(input), /demo-package$/);
      return new Response(
        JSON.stringify({
          name: 'demo-package',
          description: 'A test package.',
          'dist-tags': { latest: '2.0.0', next: '3.0.0-beta.1' },
          time: { created: '2020-01-01T00:00:00Z', '3.0.0-beta.1': '2025-12-01T00:00:00Z' },
          maintainers: [{ name: 'alice' }, { name: 'bob' }],
          versions: {
            '2.0.0': { version: '2.0.0', license: 'MIT', engines: { node: '>=22' } },
            '3.0.0-beta.1': {
              version: '3.0.0-beta.1',
              license: 'MIT',
              deprecated: 'Use the stable release.',
              repository: { type: 'git', url: 'https://example.test/demo.git' },
              scripts: { preinstall: 'node check.js', test: 'node test.js' },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'remote-fixture' }));
      const online = createPkgWise({ fetch, now: () => new Date('2026-01-01T00:00:00.000Z') });

      const first = await online.inspectPackage({
        packageSpec: 'demo-package@next',
        remote: true,
        cacheDirectory,
      });
      const offline = await createPkgWise({
        fetch: (async () => {
          throw new Error('network must not be called');
        }) as typeof globalThis.fetch,
        now: () => new Date('2026-01-01T01:00:00.000Z'),
      }).inspectPackage({
        packageSpec: 'demo-package@next',
        remote: true,
        offline: true,
        cacheDirectory,
      });

      assert.equal(npmCalls, 1);
      assert.equal(osvCalls, 1);
      assert.equal(first.remote?.selectedVersion, '3.0.0-beta.1');
      assert.equal(first.remote?.source.cache, 'miss');
      assert.equal(first.remote?.deprecated, 'Use the stable release.');
      assert.equal(first.remote?.publishedAt, '2025-12-01T00:00:00Z');
      assert.equal(first.remote?.createdAt, '2020-01-01T00:00:00Z');
      assert.equal(first.remote?.maintainerCount, 2);
      assert.deepEqual(first.remote?.lifecycleScripts, ['preinstall']);
      assert.equal(first.advisories.length, 2);
      assert.ok(first.advisories.some((item) => item.active === false));
      const activeAdvisory = first.advisories.find((item) => item.active);
      assert.equal(activeAdvisory?.severity, 'high');
      assert.ok(
        new Set([activeAdvisory?.id, ...(activeAdvisory?.aliases ?? [])]).has('GHSA-test-0001'),
      );
      assert.ok(
        new Set([activeAdvisory?.id, ...(activeAdvisory?.aliases ?? [])]).has('GHSA-alias-0003'),
      );
      assert.equal(first.findings[0]?.ruleId, 'security/osv-vulnerability');
      assert.equal(first.findings.length, 1);
      assert.equal(first.findings[0]?.priority, 'action-required');
      assert.equal(offline.remote?.source.cache, 'fresh');
      assert.equal(offline.advisories[0]?.source.cache, 'fresh');
      assert.equal(offline.packages.length, 0);
      assert.equal(offline.report.project.rootName, 'remote');

      const stale = await createPkgWise({
        fetch: (async () => {
          throw new Error('network must not be called');
        }) as typeof globalThis.fetch,
        now: () => new Date('2026-01-01T07:00:00.000Z'),
      }).inspectPackage({
        packageSpec: 'demo-package@next',
        remote: true,
        offline: true,
        cacheDirectory,
      });
      assert.equal(stale.remote?.source.cache, 'stale');
      assert.equal(stale.advisories[0]?.source.cache, 'stale');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a capability exit error when offline data is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-remote-offline-'));
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'remote-offline' }));
      await assert.rejects(
        createPkgWise().inspectPackage({
          packageSpec: 'missing-package',
          projectRoot: root,
          remote: true,
          offline: true,
          cacheDirectory: join(root, '.cache'),
        }),
        (error: unknown) =>
          error instanceof PkgWiseError && error.code === 'PW_PROVIDER_UNAVAILABLE',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
