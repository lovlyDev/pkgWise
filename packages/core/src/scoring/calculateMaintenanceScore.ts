import type { CategoryScore, ScoreContribution } from '../public/ClientResults.js';
import type { CalculateProjectScoresInput } from './CalculateProjectScoresInput.js';
import {
  categoryFromContributions,
  insufficientCategory,
  unavailableCategory,
} from './categoryFactories.js';
import { evidenceIdsForRule } from './evidenceIdsForRule.js';
import { mean, roundScore } from './scoreMath.js';

export function calculateMaintenanceScore(input: CalculateProjectScoresInput): CategoryScore {
  const npm = input.npm;
  if (input.packages.length === 0) return unavailableCategory('maintenance', 'not-applicable');
  if (npm === undefined || npm.eligibleCoordinateCount === 0)
    return unavailableCategory('maintenance');
  const available = npm.packages.filter((item) => item.status === 'available');
  if (available.length === 0) return insufficientCategory('maintenance', 0, 0, []);
  const rate = available.length / npm.eligibleCoordinateCount;
  const deprecatedCount = available.filter((item) => item.deprecated !== undefined).length;
  const contributions: ScoreContribution[] = [
    {
      ruleId: 'score/npm-deprecation',
      category: 'maintenance',
      value: roundScore(100 - (deprecatedCount / available.length) * 80),
      weight: 0.3,
      confidence: 1,
      evidenceIds: evidenceIdsForRule(input.findings, 'maintenance/npm-deprecated'),
      explanation: `${deprecatedCount} of ${available.length} evaluated exact releases are marked deprecated by the npm Registry.`,
    },
  ];
  const dated = available.filter((item) => item.publishedAt !== undefined);
  if (dated.length > 0) {
    const now = input.now ?? new Date();
    contributions.push({
      ruleId: 'score/release-recency',
      category: 'maintenance',
      value: roundScore(mean(dated.map((item) => releaseRecency(item.publishedAt ?? '', now)))),
      weight: 0.25,
      confidence: 0.9,
      evidenceIds: [],
      explanation: `${dated.length} exact release publication date${dated.length === 1 ? '' : 's'} were evaluated with gradual age bands.`,
    });
  }
  const maintained = available.filter((item) => item.maintainerCount !== undefined);
  if (maintained.length > 0) {
    contributions.push({
      ruleId: 'score/maintainer-redundancy',
      category: 'maintenance',
      value: roundScore(
        mean(
          maintained.map((item) =>
            item.maintainerCount === 0 ? 30 : item.maintainerCount === 1 ? 70 : 100,
          ),
        ),
      ),
      weight: 0.1,
      confidence: 0.8,
      evidenceIds: [],
      explanation: `${maintained.length} exact releases have publisher-maintainer coverage; single-maintainer packages receive a bounded bus-factor penalty.`,
    });
  }
  return categoryFromContributions(
    'maintenance',
    contributions,
    rate,
    new Set(['score/npm-deprecation', 'score/release-recency', 'score/maintainer-redundancy']),
  );
}

function releaseRecency(publishedAt: string, now: Date): number {
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return 50;
  const months = Math.max(0, (now.getTime() - timestamp) / (30.4375 * 24 * 60 * 60 * 1000));
  if (months <= 12) return 100;
  if (months <= 18) return interpolate(months, 12, 18, 100, 90);
  if (months <= 24) return interpolate(months, 18, 24, 90, 75);
  if (months <= 36) return interpolate(months, 24, 36, 75, 50);
  if (months <= 60) return interpolate(months, 36, 60, 50, 25);
  return 20;
}

function interpolate(value: number, start: number, end: number, from: number, to: number): number {
  return from + ((value - start) / (end - start)) * (to - from);
}
