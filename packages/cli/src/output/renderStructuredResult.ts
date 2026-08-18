import { PkgWiseError } from '@lovlydev/pkgwise-core';
import type { OutputFormat } from '../options/GlobalOptions.js';
import { renderGenericMarkdown } from './renderMarkdownReport.js';

export function renderStructuredResult(value: unknown, format: OutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  if (format === 'terminal') {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  if (format === 'markdown') {
    return renderGenericMarkdown(value);
  }

  throw new PkgWiseError({
    code: 'PW_FEATURE_NOT_IMPLEMENTED',
    userMessage: `${format.toUpperCase()} reporting is not implemented in this development build yet.`,
    recoverable: false,
    details: { format },
  });
}
