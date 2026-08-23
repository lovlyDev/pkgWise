import type { DependencyGraphAnalysis } from '../project/lockfile/analyzeDependencyGraph.js';
import type { CategoryScore, Finding } from '../public/ClientResults.js';
import { categoryFromContribution, unavailableCategory } from './categoryFactories.js';
import { evidenceIdsForRule } from './evidenceIdsForRule.js';
import { roundScore } from './scoreMath.js';

export function calculateReliabilityScore(
  graph: DependencyGraphAnalysis | undefined,
  findings: readonly Finding[],
): CategoryScore {
  if (graph === undefined) return unavailableCategory('reliability');
  const packageCount = graph.packages.length;
  let weightedScore = packageCount * 100;
  for (const group of graph.duplicateVersions) {
    const extraVersions = Math.max(0, group.versions.length - 1);
    const majors = new Set(
      group.versions.map((version) => /^(\d+)/.exec(version)?.[1]).filter(Boolean),
    );
    const extraMajors = Math.max(0, majors.size - 1);
    const footprint = Math.min(1, group.packageCount / 10);
    const value =
      100 -
      (Math.min(40, extraMajors * 20) + Math.min(30, extraVersions * 7.5)) *
        (0.5 + 0.5 * footprint);
    weightedScore -= (100 - value) * group.packageCount;
  }
  const value = packageCount === 0 ? 100 : weightedScore / packageCount;
  return categoryFromContribution(
    'reliability',
    {
      ruleId: 'score/version-fragmentation',
      category: 'reliability',
      value: roundScore(value),
      weight: 1,
      confidence: 1,
      evidenceIds: evidenceIdsForRule(findings, 'reliability/version-fragmentation'),
      explanation: `${graph.duplicateVersions.length} duplicate-version group${graph.duplicateVersions.length === 1 ? '' : 's'} across ${packageCount} resolved package locators; penalties account for version spread and reachable footprint.`,
    },
    1,
    1,
  );
}
