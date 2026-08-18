import type { DependencyGraphAnalysis } from '../project/lockfile/analyzeDependencyGraph.js';
import type { ProjectOsvResult } from '../providers/osv/fetchProjectOsv.js';
import type {
  CategoryScore,
  Finding,
  PackageReport,
  ProjectScores,
  ScoreCategory,
  ScoreContribution,
} from '../public/ClientResults.js';

export const scoreCategories: readonly ScoreCategory[] = [
  'security',
  'maintenance',
  'supply-chain',
  'reliability',
  'compatibility',
  'quality',
];

export const defaultCategoryWeights: Readonly<Record<ScoreCategory, number>> = {
  security: 0.3,
  maintenance: 0.2,
  'supply-chain': 0.15,
  reliability: 0.15,
  compatibility: 0.1,
  quality: 0.1,
};

export interface CalculateProjectScoresInput {
  readonly graph?: DependencyGraphAnalysis;
  readonly packages: readonly PackageReport[];
  readonly findings: readonly Finding[];
  readonly osv?: ProjectOsvResult;
  readonly categoryWeights?: Partial<Readonly<Record<ScoreCategory, number>>>;
}

export function calculateProjectScores(input: CalculateProjectScoresInput): ProjectScores {
  const categories = [
    calculateSecurity(input),
    unavailableCategory('maintenance'),
    unavailableCategory('supply-chain'),
    calculateReliability(input.graph, input.findings),
    calculateCompatibility(input.graph, input.findings),
    calculateQuality(input.packages),
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
    modelVersion: '1.0.0',
    ...(roundedOverall === undefined ? {} : { overall: roundedOverall }),
    ...(label === undefined ? {} : { label }),
    confidence: roundUnit(confidence),
    coverage: roundUnit(coverage),
    categories,
  };
}

function calculateSecurity(input: CalculateProjectScoresInput): CategoryScore {
  const osv = input.osv;
  if (osv === undefined || osv.eligibleCoordinateCount === 0) {
    return unavailableCategory('security');
  }
  const evaluated = osv.coordinates.filter(({ result }) => result.status === 'available');
  const coverage = evaluated.length / osv.eligibleCoordinateCount;
  if (evaluated.length === 0) return insufficientCategory('security', coverage, 0, []);

  const coordinateScores = evaluated.map(({ name, version, result }) => {
    const active = result.advisories.filter((advisory) => advisory.active);
    if (active.length === 0) return 100;
    const bases = active.map((advisory) => severityScore(advisory.severity));
    const base = Math.max(0, Math.min(...bases) - Math.min(15, (active.length - 1) * 5));
    const related = input.packages.filter((item) => item.name === name && item.version === version);
    const impact = dependencyImpact(related);
    return 100 - (100 - base) * impact;
  });
  const value = lowerTailScore(coordinateScores);
  const evidenceIds = input.findings
    .filter((finding) => finding.category === 'security')
    .flatMap((finding) => finding.evidence.map((evidence) => evidence.id))
    .sort();
  const contribution: ScoreContribution = {
    ruleId: 'score/security-osv',
    category: 'security',
    value: roundScore(value),
    weight: 1,
    confidence: 1,
    evidenceIds,
    explanation: `OSV evaluated ${evaluated.length} of ${osv.eligibleCoordinateCount} exact package coordinates; active advisories use severity and dependency-path impact with bounded lower-tail aggregation.`,
  };
  return categoryFromContribution('security', contribution, coverage, 1);
}

function calculateReliability(
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

function calculateCompatibility(
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

function calculateQuality(packages: readonly PackageReport[]): CategoryScore {
  if (packages.length === 0) return unavailableCategory('quality', 'not-applicable');
  const prereleaseCount = packages.filter(
    (item) => item.version !== undefined && item.version.includes('-'),
  ).length;
  const exactCount = packages.filter((item) => item.version !== undefined).length;
  if (exactCount === 0) return unavailableCategory('quality');
  const value = 100 - (prereleaseCount / exactCount) * 20;
  const contribution: ScoreContribution = {
    ruleId: 'score/release-stability',
    category: 'quality',
    value: roundScore(value),
    weight: 0.25,
    confidence: 0.9,
    evidenceIds: [],
    explanation: `${prereleaseCount} of ${exactCount} exact resolved versions are prereleases; package metadata quality signals are not yet available.`,
  };
  return insufficientCategory('quality', 0.25, 0.23, [contribution]);
}

function categoryFromContribution(
  category: ScoreCategory,
  contribution: ScoreContribution,
  coverage: number,
  confidence: number,
): CategoryScore {
  if (coverage < 0.35) {
    return insufficientCategory(category, coverage, confidence, [contribution]);
  }
  return {
    category,
    status: 'available',
    score: contribution.value,
    confidence: roundUnit(confidence),
    coverage: roundUnit(coverage),
    contributions: [contribution],
  };
}

function unavailableCategory(
  category: ScoreCategory,
  status: CategoryScore['status'] = 'insufficient-data',
): CategoryScore {
  return { category, status, confidence: 0, coverage: 0, contributions: [] };
}

function insufficientCategory(
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

function severityScore(severity: string): number {
  if (severity === 'critical') return 5;
  if (severity === 'high') return 35;
  if (severity === 'medium') return 65;
  if (severity === 'low') return 85;
  return 70;
}

function evidenceIdsForRule(findings: readonly Finding[], ruleId: string): string[] {
  return [
    ...new Set(
      findings
        .filter((finding) => finding.ruleId === ruleId)
        .flatMap((finding) => finding.evidence.map((evidence) => evidence.id)),
    ),
  ].sort();
}

function dependencyImpact(packages: readonly PackageReport[]): number {
  if (packages.some((item) => item.direct && item.directScopes.includes('runtime'))) return 1;
  if (packages.some((item) => item.direct && item.directScopes.includes('optional'))) return 0.6;
  if (packages.some((item) => item.direct && item.directScopes.includes('development'))) return 0.4;
  return 0.8;
}

function lowerTailScore(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const worst = sorted.slice(0, 5);
  const remaining = sorted.slice(5);
  const worstMean = mean(worst);
  return remaining.length === 0 ? worstMean : worstMean * 0.6 + mean(remaining) * 0.4;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function labelScore(score: number): NonNullable<ProjectScores['label']> {
  if (score >= 85) return 'strong';
  if (score >= 70) return 'generally-healthy';
  if (score >= 50) return 'review-recommended';
  return 'material-concerns';
}

function roundScore(value: number): number {
  return Math.round((Math.max(0, Math.min(100, value)) + 1e-12) * 100) / 100;
}

function roundUnit(value: number): number {
  return Math.round((Math.max(0, Math.min(1, value)) + 1e-12) * 100) / 100;
}
