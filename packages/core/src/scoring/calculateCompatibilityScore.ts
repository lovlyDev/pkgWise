import type { DependencyGraphAnalysis } from '../project/lockfile/analyzeDependencyGraph.js';
import type { CategoryScore, Finding } from '../public/ClientResults.js';
import { categoryFromContribution, unavailableCategory } from './categoryFactories.js';
import { evidenceIdsForRule } from './evidenceIdsForRule.js';
import { roundScore } from './scoreMath.js';

export function calculateCompatibilityScore(
  graph: DependencyGraphAnalysis | undefined,
  findings: readonly Finding[],
): CategoryScore {
  if (graph === undefined) return unavailableCategory('compatibility');
  const actionable = graph.unresolvedDependencies.filter(
    (relation) =>
      !relation.optional &&
      !/^(?:link|workspace|file|portal|patch|git|https?):/i.test(relation.requested),
  );
  const penalty = actionable.reduce((total, relation) => {
    const base =
      relation.scope === 'runtime'
        ? 45
        : relation.scope === 'peer'
          ? 35
          : relation.scope === 'development'
            ? 15
            : 20;
    return total + base * (relation.fromPackageId === undefined ? 1 : 0.7);
  }, 0);
  return categoryFromContribution(
    'compatibility',
    {
      ruleId: 'score/resolution-consistency',
      category: 'compatibility',
      value: roundScore(Math.max(0, 100 - penalty)),
      weight: 1,
      confidence: 1,
      evidenceIds: evidenceIdsForRule(findings, 'compatibility/unresolved-dependency'),
      explanation: `${actionable.length} actionable unresolved dependency relation${actionable.length === 1 ? '' : 's'}; penalties are weighted by dependency scope and directness.`,
    },
    1,
    1,
  );
}
