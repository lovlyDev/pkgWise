import { constants } from 'node:fs';
import { access, lstat, readFile, readdir, rm, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';
import { PkgWiseError } from '../errors/PkgWiseError.js';
import type { CacheStatusInput, ClearCacheInput } from '../public/ClientInputs.js';
import type { CacheStatusReport, ClearCacheResult } from '../public/ClientResults.js';

interface CacheEntryFile {
  readonly path: string;
  readonly bytes: number;
  readonly provider?: string;
  readonly expired: boolean;
  readonly corrupt: boolean;
}

export async function getCacheStatus(input: CacheStatusInput = {}): Promise<CacheStatusReport> {
  input.signal?.throwIfAborted();
  const path = resolveCacheNamespace(input.cacheDirectory);
  const exists = await pathExists(path);
  if (!exists) return emptyStatus(path);
  await assertSafeDirectory(path);
  const owned = await hasValidMarker(path);
  const files = await readEntryFiles(path, input.signal);
  const providers: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const file of files) {
    if (file.provider !== undefined) providers[file.provider] = (providers[file.provider] ?? 0) + 1;
  }
  return {
    schemaVersion: '1',
    path,
    exists: true,
    owned,
    entryCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    expiredEntryCount: files.filter((file) => file.expired).length,
    corruptEntryCount: files.filter((file) => file.corrupt).length,
    providers,
  };
}

export async function clearCache(input: ClearCacheInput = {}): Promise<ClearCacheResult> {
  input.signal?.throwIfAborted();
  const path = resolveCacheNamespace(input.cacheDirectory);
  if (!(await pathExists(path))) return emptyClearResult(path, input.provider);
  await assertSafeDirectory(path);
  if (!(await hasValidMarker(path)))
    throw unsafeCacheError(path, 'the ownership marker is missing or invalid');
  const files = await readEntryFiles(path, input.signal);
  const selected =
    input.provider === undefined ? files : files.filter((file) => file.provider === input.provider);
  const removedBytes = selected.reduce((sum, file) => sum + file.bytes, 0);

  if (input.provider === undefined) {
    await rm(path, { recursive: true, force: false });
  } else {
    for (const file of selected) {
      input.signal?.throwIfAborted();
      await unlink(file.path);
    }
  }
  return {
    schemaVersion: '1',
    path,
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    removedEntries: selected.length,
    removedBytes,
    namespaceRemoved: input.provider === undefined,
  };
}

export function resolveCacheNamespace(configured: string | undefined): string {
  const base = resolve(configured ?? defaultCacheBase());
  const home = resolve(homedir());
  if (base === parse(base).root || base === home) {
    throw unsafeCacheError(
      base,
      'a filesystem root or home directory cannot be used as a cache directory',
    );
  }
  const namespace = resolve(base, 'v1');
  const child = relative(base, namespace);
  if (child.startsWith('..') || isAbsolute(child)) {
    throw unsafeCacheError(namespace, 'the cache namespace escapes its configured directory');
  }
  return namespace;
}

function defaultCacheBase(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'pkgwise');
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'pkgwise');
}

async function hasValidMarker(path: string): Promise<boolean> {
  try {
    const value = JSON.parse(await readFile(join(path, 'metadata.json'), 'utf8')) as unknown;
    return isRecord(value) && value.schemaVersion === 1 && value.owner === 'pkgwise';
  } catch {
    return false;
  }
}

async function readEntryFiles(path: string, signal?: AbortSignal): Promise<CacheEntryFile[]> {
  const root = join(path, 'entries');
  if (!(await pathExists(root))) return [];
  await assertSafeDirectory(root);
  const result: CacheEntryFile[] = [];
  await visit(root, result, signal);
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function visit(
  directory: string,
  result: CacheEntryFile[],
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      await visit(path, result, signal);
    } else if (item.isFile() && item.name.endsWith('.json')) {
      const file = await stat(path);
      try {
        const value = JSON.parse(await readFile(path, 'utf8')) as unknown;
        const valid = isCacheEntryEnvelope(value);
        const expires = valid ? Date.parse(value.expiresAt as string) : Number.NaN;
        result.push({
          path,
          bytes: file.size,
          ...(valid ? { provider: value.provider as string } : {}),
          expired: Number.isFinite(expires) && expires <= Date.now(),
          corrupt: !valid || !Number.isFinite(expires),
        });
      } catch {
        result.push({ path, bytes: file.size, expired: false, corrupt: true });
      }
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

async function assertSafeDirectory(path: string): Promise<void> {
  const item = await lstat(path);
  if (!item.isDirectory() || item.isSymbolicLink()) {
    throw unsafeCacheError(path, 'the cache path must be a real directory and not a symbolic link');
  }
}

function emptyStatus(path: string): CacheStatusReport {
  return {
    schemaVersion: '1',
    path,
    exists: false,
    owned: false,
    entryCount: 0,
    totalBytes: 0,
    expiredEntryCount: 0,
    corruptEntryCount: 0,
    providers: {},
  };
}

function emptyClearResult(path: string, provider: string | undefined): ClearCacheResult {
  return {
    schemaVersion: '1',
    path,
    ...(provider === undefined ? {} : { provider }),
    removedEntries: 0,
    removedBytes: 0,
    namespaceRemoved: false,
  };
}

function unsafeCacheError(path: string, reason: string): PkgWiseError {
  return new PkgWiseError({
    code: 'PW_CACHE_UNSAFE',
    userMessage: `Refusing cache operation for ${path}: ${reason}.`,
    recoverable: false,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCacheEntryEnvelope(value: unknown): value is Record<string, unknown> & {
  provider: string;
  expiresAt: string;
} {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.key === 'string' &&
    typeof value.provider === 'string' &&
    typeof value.operation === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.expiresAt === 'string' &&
    typeof value.lastAccessedAt === 'string' &&
    typeof value.payloadSha256 === 'string' &&
    'payload' in value
  );
}

function isMissingFileError(value: unknown): boolean {
  return value instanceof Error && 'code' in value && value.code === 'ENOENT';
}
