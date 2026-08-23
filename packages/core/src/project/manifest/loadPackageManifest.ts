import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PkgWiseError } from '../../errors/PkgWiseError.js';
import type { PackageManifestSnapshot } from './PackageManifestSnapshot.js';

const maximumManifestBytes = 2 * 1024 * 1024;

export async function loadPackageManifest(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<PackageManifestSnapshot> {
  signal?.throwIfAborted();
  const path = resolve(projectRoot, 'package.json');

  try {
    const file = await stat(path);
    if (file.size > maximumManifestBytes) {
      throw new PkgWiseError({
        code: 'PW_MANIFEST_PARSE_FAILED',
        userMessage: `package.json exceeds the ${maximumManifestBytes}-byte safety limit.`,
        recoverable: false,
      });
    }

    const text = await readFile(path, 'utf8');
    signal?.throwIfAborted();
    const parsed: unknown = JSON.parse(text);
    return normalizeManifest(parsed);
  } catch (cause) {
    if (cause instanceof PkgWiseError) {
      throw cause;
    }
    throw new PkgWiseError({
      code: 'PW_MANIFEST_PARSE_FAILED',
      userMessage: `Unable to parse ${path} as a valid package manifest.`,
      recoverable: false,
      cause,
    });
  }
}

function normalizeManifest(value: unknown): PackageManifestSnapshot {
  if (!isRecord(value)) {
    throw new PkgWiseError({
      code: 'PW_MANIFEST_PARSE_FAILED',
      userMessage: 'package.json must contain a JSON object.',
      recoverable: false,
    });
  }

  return {
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.version === 'string' ? { version: value.version } : {}),
    ...(typeof value.packageManager === 'string' ? { packageManager: value.packageManager } : {}),
    workspaces: readWorkspaces(value.workspaces),
    ...(value.pkgwise === undefined ? {} : { pkgwise: value.pkgwise }),
    dependencies: readDependencyMap(value.dependencies, 'dependencies'),
    devDependencies: readDependencyMap(value.devDependencies, 'devDependencies'),
    peerDependencies: readDependencyMap(value.peerDependencies, 'peerDependencies'),
    optionalDependencies: readDependencyMap(value.optionalDependencies, 'optionalDependencies'),
  };
}

function readWorkspaces(value: unknown): string[] {
  if (value === undefined) return [];
  const patterns = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.packages)
      ? value.packages
      : undefined;
  if (patterns === undefined || patterns.some((pattern) => typeof pattern !== 'string')) {
    throw new PkgWiseError({
      code: 'PW_MANIFEST_PARSE_FAILED',
      userMessage:
        'package.json workspaces must be a string array or an object with a packages string array.',
      recoverable: false,
    });
  }
  return [...new Set(patterns as string[])].sort();
}

function readDependencyMap(value: unknown, field: string): Readonly<Record<string, string>> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new PkgWiseError({
      code: 'PW_MANIFEST_PARSE_FAILED',
      userMessage: `package.json field ${field} must be an object of string specifiers.`,
      recoverable: false,
    });
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  const result = Object.create(null) as Record<string, string>;
  for (const [name, specifier] of entries) {
    if (typeof specifier !== 'string') {
      throw new PkgWiseError({
        code: 'PW_MANIFEST_PARSE_FAILED',
        userMessage: `Dependency ${name} in ${field} must use a string specifier.`,
        recoverable: false,
      });
    }
    result[name] = specifier;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
