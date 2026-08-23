import type { CategoryScore, ScoreContribution } from '../public/ClientResults.js';
import type { CalculateProjectScoresInput } from './CalculateProjectScoresInput.js';
import { categoryFromContributions, unavailableCategory } from './categoryFactories.js';
import { evidenceIdsForRule } from './evidenceIdsForRule.js';
import { mean, roundScore } from './scoreMath.js';

const installLifecycleScripts = new Set(['preinstall', 'install', 'postinstall']);

export function calculateSupplyChainScore(input: CalculateProjectScoresInput): CategoryScore {
  if (input.packages.length === 0) return unavailableCategory('supply-chain', 'not-applicable');
  const contributions: ScoreContribution[] = [];
  const integrity = input.packages.filter(
    (item) => item.version !== undefined && item.integrity !== undefined,
  );
  if (integrity.length > 0) {
    const missing = integrity.filter((item) => item.integrity === 'missing').length;
    contributions.push({
      ruleId: 'score/lockfile-integrity',
      category: 'supply-chain',
      value: roundScore(100 - (missing / integrity.length) * 45),
      weight: 0.3,
      confidence: 1,
      evidenceIds: [],
      explanation: `${integrity.length - missing} of ${integrity.length} resolved lockfile records include package integrity metadata.`,
    });
  }
  const npm = input.npm;
  const available = npm?.packages.filter((item) => item.status === 'available') ?? [];
  const rate =
    npm === undefined || npm.eligibleCoordinateCount === 0
      ? 0
      : available.length / npm.eligibleCoordinateCount;
  if (available.length > 0) {
    const scripted = available.filter((item) =>
      (item.lifecycleScripts ?? []).some((script) => installLifecycleScripts.has(script)),
    );
    const scriptScores = available.map((item) => {
      if (!(item.lifecycleScripts ?? []).some((script) => installLifecycleScripts.has(script)))
        return 100;
      const related = input.packages.filter(
        (candidate) => candidate.name === item.name && candidate.version === item.version,
      );
      return related.some(
        (candidate) => candidate.direct && candidate.directScopes.includes('runtime'),
      )
        ? 65
        : 80;
    });
    contributions.push(
      {
        ruleId: 'score/install-scripts',
        category: 'supply-chain',
        value: roundScore(mean(scriptScores)),
        weight: 0.5,
        confidence: 0.9,
        evidenceIds: evidenceIdsForRule(input.findings, 'supply-chain/install-script'),
        explanation: `${scripted.length} of ${available.length} evaluated releases declare lifecycle scripts; install hooks are weighted by dependency impact.`,
      },
      {
        ruleId: 'score/registry-resolution',
        category: 'supply-chain',
        value: 100,
        weight: 0.2,
        confidence: 1,
        evidenceIds: [],
        explanation: `${available.length} exact package coordinates were resolved by the npm Registry provider.`,
      },
    );
  }
  return categoryFromContributions(
    'supply-chain',
    contributions,
    rate,
    new Set(['score/install-scripts', 'score/registry-resolution']),
  );
}
