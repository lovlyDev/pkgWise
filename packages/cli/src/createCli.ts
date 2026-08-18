import type { PkgWiseClient } from '@pkgwise/core';
import { Command } from 'commander';
import { createCacheCommand } from './commands/createCacheCommand.js';
import type { CommandContext } from './commands/CommandContext.js';
import { createCompareCommand } from './commands/createCompareCommand.js';
import { createDoctorCommand } from './commands/createDoctorCommand.js';
import { createExplainCommand } from './commands/createExplainCommand.js';
import { createInspectCommand } from './commands/createInspectCommand.js';
import { createScanCommand } from './commands/createScanCommand.js';
import type { CliIo } from './io/CliIo.js';
import { createGlobalOptions } from './options/createGlobalOptions.js';

export interface CreateCliOptions {
  readonly client: PkgWiseClient;
  readonly io: CliIo;
  readonly signal: AbortSignal;
  readonly version: string;
  setExitCode(code: number): void;
}

export function createCli(options: CreateCliOptions): Command {
  const context: CommandContext = {
    client: options.client,
    io: options.io,
    signal: options.signal,
    setExitCode: options.setExitCode,
  };

  const program = createGlobalOptions(
    new Command()
      .name('pkgwise')
      .description('Explainable dependency analysis for JavaScript and TypeScript projects')
      .version(options.version)
      .showSuggestionAfterError()
      .showHelpAfterError('(run pkgwise --help for usage)'),
  );

  program.addCommand(createScanCommand(context));
  program.addCommand(createInspectCommand(context));
  program.addCommand(createCompareCommand(context));
  program.addCommand(createExplainCommand(context));
  program.addCommand(createDoctorCommand(context));
  program.addCommand(createCacheCommand(context));

  configureCommandTree(program, options.io);

  return program;
}

function configureCommandTree(command: Command, io: CliIo): void {
  command.configureOutput({
    writeOut: (text) => io.stdout.write(text),
    writeErr: (text) => io.stderr.write(text),
  });
  command.exitOverride();
  for (const child of command.commands) {
    configureCommandTree(child, io);
  }
}
