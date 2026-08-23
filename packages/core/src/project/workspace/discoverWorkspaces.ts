import { glob, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { PkgWiseError } from '../../errors/PkgWiseError.js';
import { loadPackageManifest } from '../manifest/loadPackageManifest.js';
import type { PackageManifestSnapshot } from '../manifest/PackageManifestSnapshot.js';
import { loadPnpmWorkspacePatterns } from './loadPnpmWorkspacePatterns.js';
import type { WorkspacePackage } from './WorkspacePackage.js';

const maximumWorkspaceCount = 1_000;

export async function discoverWorkspaces(
  projectRoot: string,
  rootManifest: PackageManifestSnapshot,
  signal?: AbortSignal,
): Promise<WorkspacePackage[]> {
  const root = await realpath(projectRoot);
  const pnpmPatterns = await loadPnpmWorkspacePatterns(root, signal);
  const patterns = [...new Set([...rootManifest.workspaces, ...pnpmPatterns])]
    .sort()
    .map(validatePattern);
  if (patterns.length === 0) return [];
  const include = patterns.filter((pattern) => !pattern.startsWith('!')).map(toManifestPattern);
  const exclude = [
    'node_modules/**',
    '.git/**',
    ...patterns
      .filter((pattern) => pattern.startsWith('!'))
      .map((pattern) => toManifestPattern(pattern.slice(1))),
  ];
  const matches = new Set<string>();
  for await (const match of glob(include, { cwd: root, exclude })) {
    signal?.throwIfAborted();
    matches.add(match.replaceAll('\\', '/'));
    if (matches.size > maximumWorkspaceCount) {
      throw new PkgWiseError({
        code: 'PW_MANIFEST_PARSE_FAILED',
        userMessage: `Workspace discovery exceeds the ${maximumWorkspaceCount}-package safety limit.`,
        recoverable: false,
      });
    }
  }
  const workspaces: WorkspacePackage[] = [];
  for (const manifestPath of [...matches].sort()) {
    const directory = dirname(resolve(root, manifestPath));
    const actual = await realpath(directory);
    const relativePath = relative(root, actual).replaceAll(sep, '/');
    if (relativePath === '' || relativePath === '..' || relativePath.startsWith('../')) {
      throw new PkgWiseError({
        code: 'PW_MANIFEST_PARSE_FAILED',
        userMessage: `Workspace ${manifestPath} resolves outside the project root.`,
        recoverable: false,
      });
    }
    const manifest = await loadPackageManifest(actual, signal);
    workspaces.push({
      ...(manifest.name === undefined ? {} : { name: manifest.name }),
      relativePath,
      manifest,
    });
  }
  return workspaces.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function validatePattern(pattern: string): string {
  const normalized = pattern.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  const candidate = normalized.startsWith('!') ? normalized.slice(1) : normalized;
  if (
    candidate.length === 0 ||
    candidate.includes('\0') ||
    isAbsolute(candidate) ||
    candidate.split('/').includes('..')
  ) {
    throw new PkgWiseError({
      code: 'PW_MANIFEST_PARSE_FAILED',
      userMessage: `Unsafe workspace pattern ${JSON.stringify(pattern)}.`,
      recoverable: false,
    });
  }
  return normalized.startsWith('!') ? `!${candidate}` : candidate;
}

function toManifestPattern(pattern: string): string {
  return `${pattern}/package.json`;
}
