import type { CategoryScore, ScoreCategory, ScoreContribution } from '../public/ClientResults.js';
import { roundScore, roundUnit } from './scoreMath.js';

export function categoryFromContributions(
  category: ScoreCategory,
  contributions: readonly ScoreContribution[],
  remoteRate = 1,
  remoteRules: ReadonlySet<string> = new Set(),
): CategoryScore {
  const effective = contributions.map((contribution) => ({
    contribution,
    availability: remoteRules.has(contribution.ruleId) ? remoteRate : 1,
  }));
  const coverage = effective.reduce(
    (sum, item) => sum + item.contribution.weight * item.availability,
    0,
  );
  const confidence = effective.reduce(
    (sum, item) =>
      sum + item.contribution.weight * item.contribution.confidence * item.availability,
    0,
  );
  const denominator = effective.reduce(
    (sum, item) => sum + item.contribution.weight * item.contribution.confidence,
    0,
  );
  if (denominator === 0) return insufficientCategory(category, coverage, confidence, contributions);
  const score =
    effective.reduce(
      (sum, item) =>
        sum + item.contribution.value * item.contribution.weight * item.contribution.confidence,
      0,
    ) / denominator;
  if (coverage < 0.35) return insufficientCategory(category, coverage, confidence, contributions);
  return {
    category,
    status: 'available',
    score: roundScore(score),
    confidence: roundUnit(confidence),
    coverage: roundUnit(coverage),
    contributions,
  };
}

export function categoryFromContribution(
  category: ScoreCategory,
  contribution: ScoreContribution,
  coverage: number,
  confidence: number,
): CategoryScore {
  if (coverage < 0.35) return insufficientCategory(category, coverage, confidence, [contribution]);
  return {
    category,
    status: 'available',
    score: contribution.value,
    confidence: roundUnit(confidence),
    coverage: roundUnit(coverage),
    contributions: [contribution],
  };
}

export function unavailableCategory(
  category: ScoreCategory,
  status: CategoryScore['status'] = 'insufficient-data',
): CategoryScore {
  return { category, status, confidence: 0, coverage: 0, contributions: [] };
}

export function insufficientCategory(
  category: ScoreCategory,
  coverage: number,
  confidence: number,
  contributions: readonly ScoreContribution[],
): CategoryScore {
  return {
    category,
    status: 'insufficient-data',
    confidence: roundUnit(confidence),
    coverage: roundUnit(coverage),
    contributions,
  };
}
