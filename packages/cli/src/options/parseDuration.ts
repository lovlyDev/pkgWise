import { InvalidArgumentError } from 'commander';

const durationPattern = /^(\d+(?:\.\d+)?)(ms|s|m)$/;

export function parseDuration(value: string): number {
  const match = durationPattern.exec(value);
  if (match === null) {
    throw new InvalidArgumentError('Duration must use ms, s, or m, for example 500ms, 10s, or 2m.');
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 'ms' ? 1 : unit === 's' ? 1_000 : 60_000;
  const milliseconds = amount * multiplier;

  if (!Number.isFinite(milliseconds) || milliseconds < 100 || milliseconds > 600_000) {
    throw new InvalidArgumentError('Duration must be between 100ms and 10m.');
  }

  return Math.round(milliseconds);
}
