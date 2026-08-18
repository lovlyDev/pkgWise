import { InvalidArgumentError } from 'commander';

export function parseConcurrency(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError('Concurrency must be an integer from 1 to 32.');
  }

  const concurrency = Number(value);
  if (concurrency < 1 || concurrency > 32) {
    throw new InvalidArgumentError('Concurrency must be an integer from 1 to 32.');
  }

  return concurrency;
}
