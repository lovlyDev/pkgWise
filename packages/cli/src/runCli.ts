import { createPkgWise, PkgWiseError, type PkgWiseClient } from '@lovlydev/pkgwise-core';
import { CommanderError } from 'commander';
import { createCli } from './createCli.js';
import { mapErrorToExitCode } from './exit/mapErrorToExitCode.js';
import type { CliIo } from './io/CliIo.js';
import { processCliIo } from './io/CliIo.js';
import { renderCliError } from './output/renderCliError.js';

export interface RunCliOptions {
  readonly client?: PkgWiseClient;
  readonly io?: CliIo;
  readonly signal?: AbortSignal;
  readonly version?: string;
}

export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<number> {
  const io = options.io ?? processCliIo;
  const client = options.client ?? createPkgWise();
  const signal = options.signal ?? new AbortController().signal;
  let exitCode = 0;

  const program = createCli({
    client,
    io,
    signal,
    version: options.version ?? '0.1.0-alpha.3',
    setExitCode(code) {
      exitCode = code;
    },
  });

  try {
    await program.parseAsync([...argv], { from: 'user' });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 2;
    }

    const mappedCode = mapErrorToExitCode(error);
    const format = readRequestedFormat(argv);
    const debug = argv.includes('--debug');
    const envelope = renderCliError(error, debug);

    if (format === 'json' || format === 'sarif') {
      io.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    } else {
      io.stderr.write(`Error [${envelope.error.code}]: ${envelope.error.message}\n`);
      if (debug && error instanceof Error && error.stack !== undefined) {
        io.stderr.write(`${error.stack}\n`);
      }
    }

    return mappedCode;
  }
}

function readRequestedFormat(argv: readonly string[]): string | undefined {
  const assignment = argv.find((argument) => argument.startsWith('--format='));
  if (assignment !== undefined) {
    return assignment.slice('--format='.length);
  }

  const index = argv.indexOf('--format');
  return index === -1 ? undefined : argv[index + 1];
}

export function createCancelledError(): PkgWiseError {
  return new PkgWiseError({
    code: 'PW_CANCELLED',
    userMessage: 'The operation was cancelled.',
    recoverable: true,
  });
}
