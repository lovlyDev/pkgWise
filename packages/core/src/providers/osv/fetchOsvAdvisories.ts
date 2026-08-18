import { DiskCacheStore, createCacheKey } from '../../cache/DiskCacheStore.js';
import type { FindingSeverity, SecurityAdvisory } from '../../public/ClientResults.js';
import { defaultSleep, fetchWithRetry, type HttpRuntime } from '../http/fetchWithRetry.js';

export interface OsvRequest {
  readonly name: string;
  readonly version: string;
  readonly offline: boolean;
  readonly refresh: boolean;
  readonly cache: boolean;
  readonly cacheDirectory?: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface OsvRuntime {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => Date;
  readonly sleep?: HttpRuntime['sleep'];
  readonly random?: () => number;
}

export interface OsvResult {
  readonly status: 'available' | 'offline' | 'unavailable';
  readonly cache: 'miss' | 'fresh' | 'stale';
  readonly advisories: readonly SecurityAdvisory[];
}

const endpoint = new URL('https://api.osv.dev/v1/query');

export async function fetchOsvAdvisories(
  request: OsvRequest,
  runtime: OsvRuntime,
): Promise<OsvResult> {
  const query = { package: { ecosystem: 'npm', name: request.name }, version: request.version };
  const key = createCacheKey('osv', 'query', query);
  const store = new DiskCacheStore(request.cacheDirectory, runtime.now);
  if (request.cache && (!request.refresh || request.offline)) {
    const cached = await store.read<unknown>(key, request.offline, request.signal);
    if (cached !== undefined) {
      const advisories = normalizeResponse(cached.value, cached.state);
      if (advisories !== undefined) {
        return { status: 'available', cache: cached.state, advisories };
      }
    }
  }
  if (request.offline) return { status: 'offline', cache: 'miss', advisories: [] };

  let response;
  try {
    const body = JSON.stringify(query);
    response = await fetchWithRetry(
      {
        url: endpoint,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
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
    return { status: 'unavailable', cache: 'miss', advisories: [] };
  }
  if (response.status < 200 || response.status >= 300) {
    return { status: 'unavailable', cache: 'miss', advisories: [] };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(response.body),
    ) as unknown;
  } catch {
    return { status: 'unavailable', cache: 'miss', advisories: [] };
  }
  const advisories = normalizeResponse(payload, 'miss');
  if (advisories === undefined) return { status: 'unavailable', cache: 'miss', advisories: [] };
  if (request.cache) {
    await store.write(
      key,
      'osv',
      'query',
      payload,
      60 * 60 * 1000,
      24 * 60 * 60 * 1000,
      request.signal,
    );
  }
  return { status: 'available', cache: 'miss', advisories };
}

function normalizeResponse(
  value: unknown,
  cache: SecurityAdvisory['source']['cache'],
): SecurityAdvisory[] | undefined {
  if (!isRecord(value) || (value.vulns !== undefined && !Array.isArray(value.vulns)))
    return undefined;
  const advisories: SecurityAdvisory[] = [];
  for (const item of value.vulns ?? []) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    const withdrawn = typeof item.withdrawn === 'string' ? item.withdrawn : undefined;
    advisories.push({
      id: item.id,
      aliases: stringArray(item.aliases).sort(),
      ...(typeof item.summary === 'string' ? { summary: item.summary } : {}),
      severity: readSeverity(item),
      active: withdrawn === undefined,
      ...(typeof item.published === 'string' ? { published: item.published } : {}),
      ...(typeof item.modified === 'string' ? { modified: item.modified } : {}),
      ...(withdrawn === undefined ? {} : { withdrawn }),
      references: readReferences(item.references),
      source: { provider: 'osv', url: endpoint.toString(), cache },
    });
  }
  return deduplicateAdvisories(advisories);
}

function deduplicateAdvisories(items: readonly SecurityAdvisory[]): SecurityAdvisory[] {
  const groups: SecurityAdvisory[][] = [];
  for (const item of items) {
    const identities = new Set([item.id, ...item.aliases]);
    const matching = groups.filter((group) =>
      group.some((candidate) =>
        [candidate.id, ...candidate.aliases].some((identity) => identities.has(identity)),
      ),
    );
    if (matching.length === 0) {
      groups.push([item]);
      continue;
    }
    const merged = [item, ...matching.flat()];
    for (const group of matching) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups.map(mergeAdvisoryGroup).sort((left, right) => left.id.localeCompare(right.id));
}

function mergeAdvisoryGroup(group: readonly SecurityAdvisory[]): SecurityAdvisory {
  const canonical = [...group].sort((left, right) =>
    left.id.localeCompare(right.id),
  )[0] as SecurityAdvisory;
  const { withdrawn: _canonicalWithdrawn, ...canonicalWithoutWithdrawn } = canonical;
  const identities = new Set(group.flatMap((item) => [item.id, ...item.aliases]));
  identities.delete(canonical.id);
  const active = group.some((item) => item.active);
  const published = selectTimestamp(
    group.flatMap((item) => item.published ?? []),
    'earliest',
  );
  const modified = selectTimestamp(
    group.flatMap((item) => item.modified ?? []),
    'latest',
  );
  const withdrawn = active
    ? undefined
    : selectTimestamp(
        group.flatMap((item) => item.withdrawn ?? []),
        'latest',
      );
  return {
    ...canonicalWithoutWithdrawn,
    aliases: [...identities].sort(),
    severity:
      group
        .map((item) => item.severity)
        .sort((left, right) => severityRank(left) - severityRank(right))[0] ?? 'unknown',
    active,
    ...(published === undefined ? {} : { published }),
    ...(modified === undefined ? {} : { modified }),
    ...(withdrawn === undefined ? {} : { withdrawn }),
    references: [...new Set(group.flatMap((item) => item.references))].sort(),
  };
}

function severityRank(value: SecurityAdvisory['severity']): number {
  return ['critical', 'high', 'medium', 'low', 'info', 'unknown'].indexOf(value);
}

function selectTimestamp(
  values: readonly string[],
  direction: 'earliest' | 'latest',
): string | undefined {
  const sorted = [...values].sort();
  return direction === 'earliest' ? sorted[0] : sorted.at(-1);
}

function readSeverity(item: Record<string, unknown>): FindingSeverity | 'unknown' {
  const candidates: unknown[] = [
    isRecord(item.database_specific) ? item.database_specific.severity : undefined,
  ];
  if (Array.isArray(item.affected)) {
    for (const affected of item.affected) {
      if (isRecord(affected) && isRecord(affected.ecosystem_specific)) {
        candidates.push(affected.ecosystem_specific.severity);
      }
    }
  }
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.toLowerCase();
    if (normalized === 'moderate') return 'medium';
    if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
      return normalized as FindingSeverity;
    }
  }
  return 'unknown';
}

function readReferences(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((item) =>
        isRecord(item) && typeof item.url === 'string' && item.url.startsWith('https://')
          ? [item.url]
          : [],
      ),
    ),
  ].sort();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
