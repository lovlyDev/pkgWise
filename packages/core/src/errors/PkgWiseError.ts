import type { ErrorCode } from './ErrorCode.js';

export interface PkgWiseErrorOptions {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class PkgWiseError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly recoverable: boolean;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(options: PkgWiseErrorOptions) {
    super(options.userMessage, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PkgWiseError';
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.recoverable = options.recoverable;
    this.details = options.details;
  }
}
