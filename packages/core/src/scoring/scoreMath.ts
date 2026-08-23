import type { ProjectScores } from '../public/ClientResults.js';

export function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function lowerTailScore(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const worst = sorted.slice(0, 5);
  const remaining = sorted.slice(5);
  const worstMean = mean(worst);
  return remaining.length === 0 ? worstMean : worstMean * 0.6 + mean(remaining) * 0.4;
}

export function roundScore(value: number): number {
  return Math.round((Math.max(0, Math.min(100, value)) + 1e-12) * 100) / 100;
}

export function roundUnit(value: number): number {
  return Math.round((Math.max(0, Math.min(1, value)) + 1e-12) * 100) / 100;
}

export function labelScore(score: number): NonNullable<ProjectScores['label']> {
  if (score >= 85) return 'strong';
  if (score >= 70) return 'generally-healthy';
  if (score >= 50) return 'review-recommended';
  return 'material-concerns';
}
