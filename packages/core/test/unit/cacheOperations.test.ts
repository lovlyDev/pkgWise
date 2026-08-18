import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createPkgWise, PkgWiseError } from '../../src/public/index.js';

describe('cache operations', () => {
  it('reports owned entries and clears only the selected provider', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pkgwise-cache-'));
    const namespace = join(base, 'v1');
    try {
      await mkdir(join(namespace, 'entries', 'aa'), { recursive: true });
      await writeFile(
        join(namespace, 'metadata.json'),
        JSON.stringify({ schemaVersion: 1, owner: 'pkgwise' }),
      );
      await writeFile(join(namespace, 'entries', 'aa', 'npm.json'), entry('npm', '2999-01-01'));
      await writeFile(join(namespace, 'entries', 'aa', 'osv.json'), entry('osv', '2000-01-01'));
      await writeFile(join(namespace, 'entries', 'aa', 'broken.json'), '{');
      const client = createPkgWise();

      const before = await client.getCacheStatus({ cacheDirectory: base });
      const cleared = await client.clearCache({ cacheDirectory: base, provider: 'npm' });
      const after = await client.getCacheStatus({ cacheDirectory: base });

      assert.equal(before.owned, true);
      assert.equal(before.entryCount, 3);
      assert.equal(before.expiredEntryCount, 1);
      assert.equal(before.corruptEntryCount, 1);
      assert.deepEqual({ ...before.providers }, { npm: 1, osv: 1 });
      assert.equal(cleared.removedEntries, 1);
      assert.equal(cleared.namespaceRemoved, false);
      assert.equal(after.entryCount, 2);
      await readFile(join(namespace, 'metadata.json'), 'utf8');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('removes the version namespace only after validating its ownership marker', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pkgwise-cache-clear-'));
    const namespace = join(base, 'v1');
    try {
      await mkdir(namespace, { recursive: true });
      const client = createPkgWise();
      await assert.rejects(
        client.clearCache({ cacheDirectory: base }),
        (error: unknown) => error instanceof PkgWiseError && error.code === 'PW_CACHE_UNSAFE',
      );
      await writeFile(
        join(namespace, 'metadata.json'),
        JSON.stringify({ schemaVersion: 1, owner: 'pkgwise' }),
      );

      const result = await client.clearCache({ cacheDirectory: base });
      const status = await client.getCacheStatus({ cacheDirectory: base });

      assert.equal(result.namespaceRemoved, true);
      assert.equal(status.exists, false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

function entry(provider: string, expiresAt: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    key: `${provider}:test`,
    provider,
    operation: 'test',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt,
    lastAccessedAt: '2026-01-01T00:00:00.000Z',
    payloadSha256: 'a'.repeat(64),
    payload: {},
  });
}
