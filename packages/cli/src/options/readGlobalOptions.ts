import type { Command } from 'commander';
import type { GlobalOptions } from './GlobalOptions.js';

export function readGlobalOptions(command: Command): GlobalOptions {
  const options = command.optsWithGlobals<GlobalOptions>();
  const colorFromEnvironment = process.env.NO_COLOR === undefined;

  return {
    ...options,
    color: options.color ?? colorFromEnvironment,
  };
}
