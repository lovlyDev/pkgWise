import { Command } from 'commander';
import { readGlobalOptions } from '../options/readGlobalOptions.js';
import { renderStructuredResult } from '../output/renderStructuredResult.js';
import { renderPackageComparison } from '../output/renderPackageComparison.js';
import { writeTextOutput } from '../output/writeTextOutput.js';
import type { CommandContext } from './CommandContext.js';

export function createCompareCommand(context: CommandContext): Command {
  return new Command('compare')
    .description('compare two package candidates with a shared evidence context')
    .argument('<package-a>', 'first package spec')
    .argument('<package-b>', 'second package spec')
    .option('--project <path>', 'project used for compatibility context')
    .option('--target-node <version>', 'target Node.js version')
    .option('--metric <name>', 'include a metric (repeatable)', collect, [])
    .option('--no-recommendation', 'omit the contextual recommendation')
    .action(
      async (
        packageA: string,
        packageB: string,
        local: {
          project?: string;
          targetNode?: string;
          metric: string[];
          recommendation: boolean;
        },
        command,
      ) => {
        const global = readGlobalOptions(command);
        const result = await context.client.comparePackages({
          packageA,
          packageB,
          signal: context.signal,
          ...(global.config === undefined ? {} : { configFile: global.config }),
          ...(local.project === undefined && global.root === undefined
            ? {}
            : { projectRoot: local.project ?? global.root }),
          ...(local.targetNode === undefined ? {} : { targetNode: local.targetNode }),
          ...(local.metric.length === 0 ? {} : { metrics: local.metric }),
          includeRecommendation: local.recommendation,
        });
        const content =
          global.format === 'terminal'
            ? renderPackageComparison(result)
            : renderStructuredResult(result, global.format);
        await writeTextOutput(content, global.output, context.io);
      },
    );
}

function collect(value: string, values: string[]): string[] {
  return [...values, value];
}
