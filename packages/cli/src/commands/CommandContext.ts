import type { PkgWiseClient } from '@pkgwise/core';
import type { CliIo } from '../io/CliIo.js';

export interface CommandContext {
  readonly client: PkgWiseClient;
  readonly io: CliIo;
  readonly signal: AbortSignal;
  setExitCode(code: number): void;
}
