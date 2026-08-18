import { Command } from 'commander';
import { readGlobalOptions } from '../options/readGlobalOptions.js';
import { renderStructuredResult } from '../output/renderStructuredResult.js';
import { renderPackageInspection } from '../output/renderPackageInspection.js';
import { writeTextOutput } from '../output/writeTextOutput.js';
import type { CommandContext } from './CommandContext.js';

export function createInspectCommand(context: CommandContext): Command {
  return new Command('inspect')
    .description('inspect an installed or remote package')
    .argument('<package>', 'package name or exact package spec')
    .option('--all-versions', 'inspect every installed version', false)
    .option('--remote', 'allow remote-only inspection', false)
    .option('--project <path>', 'project used for graph context')
    .option('--paths', 'include dependency paths')
    .option('--no-paths', 'exclude dependency paths')
    .action(
      async (
        packageSpec: string,
        local: { allVersions: boolean; remote: boolean; project?: string; paths?: boolean },
        command,
      ) => {
        const global = readGlobalOptions(command);
        const result = await context.client.inspectPackage({
          packageSpec,
          signal: context.signal,
          ...(global.config === undefined ? {} : { configFile: global.config }),
          offline: global.offline,
          refresh: global.refresh,
          cache: global.cache,
          ...(global.cacheDir === undefined ? {} : { cacheDirectory: global.cacheDir }),
          timeoutMs: global.timeout,
          allVersions: local.allVersions,
          remote: local.remote,
          ...(local.paths === undefined ? {} : { includePaths: local.paths }),
          ...(local.project === undefined && global.root === undefined
            ? {}
            : { projectRoot: local.project ?? global.root }),
        });
        const content =
          global.format === 'terminal'
            ? renderPackageInspection(result)
            : renderStructuredResult(result, global.format);
        await writeTextOutput(content, global.output, context.io);
      },
    );
}
