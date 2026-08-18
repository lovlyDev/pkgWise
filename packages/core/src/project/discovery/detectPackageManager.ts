import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PkgWiseError } from '../../errors/PkgWiseError.js';
import type { PackageManifestSnapshot } from '../manifest/PackageManifestSnapshot.js';

export type DetectedPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';

export interface PackageManagerDetection {
  readonly name: DetectedPackageManager;
  readonly lockfile?: string;
  readonly confidence: 'high' | 'medium' | 'low';
}

const lockfiles = [
  { manager: 'npm', file: 'npm-shrinkwrap.json' },
  { manager: 'npm', file: 'package-lock.json' },
  { manager: 'pnpm', file: 'pnpm-lock.yaml' },
  { manager: 'yarn', file: 'yarn.lock' },
  { manager: 'bun', file: 'bun.lock' },
  { manager: 'bun', file: 'bun.lockb' },
] as const;

export async function detectPackageManager(
  projectRoot: string,
  manifest: PackageManifestSnapshot,
  signal?: AbortSignal,
): Promise<PackageManagerDetection> {
  signal?.throwIfAborted();
  const detected: Array<(typeof lockfiles)[number]> = [];
  for (const candidate of lockfiles) {
    try {
      await access(resolve(projectRoot, candidate.file));
      detected.push(candidate);
    } catch {
      // A missing candidate is normal and does not warrant a diagnostic.
    }
  }

  const declared = readDeclaredManager(manifest.packageManager);
  if (declared !== undefined) {
    const matching = detected.find((candidate) => candidate.manager === declared);
    return {
      name: declared,
      confidence: 'high',
      ...(matching === undefined ? {} : { lockfile: matching.file }),
    };
  }

  const managers = [...new Set(detected.map((candidate) => candidate.manager))];
  if (managers.length > 1) {
    throw new PkgWiseError({
      code: 'PW_PROJECT_AMBIGUOUS_MANAGER',
      userMessage: `Multiple package manager lockfiles were found: ${detected
        .map((candidate) => candidate.file)
        .join(', ')}. Declare packageManager or pass an explicit override.`,
      recoverable: false,
    });
  }

  const selected = detected[0];
  return selected === undefined
    ? { name: 'unknown', confidence: 'low' }
    : { name: selected.manager, lockfile: selected.file, confidence: 'medium' };
}

function readDeclaredManager(
  value: string | undefined,
): Exclude<DetectedPackageManager, 'unknown'> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const name = value.startsWith('@') ? undefined : value.split('@')[0];
  return name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : undefined;
}
