import {
  PkgWiseError,
  type CacheStatusReport,
  type ClearCacheResult,
} from '@lovlydev/pkgwise-core';
import { Command } from 'commander';
import { readGlobalOptions } from '../options/readGlobalOptions.js';
import { renderStructuredResult } from '../output/renderStructuredResult.js';
import { writeTextOutput } from '../output/writeTextOutput.js';
import type { CommandContext } from './CommandContext.js';

export function createCacheCommand(context: CommandContext): Command {
  const command = new Command('cache').description('inspect or clear the PkgWise cache');

  command
    .command('status')
    .description('show cache location and usage')
    .action(async (_local, child) => {
      const global = readGlobalOptions(child);
      const report = await context.client.getCacheStatus({
        signal: context.signal,
        ...(global.cacheDir === undefined ? {} : { cacheDirectory: global.cacheDir }),
      });
      await writeTextOutput(
        global.format === 'terminal'
          ? renderCacheStatus(report)
          : renderStructuredResult(report, global.format),
        global.output,
        context.io,
      );
    });

  command
    .command('clear')
    .description('clear the owned PkgWise cache namespace')
    .option('--provider <id>', 'clear only entries for a provider')
    .option('--yes', 'confirm non-interactively', false)
    .action(async (local: { provider?: string; yes: boolean }, child) => {
      if (!local.yes) {
        throw new PkgWiseError({
          code: 'PW_CLI_INVALID_ARGUMENT',
          userMessage:
            'Cache clearing requires --yes because the CLI does not prompt interactively.',
          recoverable: false,
        });
      }
      const global = readGlobalOptions(child);
      const result = await context.client.clearCache({
        signal: context.signal,
        ...(global.cacheDir === undefined ? {} : { cacheDirectory: global.cacheDir }),
        ...(local.provider === undefined ? {} : { provider: local.provider }),
      });
      await writeTextOutput(
        global.format === 'terminal'
          ? renderCacheClear(result)
          : renderStructuredResult(result, global.format),
        global.output,
        context.io,
      );
    });

  return command;
}

function renderCacheStatus(report: CacheStatusReport): string {
  return `${[
    `PkgWise cache · ${report.exists ? (report.owned ? 'owned' : 'unowned') : 'empty'}`,
    '',
    `Path: ${report.path}`,
    `Entries: ${report.entryCount} · ${report.totalBytes} bytes`,
    `Expired: ${report.expiredEntryCount} · corrupt: ${report.corruptEntryCount}`,
  ].join('\n')}\n`;
}

function renderCacheClear(result: ClearCacheResult): string {
  return `PkgWise cache cleared${result.provider === undefined ? '' : ` for ${result.provider}`}: ${result.removedEntries} entries · ${result.removedBytes} bytes\n`;
}
