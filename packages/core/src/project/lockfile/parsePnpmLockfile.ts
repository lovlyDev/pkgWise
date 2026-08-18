import { parse } from 'yaml';
import { PkgWiseError } from '../../errors/PkgWiseError.js';
import type {
  DependencyScope,
  LockfileDependencyReference,
  LockfileGraphSnapshot,
  LockfilePackageRecord,
} from './LockfileGraphSnapshot.js';
import { isRecord, lockfileParseError } from './lockfileUtilities.js';

export function parsePnpmLockfile(text: string): LockfileGraphSnapshot {
  let value: unknown;
  try {
    value = parse(text, { maxAliasCount: 50, strict: true });
  } catch (cause) {
    throw lockfileParseError('pnpm-lock.yaml is not valid YAML.', cause);
  }
  if (!isRecord(value)) throw lockfileParseError('pnpm-lock.yaml must contain an object.');

  const lockfileVersion = normalizeLockfileVersion(value.lockfileVersion);
  const major = Number.parseInt(lockfileVersion.split('.')[0] ?? '', 10);
  if (!Number.isInteger(major) || major < 6 || major > 9) {
    throw new PkgWiseError({
      code: 'PW_LOCKFILE_VERSION_UNSUPPORTED',
      userMessage: `pnpm lockfileVersion ${lockfileVersion} is unsupported; expected schema family 6 through 9.`,
      recoverable: false,
    });
  }

  const packageData = isRecord(value.packages) ? value.packages : {};
  const snapshotData = isRecord(value.snapshots) ? value.snapshots : packageData;
  const identities = createIdentityIndex(packageData, snapshotData);
  const packages: LockfilePackageRecord[] = [];

  for (const key of [
    ...new Set([...Object.keys(packageData), ...Object.keys(snapshotData)]),
  ].sort()) {
    const metadata = packageData[key];
    const snapshot = snapshotData[key];
    if (metadata !== undefined && !isRecord(metadata)) {
      throw lockfileParseError(`pnpm package ${key} must be an object.`);
    }
    if (snapshot !== undefined && !isRecord(snapshot)) {
      throw lockfileParseError(`pnpm snapshot ${key} must be an object.`);
    }
    const identity = parsePnpmPackageKey(key);
    if (identity === undefined) continue;
    const relations = isRecord(snapshot) ? snapshot : isRecord(metadata) ? metadata : {};
    packages.push({
      id: key,
      name: identity.name,
      version: identity.version,
      dependencies: readPnpmDependencySections(relations, (name, requested) =>
        resolvePnpmTarget(name, requested, identities),
      ),
    });
  }

  const importers = value.importers;
  if (!isRecord(importers) || !isRecord(importers['.'])) {
    throw lockfileParseError('pnpm-lock.yaml importers must contain the root importer ".".');
  }

  return {
    manager: 'pnpm',
    lockfileVersion,
    fidelity: 'full',
    packages,
    importer: {
      id: '.',
      dependencies: readPnpmImporter(importers['.'], identities),
    },
  };
}

function readPnpmImporter(
  importer: Record<string, unknown>,
  identities: ReadonlyMap<string, string>,
): LockfileDependencyReference[] {
  return readPnpmSections(importer, identities, true);
}

function readPnpmDependencySections(
  record: Record<string, unknown>,
  resolveTarget: (name: string, requested: string) => string | undefined,
): LockfileDependencyReference[] {
  return readSections(record, resolveTarget, false);
}

function readPnpmSections(
  record: Record<string, unknown>,
  identities: ReadonlyMap<string, string>,
  importer: boolean,
): LockfileDependencyReference[] {
  return readSections(
    record,
    (name, requested) => resolvePnpmTarget(name, requested, identities),
    importer,
  );
}

function readSections(
  record: Record<string, unknown>,
  resolveTarget: (name: string, requested: string) => string | undefined,
  importer: boolean,
): LockfileDependencyReference[] {
  const sections: ReadonlyArray<readonly [string, DependencyScope, boolean, boolean]> = [
    ['dependencies', 'runtime', false, false],
    ['devDependencies', 'development', false, false],
    ['optionalDependencies', 'optional', true, false],
    ['peerDependencies', 'peer', false, true],
  ];
  const references: LockfileDependencyReference[] = [];
  const optionalSection = record.optionalDependencies;
  const optionalNames = new Set(isRecord(optionalSection) ? Object.keys(optionalSection) : []);
  for (const [field, scope, optional, peer] of sections) {
    const section = record[field];
    if (section === undefined) continue;
    if (!isRecord(section)) throw lockfileParseError(`pnpm ${field} must be an object.`);
    for (const [name, raw] of Object.entries(section).sort(([a], [b]) => a.localeCompare(b))) {
      if (scope === 'runtime' && optionalNames.has(name)) continue;
      const requested = readPnpmReference(raw, importer, field, name);
      const targetId = resolveTarget(name, requested);
      references.push({
        name,
        requested,
        scope,
        optional,
        peer,
        ...(targetId === undefined ? {} : { targetId }),
      });
    }
  }
  return references;
}

function readPnpmReference(raw: unknown, importer: boolean, field: string, name: string): string {
  if (typeof raw === 'string') return raw;
  if (importer && isRecord(raw) && typeof raw.version === 'string') return raw.version;
  throw lockfileParseError(`pnpm ${field}.${name} must provide a string version.`);
}

function createIdentityIndex(
  packages: Record<string, unknown>,
  snapshots: Record<string, unknown>,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const key of [...new Set([...Object.keys(packages), ...Object.keys(snapshots)])].sort()) {
    const identity = parsePnpmPackageKey(key);
    if (identity === undefined) continue;
    result.set(`${identity.name}\0${identity.version}`, key);
    result.set(`${identity.name}\0${stripPeerSuffix(identity.version)}`, key);
  }
  return result;
}

function resolvePnpmTarget(
  name: string,
  reference: string,
  identities: ReadonlyMap<string, string>,
): string | undefined {
  if (/^(?:link|workspace|file|git|https?):/.test(reference)) return undefined;
  const alias = reference.startsWith('npm:') ? parseNpmAlias(reference.slice(4)) : undefined;
  const targetName = alias?.name ?? name;
  const normalized = alias?.version ?? reference;
  return (
    identities.get(`${targetName}\0${normalized}`) ??
    identities.get(`${targetName}\0${stripPeerSuffix(normalized)}`)
  );
}

function parsePnpmPackageKey(
  key: string,
): { readonly name: string; readonly version: string } | undefined {
  const normalized = key.startsWith('/') ? key.slice(1) : key;
  if (key.startsWith('/')) {
    const parts = normalized.split('/');
    if (parts[0]?.startsWith('@')) {
      if (parts.length < 3) return undefined;
      return { name: `${parts[0]}/${parts[1]}`, version: parts.slice(2).join('/') };
    }
    if (parts.length < 2) return undefined;
    return { name: parts[0] ?? '', version: parts.slice(1).join('/') };
  }
  const delimiter = normalized.startsWith('@')
    ? normalized.indexOf('@', normalized.indexOf('/') + 1)
    : normalized.indexOf('@');
  if (delimiter <= 0) return undefined;
  return { name: normalized.slice(0, delimiter), version: normalized.slice(delimiter + 1) };
}

function parseNpmAlias(
  value: string,
): { readonly name: string; readonly version: string } | undefined {
  const delimiter = value.startsWith('@')
    ? value.indexOf('@', value.indexOf('/') + 1)
    : value.indexOf('@');
  if (delimiter <= 0) return undefined;
  return { name: value.slice(0, delimiter), version: value.slice(delimiter + 1) };
}

function stripPeerSuffix(version: string): string {
  const index = version.indexOf('(');
  return index < 0 ? version : version.slice(0, index);
}

function normalizeLockfileVersion(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  throw lockfileParseError('pnpm-lock.yaml lockfileVersion is missing or invalid.');
}
