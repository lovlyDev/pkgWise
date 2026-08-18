import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveCacheNamespace } from './cacheOperations.js';
import { PkgWiseError } from '../errors/PkgWiseError.js';

interface CacheEnvelope {
  readonly schemaVersion: 1;
  readonly key: string;
  readonly provider: string;
  readonly operation: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly staleUntil: string;
  readonly lastAccessedAt: string;
  readonly payloadSha256: string;
  readonly payload: unknown;
}

export interface CacheReadResult<T> {
  readonly state: 'fresh' | 'stale';
  readonly value: T;
}

export class DiskCacheStore {
  readonly #namespace: string;
  readonly #now: () => Date;

  constructor(cacheDirectory?: string, now: () => Date = () => new Date()) {
    this.#namespace = resolveCacheNamespace(cacheDirectory);
    this.#now = now;
  }

  async read<T>(
    key: string,
    allowStale: boolean,
    signal?: AbortSignal,
  ): Promise<CacheReadResult<T> | undefined> {
    signal?.throwIfAborted();
    const path = this.#entryPath(key);
    await assertSafeExistingSegments(this.#namespace, path);
    try {
      const envelope = JSON.parse(await readFile(path, 'utf8')) as unknown;
      if (
        !isEnvelope(envelope) ||
        envelope.key !== key ||
        checksum(envelope.payload) !== envelope.payloadSha256
      ) {
        await this.#quarantine(path);
        return undefined;
      }
      const now = this.#now().getTime();
      const expires = Date.parse(envelope.expiresAt);
      const staleUntil = Date.parse(envelope.staleUntil);
      if (!Number.isFinite(expires) || !Number.isFinite(staleUntil)) {
        await this.#quarantine(path);
        return undefined;
      }
      if (now <= expires) return { state: 'fresh', value: envelope.payload as T };
      if (allowStale && now <= staleUntil) return { state: 'stale', value: envelope.payload as T };
      return undefined;
    } catch (error) {
      if (isMissing(error)) return undefined;
      await this.#quarantine(path);
      return undefined;
    }
  }

  async write(
    key: string,
    provider: string,
    operation: string,
    payload: unknown,
    freshMilliseconds: number,
    staleMilliseconds: number,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const now = this.#now();
    const path = this.#entryPath(key);
    const temporary = `${path}.${randomUUID()}.tmp`;
    const envelope: CacheEnvelope = {
      schemaVersion: 1,
      key,
      provider,
      operation,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + freshMilliseconds).toISOString(),
      staleUntil: new Date(now.getTime() + staleMilliseconds).toISOString(),
      lastAccessedAt: now.toISOString(),
      payloadSha256: checksum(payload),
      payload,
    };
    await assertSafeExistingSegments(this.#namespace, path);
    await mkdir(dirname(path), { recursive: true });
    await assertSafeExistingSegments(this.#namespace, path);
    await ensureMarker(this.#namespace);
    try {
      await writeFile(temporary, JSON.stringify(envelope), { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  #entryPath(key: string): string {
    const digest = createHash('sha256').update(key).digest('hex');
    return join(this.#namespace, 'entries', digest.slice(0, 2), `${digest}.json`);
  }

  async #quarantine(path: string): Promise<void> {
    try {
      const target = join(this.#namespace, 'quarantine', `${randomUUID()}.json`);
      await mkdir(dirname(target), { recursive: true });
      await rename(path, target);
    } catch {
      // A corrupt cache entry behaves as a miss even when best-effort quarantine fails.
    }
  }
}

export function createCacheKey(provider: string, operation: string, request: unknown): string {
  return JSON.stringify({ schemaVersion: 1, provider, operation, request });
}

function checksum(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isEnvelope(value: unknown): value is CacheEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    item.schemaVersion === 1 &&
    typeof item.key === 'string' &&
    typeof item.provider === 'string' &&
    typeof item.operation === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.expiresAt === 'string' &&
    typeof item.staleUntil === 'string' &&
    typeof item.lastAccessedAt === 'string' &&
    typeof item.payloadSha256 === 'string' &&
    'payload' in item
  );
}

function isMissing(value: unknown): boolean {
  return value instanceof Error && 'code' in value && value.code === 'ENOENT';
}

async function ensureMarker(namespace: string): Promise<void> {
  try {
    await writeFile(
      join(namespace, 'metadata.json'),
      JSON.stringify({ schemaVersion: 1, owner: 'pkgwise' }),
      { flag: 'wx' },
    );
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    try {
      const marker = JSON.parse(
        await readFile(join(namespace, 'metadata.json'), 'utf8'),
      ) as unknown;
      if (
        typeof marker !== 'object' ||
        marker === null ||
        Array.isArray(marker) ||
        (marker as Record<string, unknown>).schemaVersion !== 1 ||
        (marker as Record<string, unknown>).owner !== 'pkgwise'
      )
        throw new Error('invalid ownership marker');
    } catch (cause) {
      throw new PkgWiseError({
        code: 'PW_CACHE_UNSAFE',
        userMessage: `Refusing to write cache namespace ${namespace}: the ownership marker is invalid.`,
        recoverable: false,
        cause,
      });
    }
  }
}

async function assertSafeExistingSegments(namespace: string, entryPath: string): Promise<void> {
  for (const path of [namespace, join(namespace, 'entries'), dirname(entryPath)]) {
    try {
      const item = await lstat(path);
      if (!item.isDirectory() || item.isSymbolicLink()) {
        throw new PkgWiseError({
          code: 'PW_CACHE_UNSAFE',
          userMessage: `Refusing cache operation through non-directory or symbolic path ${path}.`,
          recoverable: false,
        });
      }
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
  }
}
