import { Command } from 'commander';
import { readGlobalOptions } from '../options/readGlobalOptions.js';
import { renderDoctorReport } from '../output/renderDoctorReport.js';
import { renderStructuredResult } from '../output/renderStructuredResult.js';
import { writeTextOutput } from '../output/writeTextOutput.js';
import type { CommandContext } from './CommandContext.js';

export function createDoctorCommand(context: CommandContext): Command {
  return new Command('doctor')
    .description('run read-only environment and project diagnostics')
    .action(async (_local, command) => {
      const global = readGlobalOptions(command);
      const report = await context.client.diagnose({
        signal: context.signal,
        offline: global.offline,
        ...(global.config === undefined ? {} : { configFile: global.config }),
        cache: global.cache,
        ...(global.cacheDir === undefined ? {} : { cacheDirectory: global.cacheDir }),
        ...(global.root === undefined ? {} : { root: global.root }),
      });
      const content =
        global.format === 'terminal'
          ? renderDoctorReport(report)
          : renderStructuredResult(report, global.format);
      await writeTextOutput(content, global.output, context.io);
      context.setExitCode(report.status === 'degraded' ? 3 : 0);
    });
}
