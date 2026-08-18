import { PkgWiseError } from '../errors/PkgWiseError.js';
import type { ComparePackagesInput } from '../public/ClientInputs.js';
import type {
  AnalysisReport,
  Finding,
  PackageComparison,
  PackageComparisonCandidate,
  PackageComparisonMetric,
  PackageComparisonMetricName,
  PackageReport,
} from '../public/ClientResults.js';
import { analyzeProject, type AnalyzeProjectContext } from './analyzeProject.js';
import { selectInstalledPackages } from './packageSelection.js';

const metricNames: readonly PackageComparisonMetricName[] = [
  'version',
  'directness',
  'scopes',
  'depth',
  'footprint',
  'findings',
];

export async function comparePackages(
  input: ComparePackagesInput,
  context: AnalyzeProjectContext,
): Promise<PackageComparison> {
  const selectedMetrics = resolveMetrics(input.metrics);
  const report = await analyzeProject(
    {
      root: input.projectRoot ?? process.cwd(),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
      ...(input.configFile === undefined ? {} : { configFile: input.configFile }),
    },
    context,
  );
  const selectionA = selectInstalledPackages(report.packages, input.packageA);
  const selectionB = selectInstalledPackages(report.packages, input.packageB);
  const candidateA = createCandidate(
    input.packageA,
    selectionA.availableVersions,
    selectionA.packages,
    report,
  );
  const candidateB = createCandidate(
    input.packageB,
    selectionB.availableVersions,
    selectionB.packages,
    report,
  );
  const metrics = selectedMetrics.map((name) => compareMetric(name, candidateA, candidateB));
  const differenceCount = metrics.filter((metric) => metric.status === 'different').length;
  const unavailableData = [
    'Remote security, maintenance, supply-chain, license, and module-format metadata are unavailable.',
    ...(input.targetNode === undefined
      ? []
      : [
          'Node.js engine compatibility is unavailable until version metadata providers are implemented.',
        ]),
  ];

  return {
    schemaVersion: '1',
    selectors: [input.packageA, input.packageB],
    candidates: [candidateA, candidateB],
    metrics,
    context: {
      ...(input.targetNode === undefined ? {} : { targetNode: input.targetNode }),
      unavailableData,
    },
    conclusion: {
      winner: 'not-declared',
      summary:
        differenceCount === 0
          ? 'The available local metrics are equal; no package winner is declared.'
          : `${differenceCount} local ${differenceCount === 1 ? 'metric differs' : 'metrics differ'}; these trade-offs do not establish an overall winner.`,
    },
    ...(input.includeRecommendation === false
      ? {}
      : {
          recommendation: {
            summary: 'Choose using project requirements and review candidate-specific findings.',
            actions: [
              'Inspect related findings and dependency paths for both candidates.',
              'Add remote metadata only when provider coverage is available and equivalent.',
            ],
          },
        }),
    report: {
      generatedAt: report.generatedAt,
      status: report.status,
      project: report.project,
      diagnostics: report.diagnostics,
    },
  };
}

function createCandidate(
  selector: string,
  availableVersions: readonly string[],
  packages: readonly PackageReport[],
  report: AnalysisReport,
): PackageComparisonCandidate {
  const ids = new Set(packages.map((item) => item.id));
  const names = new Set(packages.map((item) => item.name));
  return {
    selector,
    availableVersions,
    packages,
    findings: report.findings.filter(
      (finding) =>
        names.has(finding.subject.key) || finding.subject.packageIds.some((id) => ids.has(id)),
    ),
  };
}

function resolveMetrics(
  requested: readonly string[] | undefined,
): readonly PackageComparisonMetricName[] {
  if (requested === undefined || requested.length === 0) return metricNames;
  const result = new Set<PackageComparisonMetricName>();
  for (const name of requested) {
    if (!(metricNames as readonly string[]).includes(name)) {
      throw new PkgWiseError({
        code: 'PW_CONFIG_INVALID',
        userMessage: `Unknown comparison metric ${JSON.stringify(name)}. Available metrics: ${metricNames.join(', ')}.`,
        recoverable: false,
      });
    }
    result.add(name as PackageComparisonMetricName);
  }
  return metricNames.filter((name) => result.has(name));
}

function compareMetric(
  name: PackageComparisonMetricName,
  candidateA: PackageComparisonCandidate,
  candidateB: PackageComparisonCandidate,
): PackageComparisonMetric {
  const valueA = metricValue(name, candidateA);
  const valueB = metricValue(name, candidateB);
  const equal = JSON.stringify(valueA) === JSON.stringify(valueB);
  return {
    name,
    status: equal ? 'equal' : 'different',
    candidateA: valueA,
    candidateB: valueB,
    summary: equal
      ? `${metricLabel(name)} is equal.`
      : `${metricLabel(name)} differs between candidates.`,
  };
}

function metricValue(
  name: PackageComparisonMetricName,
  candidate: PackageComparisonCandidate,
): string | number | boolean | readonly string[] {
  switch (name) {
    case 'version':
      return [...new Set(candidate.packages.flatMap((item) => item.version ?? []))];
    case 'directness':
      return candidate.packages.some((item) => item.direct);
    case 'scopes':
      return [...new Set(candidate.packages.flatMap((item) => item.directScopes))].sort();
    case 'depth':
      return Math.min(...candidate.packages.map((item) => item.minimumDepth));
    case 'footprint':
      return Math.max(...candidate.packages.map((item) => item.resolvedDependencyCount));
    case 'findings':
      return candidate.findings.length;
  }
}

function metricLabel(name: PackageComparisonMetricName): string {
  return name === 'footprint' ? 'Immediate resolved dependency footprint' : name;
}
