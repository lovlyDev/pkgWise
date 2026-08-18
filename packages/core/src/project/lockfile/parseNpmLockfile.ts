import { PkgWiseError } from '../../errors/PkgWiseError.js';
import type {
  DependencyScope,
  LockfileDependencyReference,
  LockfileGraphSnapshot,
  LockfilePackageRecord,
} from './LockfileGraphSnapshot.js';
import { isRecord, lockfileParseError, readStringMap } from './lockfileUtilities.js';

interface NpmPackageEntry extends Record<string, unknown> {
  readonly name?: string;
  readonly version?: string;
}

export function parseNpmLockfile(text: string): LockfileGraphSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw lockfileParseError('package-lock.json is not valid JSON.', cause);
  }
  if (!isRecord(value)) {
    throw lockfileParseError('package-lock.json must contain an object.');
  }

  const lockfileVersion = value.lockfileVersion;
  if (lockfileVersion !== 2 && lockfileVersion !== 3) {
    throw new PkgWiseError({
      code: 'PW_LOCKFILE_VERSION_UNSUPPORTED',
      userMessage: `npm lockfileVersion ${String(lockfileVersion)} is unsupported; expected 2 or 3.`,
      recoverable: false,
    });
  }
  if (!isRecord(value.packages)) {
    throw lockfileParseError('package-lock.json packages must be an object.');
  }

  const entries = new Map<string, NpmPackageEntry>();
  for (const [location, entry] of Object.entries(value.packages).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!isRecord(entry)) {
      throw lockfileParseError(
        `package-lock.json packages[${JSON.stringify(location)}] must be an object.`,
      );
    }
    entries.set(normalizeLocation(location), entry);
  }

  const root = entries.get('');
  if (root === undefined) {
    throw lockfileParseError('package-lock.json packages must contain the root entry "".');
  }

  const packages: LockfilePackageRecord[] = [];
  for (const [location, entry] of entries) {
    if (location === '' || entry.link === true) continue;
    const name = typeof entry.name === 'string' ? entry.name : packageNameFromLocation(location);
    if (name === undefined) {
      throw lockfileParseError(`Cannot derive a package name from lockfile location ${location}.`);
    }
    const resolveTarget = (dependencyName: string): string | undefined =>
      resolveNpmLocation(location, dependencyName, entries);
    packages.push({
      id: location,
      name,
      ...(typeof entry.version === 'string' ? { version: entry.version } : {}),
      integrity: typeof entry.integrity === 'string' ? 'present' : 'missing',
      dependencies: readNpmPackageDependencies(entry, resolveTarget),
    });
  }

  return {
    manager: 'npm',
    lockfileVersion: String(lockfileVersion),
    fidelity: 'full',
    packages,
    importer: {
      id: '.',
      dependencies: readNpmImporterDependencies(root, (name) =>
        resolveNpmLocation('', name, entries),
      ),
    },
  };
}

function readNpmPackageDependencies(
  entry: NpmPackageEntry,
  resolveTarget: (name: string) => string | undefined,
): LockfileDependencyReference[] {
  const regular = readStringMap(entry.dependencies, 'package dependencies');
  const optional = readStringMap(entry.optionalDependencies, 'package optionalDependencies');
  const peer = readStringMap(entry.peerDependencies, 'package peerDependencies');
  const references: LockfileDependencyReference[] = [];
  for (const [name, requested] of Object.entries(regular)) {
    if (name in optional) continue;
    references.push(reference(name, requested, 'runtime', resolveTarget(name)));
  }
  for (const [name, requested] of Object.entries(optional)) {
    references.push(reference(name, requested, 'optional', resolveTarget(name), true));
  }
  for (const [name, requested] of Object.entries(peer)) {
    references.push(reference(name, requested, 'peer', resolveTarget(name), false, true));
  }
  return deduplicateReferences(references);
}

function readNpmImporterDependencies(
  entry: NpmPackageEntry,
  resolveTarget: (name: string) => string | undefined,
): LockfileDependencyReference[] {
  const sections: ReadonlyArray<readonly [unknown, DependencyScope, boolean, boolean]> = [
    [entry.dependencies, 'runtime', false, false],
    [entry.devDependencies, 'development', false, false],
    [entry.peerDependencies, 'peer', false, true],
    [entry.optionalDependencies, 'optional', true, false],
  ];
  const references: LockfileDependencyReference[] = [];
  const optionalNames = new Set(
    Object.keys(readStringMap(entry.optionalDependencies, 'root optional dependencies')),
  );
  for (const [value, scope, optional, peer] of sections) {
    for (const [name, requested] of Object.entries(
      readStringMap(value, `root ${scope} dependencies`),
    )) {
      if (scope === 'runtime' && optionalNames.has(name)) continue;
      references.push(reference(name, requested, scope, resolveTarget(name), optional, peer));
    }
  }
  return deduplicateReferences(references);
}

function reference(
  name: string,
  requested: string,
  scope: DependencyScope,
  targetId: string | undefined,
  optional = false,
  peer = false,
): LockfileDependencyReference {
  return {
    name,
    requested,
    scope,
    optional,
    peer,
    ...(targetId === undefined ? {} : { targetId }),
  };
}

function deduplicateReferences(
  references: readonly LockfileDependencyReference[],
): LockfileDependencyReference[] {
  const byIdentity = new Map<string, LockfileDependencyReference>();
  for (const item of references) {
    const key = `${item.name}\0${item.scope}`;
    if (!byIdentity.has(key)) byIdentity.set(key, item);
  }
  return [...byIdentity.values()].sort((a, b) =>
    `${a.name}\0${a.scope}`.localeCompare(`${b.name}\0${b.scope}`),
  );
}

function resolveNpmLocation(
  fromLocation: string,
  dependencyName: string,
  entries: ReadonlyMap<string, NpmPackageEntry>,
): string | undefined {
  let cursor = fromLocation;
  while (true) {
    const candidate =
      cursor === '' ? `node_modules/${dependencyName}` : `${cursor}/node_modules/${dependencyName}`;
    if (entries.has(candidate)) return candidate;
    if (cursor === '') return undefined;
    const boundary = cursor.lastIndexOf('/node_modules/');
    cursor = boundary < 0 ? '' : cursor.slice(0, boundary);
  }
}

function packageNameFromLocation(location: string): string | undefined {
  const marker = 'node_modules/';
  const index = location.lastIndexOf(marker);
  if (index < 0) return undefined;
  const remainder = location.slice(index + marker.length);
  const parts = remainder.split('/');
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function normalizeLocation(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}
