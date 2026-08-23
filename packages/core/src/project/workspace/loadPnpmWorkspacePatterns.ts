import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { PkgWiseError } from '../../errors/PkgWiseError.js';

const maximumWorkspaceFileBytes = 1024 * 1024;

export async function loadPnpmWorkspacePatterns(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<string[]> {
  signal?.throwIfAborted();
  const path = resolve(projectRoot, 'pnpm-workspace.yaml');

  try {
    const file = await stat(path);
    if (file.size > maximumWorkspaceFileBytes) {
      throw workspaceFileError(
        `pnpm-workspace.yaml exceeds the ${maximumWorkspaceFileBytes}-byte safety limit.`,
      );
    }

    const text = await readFile(path, 'utf8');
    signal?.throwIfAborted();
    const parsed: unknown = parse(text, { maxAliasCount: 50, strict: true });
    if (!isRecord(parsed) || !Array.isArray(parsed.packages)) {
      throw workspaceFileError('pnpm-workspace.yaml packages must be a string array.');
    }
    if (parsed.packages.some((pattern) => typeof pattern !== 'string')) {
      throw workspaceFileError('pnpm-workspace.yaml packages must be a string array.');
    }
    return [...new Set(parsed.packages as string[])].sort();
  } catch (cause) {
    if (isFileNotFoundError(cause)) return [];
    if (cause instanceof PkgWiseError) throw cause;
    throw workspaceFileError(`Unable to parse ${path} as a valid pnpm workspace file.`, cause);
  }
}

function workspaceFileError(message: string, cause?: unknown): PkgWiseError {
  return new PkgWiseError({
    code: 'PW_MANIFEST_PARSE_FAILED',
    userMessage: message,
    recoverable: false,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isFileNotFoundError(value: unknown): boolean {
  return isRecord(value) && value.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
