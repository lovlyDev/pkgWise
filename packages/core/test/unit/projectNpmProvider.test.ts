import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fetchProjectNpm } from '../../src/providers/npm/fetchProjectNpm.js';

describe('project npm Registry provider', () => {
  it('deduplicates coordinates, reuses one package document, and supports offline cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-project-npm-'));
    let calls = 0;
    const fetch = (async (input: string | URL | Request) => {
      calls += 1;
      const name = decodeURIComponent(String(input).split('/').at(-1) ?? '');
      return new Response(
        JSON.stringify({
          name,
          time: {
            created: '2024-01-01T00:00:00.000Z',
            '1.0.0': '2025-01-01T00:00:00.000Z',
            '2.0.0': '2026-01-01T00:00:00.000Z',
          },
          maintainers: [{ name: 'a' }, { name: 'b' }],
          versions: {
            '1.0.0': { version: '1.0.0', license: 'MIT' },
            '2.0.0': {
              version: '2.0.0',
              license: 'Apache-2.0',
              repository: `https://example.test/${name}`,
              scripts: { install: 'node setup.js', test: 'node test.js' },
            },
          },
        }),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;
    const request = {
      offline: false,
      refresh: false,
      cache: true,
      cacheDirectory: root,
      timeoutMs: 1_000,
      concurrency: 4,
    } as const;
    const runtime = { fetch, now: () => new Date('2026-08-01T00:00:00.000Z') };
    try {
      const first = await fetchProjectNpm(
        [
          { name: 'a', version: '1.0.0' },
          { name: 'a', version: '1.0.0' },
          { name: 'a', version: '2.0.0' },
          { name: 'b', version: '2.0.0' },
        ],
        request,
        runtime,
      );

      assert.equal(calls, 2);
      assert.equal(first.status, 'available');
      assert.equal(first.eligibleCoordinateCount, 3);
      assert.equal(first.evaluatedCoordinateCount, 3);
      assert.deepEqual(
        first.packages.find((item) => item.name === 'a' && item.version === '2.0.0')
          ?.lifecycleScripts,
        ['install'],
      );
      assert.equal(first.packages[0]?.maintainerCount, 2);

      const offline = await fetchProjectNpm(
        [
          { name: 'a', version: '1.0.0' },
          { name: 'b', version: '2.0.0' },
        ],
        { ...request, offline: true },
        {
          ...runtime,
          fetch: (async () => {
            throw new Error('network must not be called');
          }) as typeof globalThis.fetch,
        },
      );
      assert.equal(offline.status, 'available');
      assert.ok(offline.packages.every((item) => item.source.cache === 'fresh'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports partial coverage without dropping unavailable coordinates', async () => {
    const result = await fetchProjectNpm(
      [
        { name: 'available', version: '1.0.0' },
        { name: 'missing', version: '1.0.0' },
      ],
      { offline: false, refresh: false, cache: false, timeoutMs: 1_000, concurrency: 2 },
      {
        now: () => new Date('2026-08-01T00:00:00.000Z'),
        fetch: (async (input: string | URL | Request) =>
          String(input).endsWith('/missing')
            ? new Response('', { status: 404 })
            : new Response(
                JSON.stringify({ name: 'available', versions: { '1.0.0': { version: '1.0.0' } } }),
                { status: 200 },
              )) as typeof globalThis.fetch,
      },
    );
    assert.equal(result.status, 'partial');
    assert.equal(result.evaluatedCoordinateCount, 1);
    assert.equal(result.unavailableCoordinateCount, 1);
    assert.equal(result.packages.find((item) => item.name === 'missing')?.status, 'not-found');
  });
});
