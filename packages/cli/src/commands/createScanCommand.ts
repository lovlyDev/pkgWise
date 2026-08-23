import type { AnalysisReport, FindingPriority, FindingSeverity } from '@lovlydev/pkgwise-core';
import { Command, Option } from 'commander';
import { mapPolicyToExitCode } from '../exit/mapPolicyToExitCode.js';
import { readGlobalOptions } from '../options/readGlobalOptions.js';
import {
  parseFindingPriority,
  parseFindingSeverity,
  parseMaximumFindings,
} from '../options/parseFindingFilters.js';
import { renderAnalysisReport } from '../output/renderAnalysisReport.js';
import { renderMarkdownReport } from '../output/renderMarkdownReport.js';
import { renderSarifReport } from '../output/renderSarifReport.js';
import { renderStructuredResult } from '../output/renderStructuredResult.js';
import { writeTextOutput } from '../output/writeTextOutput.js';
import type { CommandContext } from './CommandContext.js';

export function createScanCommand(context: CommandContext): Command {
  return new Command('scan')
    .description('analyze a project dependency graph')
    .argument('[path]', 'project path', '.')
    .option(
      '--workspace <name-or-path>',
      'analyze a workspace; use * for all (repeatable)',
      collect,
      [],
    )
    .addOption(
      new Option('--include-dev', 'include development dependencies').conflicts('production'),
    )
    .addOption(
      new Option('--production', 'analyze production dependencies only').conflicts('includeDev'),
    )
    .addOption(
      new Option('--severity <level>', 'minimum displayed severity').argParser(
        parseFindingSeverity,
      ),
    )
    .option('--rule <id>', 'run only a rule (repeatable)', collect, [])
    .option('--remote', 'query OSV and npm Registry for exact lockfile coordinates', false)
    .option(
      '--include <group>',
      'include a finding group (repeatable)',
      (value: string, values: string[]) => [...values, parseFindingPriority(value)],
      [],
    )
    .addOption(
      new Option('--max-findings <count>', 'limit terminal findings').argParser(
        parseMaximumFindings,
      ),
    )
    .action(
      async (
        path: string,
        local: {
          workspace: string[];
          includeDev?: boolean;
          production?: boolean;
          severity?: FindingSeverity;
          rule: string[];
          include: FindingPriority[];
          maxFindings?: number;
          remote: boolean;
        },
        command,
      ) => {
        const global = readGlobalOptions(command);
        const input = {
          root: global.root ?? path,
          signal: context.signal,
          ...(global.config === undefined ? {} : { configFile: global.config }),
          ...(local.workspace.length === 0 ? {} : { workspaces: local.workspace }),
          ...(local.production === true
            ? { includeDev: false }
            : local.includeDev === true
              ? { includeDev: true }
              : {}),
          ...(local.rule.length === 0 ? {} : { rules: local.rule }),
          remote: local.remote,
          offline: global.offline,
          refresh: global.refresh,
          cache: global.cache,
          ...(global.cacheDir === undefined ? {} : { cacheDirectory: global.cacheDir }),
          timeoutMs: global.timeout,
          concurrency: global.concurrency,
        };
        const report: AnalysisReport = await context.client.analyzeProject(input);
        const content = (() => {
          if (global.format === 'terminal') {
            return renderAnalysisReport(report, {
              ...(local.severity === undefined ? {} : { minimumSeverity: local.severity }),
              includePriorities: local.include,
              ...(local.maxFindings === undefined ? {} : { maximumFindings: local.maxFindings }),
            });
          }
          if (global.format === 'markdown') return renderMarkdownReport(report);
          if (global.format === 'sarif') return renderSarifReport(report);
          return renderStructuredResult(report, global.format);
        })();
        await writeTextOutput(content, global.output, context.io);
        context.setExitCode(mapPolicyToExitCode(report.policy));
      },
    );
}

function collect(value: string, values: string[]): string[] {
  return [...values, value];
}
