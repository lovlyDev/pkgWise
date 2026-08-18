import { createHash } from 'node:crypto';
import { PkgWiseError } from '../errors/PkgWiseError.js';
import type { DependencyGraphAnalysis } from '../project/lockfile/analyzeDependencyGraph.js';
import type {
  DependencyPath,
  Finding,
  FindingPriority,
  FindingSeverity,
  UnresolvedDependencyRelation,
} from '../public/ClientResults.js';

export const localRuleIds = [
  'reliability/version-fragmentation',
  'reliability/dependency-cycle',
  'compatibility/unresolved-dependency',
] as const;

type LocalRuleId = (typeof localRuleIds)[number];

export const defaultLocalRuleIds: readonly LocalRuleId[] = [
  'reliability/version-fragmentation',
  'compatibility/unresolved-dependency',
];

export function runLocalRules(
  graph: DependencyGraphAnalysis | undefined,
  requestedRuleIds?: readonly string[],
): Finding[] {
  if (graph === undefined) return [];
  const enabled = resolveRuleIds(requestedRuleIds);
  const findings: Finding[] = [];

  if (enabled.has('reliability/version-fragmentation')) {
    for (const group of graph.duplicateVersions) {
      const packageIds = graph.packages
        .filter((item) => item.name === group.name)
        .map((item) => item.id)
        .sort();
      const severity: FindingSeverity = group.versions.length >= 3 ? 'medium' : 'low';
      const relatedPackages = graph.packages.filter((item) => item.name === group.name);
      findings.push(
        createFinding({
          ruleId: 'reliability/version-fragmentation',
          subjectType: 'package-group',
          subjectKey: group.name,
          packageIds,
          ...selectDependencyPaths(graph, packageIds),
          discriminator: group.versions.join(','),
          title: `Multiple versions of ${group.name} are installed`,
          summary: `${group.packageCount} resolved locators use ${group.versions.length} distinct versions: ${group.versions.join(', ')}.`,
          severity,
          priority: severity === 'medium' ? 'review' : 'worth-knowing',
          category: 'reliability',
          direct: relatedPackages.some((item) => item.direct),
          scopes: collectScopes(relatedPackages),
          evidenceSummary: `The resolved dependency graph contains ${group.versions.length} versions of ${group.name}.`,
          recommendation:
            'Review dependency constraints and package-manager deduplication opportunities.',
          actions: [
            `Inspect which direct dependencies require ${group.name}.`,
            'Prefer compatible constraint alignment; do not edit the lockfile manually.',
          ],
        }),
      );
    }
  }

  if (enabled.has('reliability/dependency-cycle')) {
    for (const cycle of graph.cycles) {
      const relatedPackages = graph.packages.filter((item) => cycle.packageIds.includes(item.id));
      findings.push(
        createFinding({
          ruleId: 'reliability/dependency-cycle',
          subjectType: 'dependency-cycle',
          subjectKey: cycle.packageIds.join(','),
          packageIds: cycle.packageIds,
          ...selectDependencyPaths(graph, cycle.packageIds),
          discriminator: cycle.packageIds.join(','),
          title: 'A dependency cycle exists in the resolved package graph',
          summary: `The strongly connected component contains ${cycle.packageIds.length} package locator${cycle.packageIds.length === 1 ? '' : 's'}.`,
          severity: 'info',
          priority: 'informational',
          category: 'reliability',
          direct: relatedPackages.some((item) => item.direct),
          scopes: collectScopes(relatedPackages),
          evidenceSummary: 'The resolved graph contains a strongly connected component.',
          recommendation:
            'Treat this as topology context unless it causes an observed reliability problem.',
          actions: ['Inspect the component before changing dependency constraints.'],
        }),
      );
    }
  }

  if (enabled.has('compatibility/unresolved-dependency')) {
    for (const relation of graph.unresolvedDependencies.filter(isActionableUnresolvedRelation)) {
      const packageIds = relation.fromPackageId === undefined ? [] : [relation.fromPackageId];
      const originPackage = graph.packages.find((item) => item.id === relation.fromPackageId);
      const origin =
        relation.fromPackageId === undefined ? 'the project importer' : 'a resolved package';
      findings.push(
        createFinding({
          ruleId: 'compatibility/unresolved-dependency',
          subjectType: 'dependency-relation',
          subjectKey: `${relation.fromPackageId ?? 'project'}:${relation.dependencyName}`,
          packageIds,
          ...(relation.fromPackageId === undefined
            ? { dependencyPaths: [{ packages: [] }], pathsTruncated: false }
            : selectDependencyPaths(graph, packageIds)),
          discriminator: `${relation.scope}:${relation.requested}`,
          title: `${relation.dependencyName} could not be resolved from the lockfile`,
          summary: `${origin} requests ${relation.dependencyName}@${relation.requested} as a ${relation.scope} dependency, but no matching locator exists.`,
          severity: relation.scope === 'development' ? 'low' : 'medium',
          priority: 'review',
          category: 'compatibility',
          direct: relation.fromPackageId === undefined || originPackage?.direct === true,
          scopes: [relation.scope],
          evidenceSummary: `No target locator was found for ${relation.dependencyName}@${relation.requested}.`,
          recommendation:
            'Regenerate or repair the lockfile with the declared package manager and review the requesting dependency.',
          actions: [
            'Confirm that package.json and the lockfile were generated together.',
            'Run the package manager install command in a reviewed working tree.',
          ],
        }),
      );
    }
  }

  return findings.sort(compareFindings);
}

function resolveRuleIds(requested: readonly string[] | undefined): Set<LocalRuleId> {
  if (requested === undefined) return new Set(defaultLocalRuleIds);
  const result = new Set<LocalRuleId>();
  for (const id of requested) {
    if (!isLocalRuleId(id)) {
      throw new PkgWiseError({
        code: 'PW_CONFIG_INVALID',
        userMessage: `Unknown rule ID: ${id}. Available local rules: ${localRuleIds.join(', ')}.`,
        recoverable: false,
      });
    }
    result.add(id);
  }
  return result;
}

function isLocalRuleId(value: string): value is LocalRuleId {
  return (localRuleIds as readonly string[]).includes(value);
}

function isActionableUnresolvedRelation(relation: UnresolvedDependencyRelation): boolean {
  if (relation.optional) return false;
  return !/^(?:link|workspace|file|portal|patch|git|https?):/i.test(relation.requested);
}

interface FindingInput {
  readonly ruleId: LocalRuleId;
  readonly subjectType: Finding['subject']['type'];
  readonly subjectKey: string;
  readonly packageIds: readonly string[];
  readonly dependencyPaths: readonly DependencyPath[];
  readonly pathsTruncated: boolean;
  readonly discriminator: string;
  readonly title: string;
  readonly summary: string;
  readonly severity: FindingSeverity;
  readonly priority: FindingPriority;
  readonly category: Finding['category'];
  readonly direct: boolean;
  readonly scopes: Finding['context']['scopes'];
  readonly evidenceSummary: string;
  readonly recommendation: string;
  readonly actions: readonly string[];
}

function createFinding(input: FindingInput): Finding {
  const fingerprint = createFingerprint(input.ruleId, input.subjectKey, input.discriminator);
  return {
    ruleId: input.ruleId,
    ruleVersion: '1.0.0',
    fingerprint,
    subject: {
      type: input.subjectType,
      key: input.subjectKey,
      packageIds: [...input.packageIds].sort(),
    },
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    priority: input.priority,
    confidence: 1,
    category: input.category,
    context: { direct: input.direct, scopes: input.scopes },
    evidence: [
      {
        id: createHash('sha256').update(`evidence\0${fingerprint}`).digest('hex'),
        kind: 'confirmed-fact',
        summary: input.evidenceSummary,
      },
    ],
    dependencyPaths: input.dependencyPaths,
    pathsTruncated: input.pathsTruncated,
    recommendation: { summary: input.recommendation, actions: input.actions },
  };
}

function collectScopes(
  packages: readonly { readonly directScopes: Finding['context']['scopes'] }[],
): Finding['context']['scopes'] {
  const order: Finding['context']['scopes'] = ['runtime', 'development', 'peer', 'optional'];
  const values = new Set(packages.flatMap((item) => item.directScopes));
  return order.filter((scope) => values.has(scope));
}

function selectDependencyPaths(
  graph: DependencyGraphAnalysis,
  packageIds: readonly string[],
  maximumPaths = 3,
): { readonly dependencyPaths: readonly DependencyPath[]; readonly pathsTruncated: boolean } {
  const paths = packageIds
    .map((id) => graph.pathsByPackageId.get(id))
    .filter((path): path is DependencyPath => path !== undefined)
    .sort((left, right) => pathIdentity(left).localeCompare(pathIdentity(right)));
  return {
    dependencyPaths: paths.slice(0, maximumPaths),
    pathsTruncated: paths.length > maximumPaths,
  };
}

function pathIdentity(path: DependencyPath): string {
  return path.packages.map((item) => item.id).join('\0');
}

function createFingerprint(ruleId: string, subjectKey: string, discriminator: string): string {
  return createHash('sha256')
    .update([ruleId, '1', subjectKey, discriminator].join('\0'))
    .digest('hex');
}

function compareFindings(left: Finding, right: Finding): number {
  const priorityOrder: readonly FindingPriority[] = [
    'action-required',
    'review',
    'worth-knowing',
    'informational',
  ];
  const severityOrder: readonly FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  return (
    priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority) ||
    severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity) ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.subject.key.localeCompare(right.subject.key) ||
    left.fingerprint.localeCompare(right.fingerprint)
  );
}
