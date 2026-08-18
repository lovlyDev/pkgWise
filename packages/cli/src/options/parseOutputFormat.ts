import { InvalidArgumentError } from 'commander';
import type { OutputFormat } from './GlobalOptions.js';

const formats = new Set<OutputFormat>(['terminal', 'json', 'sarif', 'markdown']);

export function parseOutputFormat(value: string): OutputFormat {
  if (!formats.has(value as OutputFormat)) {
    throw new InvalidArgumentError('Format must be terminal, json, sarif, or markdown.');
  }

  return value as OutputFormat;
}
