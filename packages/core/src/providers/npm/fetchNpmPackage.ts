import { DiskCacheStore, createCacheKey } from '../../cache/DiskCacheStore.js';
import type { RemotePackageMetadata } from '../../public/ClientResults.js';
import { defaultSleep, fetchWithRetry, type HttpRuntime } from '../http/fetchWithRetry.js';

export interface NpmPackageRequest {
  readonly name: string;
  readonly requestedVersion?: string;
  readonly offline: boolean;
  readonly refresh: boolean;
  readonly cache: boolean;
  readonly cacheDirectory?: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface NpmProviderRuntime {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => Date;
  readonly sleep?: HttpRuntime['sleep'];
  readonly random?: () => number;
}

export async function fetchNpmPackage(
  request: NpmPackageRequest,
  runtime: NpmProviderRuntime,
): Promise<RemotePackageMetadata> {
  const url = new URL(`https://registry.npmjs.org/${encodeURIComponent(request.name)}`);
  const key = createCacheKey('npm-registry', 'package-document', { name: request.name });
  const store = new DiskCacheStore(request.cacheDirectory, runtime.now);
  if (request.cache && (!request.refresh || request.offline)) {
    const cached = await store.read<unknown>(key, request.offline, request.signal);
    if (cached !== undefined) {
      const normalized = normalizeDocument(cached.value, request, url, cached.state);
      if (normalized !== undefined) return normalized;
    }
  }
  if (request.offline) return unavailable(request.name, url, 'offline');

  let response;
  try {
    response = await fetchWithRetry(
      {
        url,
        timeoutMs: request.timeoutMs,
        maximumBytes: 5 * 1024 * 1024,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      },
      {
        fetch: runtime.fetch,
        sleep: runtime.sleep ?? defaultSleep,
        random: runtime.random ?? Math.random,
      },
    );
  } catch {
    if (request.signal?.aborted === true) throw request.signal.reason;
    return unavailable(request.name, url, 'unavailable');
  }
  if (response.status === 404) return unavailable(request.name, url, 'not-found');
  if (response.status < 200 || response.status >= 300)
    return unavailable(request.name, url, 'unavailable');
  let document: unknown;
  try {
    document = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(response.body),
    ) as unknown;
  } catch {
    return unavailable(request.name, url, 'unavailable');
  }
  const normalized = normalizeDocument(document, request, url, 'miss');
  if (normalized === undefined) return unavailable(request.name, url, 'unavailable');
  if (request.cache) {
    await store.write(
      key,
      'npm-registry',
      'package-document',
      document,
      6 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
      request.signal,
    );
  }
  return normalized;
}

function normalizeDocument(
  value: unknown,
  request: NpmPackageRequest,
  url: URL,
  cache: RemotePackageMetadata['source']['cache'],
): RemotePackageMetadata | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.versions))
    return undefined;
  const versions = Object.keys(value.versions).sort(compareVersions);
  const tags = stringRecord(value['dist-tags']);
  const selectedVersion = resolveVersion(request.requestedVersion, tags, value.versions);
  const selected = selectedVersion === undefined ? undefined : value.versions[selectedVersion];
  if (request.requestedVersion !== undefined && !isRecord(selected)) {
    return {
      ...unavailable(request.name, url, 'not-found'),
      availableVersions: versions,
      distTags: tags,
    };
  }
  const metadata = isRecord(selected) ? selected : value;
  return {
    status: 'available',
    source: { provider: 'npm-registry', url: url.toString(), cache },
    name: value.name,
    ...(selectedVersion === undefined ? {} : { selectedVersion }),
    availableVersions: versions,
    distTags: tags,
    ...(typeof metadata.description === 'string' ? { description: metadata.description } : {}),
    ...(readLicense(metadata.license) === undefined
      ? {}
      : { license: readLicense(metadata.license) as string }),
    ...(typeof metadata.deprecated === 'string' ? { deprecated: metadata.deprecated } : {}),
    ...(Object.keys(stringRecord(metadata.engines)).length === 0
      ? {}
      : { engines: stringRecord(metadata.engines) }),
    ...(readRepository(metadata.repository) === undefined
      ? {}
      : { repository: readRepository(metadata.repository) as string }),
  };
}

function resolveVersion(
  requested: string | undefined,
  tags: Readonly<Record<string, string>>,
  versions: Readonly<Record<string, unknown>>,
): string | undefined {
  if (requested === undefined) return tags.latest;
  if (requested in versions) return requested;
  return tags[requested];
}

function unavailable(
  name: string,
  url: URL,
  status: 'not-found' | 'unavailable' | 'offline',
): RemotePackageMetadata {
  return {
    status,
    source: { provider: 'npm-registry', url: url.toString(), cache: 'miss' },
    name,
    availableVersions: [],
    distTags: {},
  };
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function readLicense(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.type === 'string' ? value.type : undefined;
}

function readRepository(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.url === 'string' ? value.url : undefined;
}

function compareVersions(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
