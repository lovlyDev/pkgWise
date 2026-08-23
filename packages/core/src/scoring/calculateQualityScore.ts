import type { CategoryScore, ScoreContribution } from '../public/ClientResults.js';
import type { CalculateProjectScoresInput } from './CalculateProjectScoresInput.js';
import { categoryFromContributions, unavailableCategory } from './categoryFactories.js';
import { roundScore } from './scoreMath.js';

export function calculateQualityScore(input: CalculateProjectScoresInput): CategoryScore {
  if (input.packages.length === 0) return unavailableCategory('quality', 'not-applicable');
  const exactCount = input.packages.filter((item) => item.version !== undefined).length;
  if (exactCount === 0) return unavailableCategory('quality');
  const prereleaseCount = input.packages.filter(
    (item) => item.version?.includes('-') === true,
  ).length;
  const contributions: ScoreContribution[] = [
    {
      ruleId: 'score/release-stability',
      category: 'quality',
      value: roundScore(100 - (prereleaseCount / exactCount) * 20),
      weight: 0.3,
      confidence: 0.9,
      evidenceIds: [],
      explanation: `${prereleaseCount} of ${exactCount} exact resolved versions are prereleases.`,
    },
  ];
  const npm = input.npm;
  const available = npm?.packages.filter((item) => item.status === 'available') ?? [];
  const rate =
    npm === undefined || npm.eligibleCoordinateCount === 0
      ? 0
      : available.length / npm.eligibleCoordinateCount;
  if (available.length > 0) {
    const licensed = available.filter((item) => item.license !== undefined).length;
    const repositories = available.filter((item) => item.repository !== undefined).length;
    contributions.push(
      {
        ruleId: 'score/license-metadata',
        category: 'quality',
        value: roundScore(60 + (licensed / available.length) * 40),
        weight: 0.35,
        confidence: 0.9,
        evidenceIds: [],
        explanation: `${licensed} of ${available.length} evaluated releases expose license metadata.`,
      },
      {
        ruleId: 'score/repository-metadata',
        category: 'quality',
        value: roundScore(65 + (repositories / available.length) * 35),
        weight: 0.35,
        confidence: 0.85,
        evidenceIds: [],
        explanation: `${repositories} of ${available.length} evaluated releases expose a source repository.`,
      },
    );
  }
  return categoryFromContributions(
    'quality',
    contributions,
    rate,
    new Set(['score/license-metadata', 'score/repository-metadata']),
  );
}
