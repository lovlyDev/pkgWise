import type { CategoryScore, ProjectScores } from '../public/ClientResults.js';
import { calculateCompatibilityScore } from './calculateCompatibilityScore.js';
import { calculateMaintenanceScore } from './calculateMaintenanceScore.js';
import { calculateQualityScore } from './calculateQualityScore.js';
import { calculateReliabilityScore } from './calculateReliabilityScore.js';
import { calculateSecurityScore } from './calculateSecurityScore.js';
import { calculateSupplyChainScore } from './calculateSupplyChainScore.js';
import type { CalculateProjectScoresInput } from './CalculateProjectScoresInput.js';
import { defaultCategoryWeights, scoreCategories } from './scoreModel.js';
import { labelScore, roundScore, roundUnit } from './scoreMath.js';

export type { CalculateProjectScoresInput } from './CalculateProjectScoresInput.js';
export { defaultCategoryWeights, scoreCategories } from './scoreModel.js';

export function calculateProjectScores(input: CalculateProjectScoresInput): ProjectScores {
  const categories = [
    calculateSecurityScore(input),
    calculateMaintenanceScore(input),
    calculateSupplyChainScore(input),
    calculateReliabilityScore(input.graph, input.findings),
    calculateCompatibilityScore(input.graph, input.findings),
    calculateQualityScore(input),
  ];
  const weights = { ...defaultCategoryWeights, ...input.categoryWeights };
  const configuredWeight = scoreCategories.reduce(
    (total, category) => total + weights[category],
    0,
  );
  const available = categories.filter(
    (category): category is CategoryScore & { readonly score: number } =>
      category.status === 'available' &&
      category.score !== undefined &&
      weights[category.category] > 0,
  );
  const effectiveWeight = available.reduce(
    (total, category) => total + weights[category.category] * category.confidence,
    0,
  );
  const overall =
    effectiveWeight === 0
      ? undefined
      : available.reduce(
          (total, category) =>
            total + category.score * weights[category.category] * category.confidence,
          0,
        ) / effectiveWeight;
  const coverage =
    configuredWeight === 0
      ? 0
      : categories.reduce(
          (total, category) => total + category.coverage * weights[category.category],
          0,
        ) / configuredWeight;
  const confidence =
    configuredWeight === 0
      ? 0
      : categories.reduce(
          (total, category) => total + category.confidence * weights[category.category],
          0,
        ) / configuredWeight;
  const roundedOverall = overall === undefined ? undefined : roundScore(overall);
  const label =
    roundedOverall === undefined || coverage < 0.6 || confidence < 0.5
      ? undefined
      : labelScore(roundedOverall);
  return {
    status: roundedOverall === undefined ? 'insufficient-data' : 'available',
    modelVersion: '1.1.0',
    ...(roundedOverall === undefined ? {} : { overall: roundedOverall }),
    ...(label === undefined ? {} : { label }),
    confidence: roundUnit(confidence),
    coverage: roundUnit(coverage),
    categories,
  };
}
