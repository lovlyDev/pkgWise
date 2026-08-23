import type { CategoryScore, PackageReport, ScoreContribution } from '../public/ClientResults.js';
import type { CalculateProjectScoresInput } from './CalculateProjectScoresInput.js';
import {
  categoryFromContribution,
  insufficientCategory,
  unavailableCategory,
} from './categoryFactories.js';
import { lowerTailScore, roundScore } from './scoreMath.js';

export function calculateSecurityScore(input: CalculateProjectScoresInput): CategoryScore {
  const osv = input.osv;
  if (osv === undefined || osv.eligibleCoordinateCount === 0)
    return unavailableCategory('security');
  const evaluated = osv.coordinates.filter(({ result }) => result.status === 'available');
  const coverage = evaluated.length / osv.eligibleCoordinateCount;
  if (evaluated.length === 0) return insufficientCategory('security', coverage, 0, []);
  const coordinateScores = evaluated.map(({ name, version, result }) => {
    const active = result.advisories.filter((advisory) => advisory.active);
    if (active.length === 0) return 100;
    const bases = active.map((advisory) => severityScore(advisory.severity));
    const base = Math.max(0, Math.min(...bases) - Math.min(15, (active.length - 1) * 5));
    const related = input.packages.filter((item) => item.name === name && item.version === version);
    return 100 - (100 - base) * dependencyImpact(related);
  });
  const contribution: ScoreContribution = {
    ruleId: 'score/security-osv',
    category: 'security',
    value: roundScore(lowerTailScore(coordinateScores)),
    weight: 1,
    confidence: 1,
    evidenceIds: input.findings
      .filter((finding) => finding.category === 'security')
      .flatMap((finding) => finding.evidence.map((evidence) => evidence.id))
      .sort(),
    explanation: `OSV evaluated ${evaluated.length} of ${osv.eligibleCoordinateCount} exact package coordinates; active advisories use severity and dependency-path impact with bounded lower-tail aggregation.`,
  };
  return categoryFromContribution('security', contribution, coverage, 1);
}

function severityScore(severity: string): number {
  if (severity === 'critical') return 5;
  if (severity === 'high') return 35;
  if (severity === 'medium') return 65;
  if (severity === 'low') return 85;
  return 70;
}

function dependencyImpact(packages: readonly PackageReport[]): number {
  if (packages.some((item) => item.direct && item.directScopes.includes('runtime'))) return 1;
  if (packages.some((item) => item.direct && item.directScopes.includes('optional'))) return 0.6;
  if (packages.some((item) => item.direct && item.directScopes.includes('development'))) return 0.4;
  return 0.8;
}
