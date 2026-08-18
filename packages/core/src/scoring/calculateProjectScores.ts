import type { DependencyGraphAnalysis } from '../project/lockfile/analyzeDependencyGraph.js';
import type { ProjectOsvResult } from '../providers/osv/fetchProjectOsv.js';
import type { ProjectNpmResult } from '../providers/npm/fetchProjectNpm.js';
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
  readonly npm?: ProjectNpmResult;
  readonly now?: Date;
  readonly categoryWeights?: Partial<Readonly<Record<ScoreCategory, number>>>;
}

export function calculateProjectScores(input: CalculateProjectScoresInput): ProjectScores {
  const categories = [
    calculateSecurity(input),
    calculateMaintenance(input),
    calculateSupplyChain(input),
    calculateReliability(input.graph, input.findings),
    calculateCompatibility(input.graph, input.findings),
    calculateQuality(input),
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

function calculateMaintenance(input: CalculateProjectScoresInput): CategoryScore {
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

function calculateSupplyChain(input: CalculateProjectScoresInput): CategoryScore {
  if (input.packages.length === 0) return unavailableCategory('supply-chain', 'not-applicable');
  const contributions: ScoreContribution[] = [];
  const exact = input.packages.filter((item) => item.version !== undefined);
  const integrity = exact.filter((item) => item.integrity !== undefined);
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
      (item.lifecycleScripts ?? []).some((script) =>
        ['preinstall', 'install', 'postinstall'].includes(script),
      ),
    );
    const scriptScores = available.map((item) => {
      const scripts = item.lifecycleScripts ?? [];
      if (!scripts.some((script) => ['preinstall', 'install', 'postinstall'].includes(script)))
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

function calculateQuality(input: CalculateProjectScoresInput): CategoryScore {
  const packages = input.packages;
  if (packages.length === 0) return unavailableCategory('quality', 'not-applicable');
  const prereleaseCount = packages.filter(
    (item) => item.version !== undefined && item.version.includes('-'),
  ).length;
  const exactCount = packages.filter((item) => item.version !== undefined).length;
  if (exactCount === 0) return unavailableCategory('quality');
  const value = 100 - (prereleaseCount / exactCount) * 20;
  const contributions: ScoreContribution[] = [
    {
      ruleId: 'score/release-stability',
      category: 'quality',
      value: roundScore(value),
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

function categoryFromContributions(
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
