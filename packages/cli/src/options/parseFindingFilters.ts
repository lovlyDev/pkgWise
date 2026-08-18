import type { FindingPriority, FindingSeverity } from '@pkgwise/core';
import { InvalidArgumentError } from 'commander';

const severities: readonly FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const priorities: readonly FindingPriority[] = [
  'action-required',
  'review',
  'worth-knowing',
  'informational',
];

export function parseFindingSeverity(value: string): FindingSeverity {
  if ((severities as readonly string[]).includes(value)) return value as FindingSeverity;
  throw new InvalidArgumentError(`Severity must be one of: ${severities.join(', ')}.`);
}

export function parseFindingPriority(value: string): FindingPriority {
  if ((priorities as readonly string[]).includes(value)) return value as FindingPriority;
  throw new InvalidArgumentError(`Finding group must be one of: ${priorities.join(', ')}.`);
}

export function parseMaximumFindings(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError('Maximum findings must be an integer from 1 to 10000.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new InvalidArgumentError('Maximum findings must be an integer from 1 to 10000.');
  }
  return parsed;
}
