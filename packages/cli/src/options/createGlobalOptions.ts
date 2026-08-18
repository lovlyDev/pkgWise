import type { Command } from 'commander';
import { parseConcurrency } from './parseConcurrency.js';
import { parseDuration } from './parseDuration.js';
import { parseOutputFormat } from './parseOutputFormat.js';

export function createGlobalOptions(program: Command): Command {
  return program
    .option('--config <path>', 'use an explicit JSON configuration file')
    .option('--format <format>', 'output format', parseOutputFormat, 'terminal')
    .option('--output <path>', 'write the report atomically to a file')
    .option('--root <path>', 'use an explicit project root')
    .option('--offline', 'disable all network access', false)
    .option('--refresh', 'revalidate cached provider data', false)
    .option('--no-cache', 'disable cache reads and writes')
    .option('--cache-dir <path>', 'use an explicit cache directory')
    .option('--timeout <duration>', 'set the request timeout', parseDuration, 10_000)
    .option('--concurrency <count>', 'set network concurrency (1-32)', parseConcurrency, 12)
    .option('--ci', 'enable deterministic non-interactive behavior', false)
    .option('--quiet', 'suppress nonessential human output', false)
    .option('--verbose', 'enable verbose diagnostics', false)
    .option('--debug', 'enable debug diagnostics and stack traces', false)
    .option('--color', 'force colored terminal output')
    .option('--no-color', 'disable colored terminal output');
}
