import type { PackageManagerDetection } from '../discovery/detectPackageManager.js';
import type { LockfileGraphSnapshot } from './LockfileGraphSnapshot.js';
import { loadLockfileText } from './loadLockfileText.js';
import { parseNpmLockfile } from './parseNpmLockfile.js';
import { parsePnpmLockfile } from './parsePnpmLockfile.js';

export async function parseProjectLockfile(
  projectRoot: string,
  manager: PackageManagerDetection,
  importerIds: readonly string[] = ['.'],
  signal?: AbortSignal,
): Promise<LockfileGraphSnapshot | undefined> {
  if (manager.lockfile === undefined || (manager.name !== 'npm' && manager.name !== 'pnpm')) {
    return undefined;
  }
  const text = await loadLockfileText(projectRoot, manager.lockfile, signal);
  return manager.name === 'npm'
    ? parseNpmLockfile(text, importerIds)
    : parsePnpmLockfile(text, importerIds);
}
