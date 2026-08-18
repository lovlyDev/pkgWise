import { Command } from 'commander';
import { readGlobalOptions } from '../options/readGlobalOptions.js';
import { renderStructuredResult } from '../output/renderStructuredResult.js';
import { renderFindingExplanation } from '../output/renderFindingExplanation.js';
import { writeTextOutput } from '../output/writeTextOutput.js';
import type { CommandContext } from './CommandContext.js';

export function createExplainCommand(context: CommandContext): Command {
  return new Command('explain')
    .description('explain a finding by fingerprint, rule, or package')
    .argument('<selector>', 'finding fingerprint, rule ID, or package name')
    .option('--project <path>', 'project to analyze')
    .action(async (selector: string, local: { project?: string }, command) => {
      const global = readGlobalOptions(command);
      const result = await context.client.explainFinding({
        selector,
        signal: context.signal,
        ...(global.config === undefined ? {} : { configFile: global.config }),
        ...(local.project === undefined && global.root === undefined
          ? {}
          : { projectRoot: local.project ?? global.root }),
      });
      const content =
        global.format === 'terminal'
          ? renderFindingExplanation(result)
          : renderStructuredResult(result, global.format);
      await writeTextOutput(content, global.output, context.io);
    });
}
