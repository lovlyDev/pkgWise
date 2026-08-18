import { stat } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { PkgWiseError } from '../../errors/PkgWiseError.js';

export async function discoverProjectRoot(
  startPath: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  let current = resolve(startPath);

  try {
    const entry = await stat(current);
    if (entry.isFile()) {
      current = dirname(current);
    }
  } catch (cause) {
    throw new PkgWiseError({
      code: 'PW_PROJECT_NOT_FOUND',
      userMessage: `Project path does not exist or is not readable: ${current}`,
      recoverable: false,
      cause,
    });
  }

  const filesystemRoot = parse(current).root;
  while (true) {
    signal?.throwIfAborted();
    try {
      await access(resolve(current, 'package.json'));
      return current;
    } catch {
      if (current === filesystemRoot) {
        break;
      }
      current = dirname(current);
    }
  }

  throw new PkgWiseError({
    code: 'PW_PROJECT_NOT_FOUND',
    userMessage: `No package.json was found from ${resolve(startPath)} upward.`,
    recoverable: false,
  });
}
