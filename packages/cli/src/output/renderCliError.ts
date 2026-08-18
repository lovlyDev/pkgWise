import { PkgWiseError } from '@lovlydev/pkgwise-core';

export interface CliErrorEnvelope {
  readonly schemaVersion: '1';
  readonly status: 'error';
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export function renderCliError(error: unknown, debug: boolean): CliErrorEnvelope {
  if (error instanceof PkgWiseError) {
    const errorValue: CliErrorEnvelope['error'] = {
      code: error.code,
      message: error.userMessage,
      recoverable: error.recoverable,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
    return { schemaVersion: '1', status: 'error', error: errorValue };
  }

  return {
    schemaVersion: '1',
    status: 'error',
    error: {
      code: 'PW_INTERNAL_ERROR',
      message:
        debug && error instanceof Error ? error.message : 'An unexpected internal error occurred.',
      recoverable: false,
    },
  };
}
