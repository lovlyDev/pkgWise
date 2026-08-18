import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PkgWiseError } from '../../errors/PkgWiseError.js';
import { lockfileParseError } from './lockfileUtilities.js';

const maximumLockfileBytes = 100 * 1024 * 1024;

export async function loadLockfileText(
  projectRoot: string,
  relativePath: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const path = resolve(projectRoot, relativePath);
  try {
    const file = await stat(path);
    if (!file.isFile()) {
      throw lockfileParseError(`${relativePath} is not a regular file.`);
    }
    if (file.size > maximumLockfileBytes) {
      throw lockfileParseError(
        `${relativePath} exceeds the ${maximumLockfileBytes}-byte safety limit.`,
      );
    }
    const text = await readFile(path, 'utf8');
    signal?.throwIfAborted();
    return text;
  } catch (cause) {
    if (cause instanceof PkgWiseError) {
      throw cause;
    }
    throw lockfileParseError(`Unable to read ${relativePath}.`, cause);
  }
}
