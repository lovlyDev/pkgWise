import type { InspectPackageInput } from '../public/ClientInputs.js';
import type {
  AnalysisReport,
  Finding,
  PackageInspection,
  PackageReport,
} from '../public/ClientResults.js';
import { PkgWiseError } from '../errors/PkgWiseError.js';
import { fetchNpmPackage } from '../providers/npm/fetchNpmPackage.js';
import { fetchOsvAdvisories } from '../providers/osv/fetchOsvAdvisories.js';
import { analyzeProject, type AnalyzeProjectContext } from './analyzeProject.js';
import { selectInstalledPackages } from './packageSelection.js';
import { compareFindings, createSecurityFindings } from '../rules/createSecurityFindings.js';
import { calculateProjectScores } from '../scoring/calculateProjectScores.js';

export async function inspectPackage(
  input: InspectPackageInput,
  context: AnalyzeProjectContext,
): Promise<PackageInspection> {
  const report =
    input.remote === true && input.projectRoot === undefined
      ? createRemoteOnlyReport(context)
      : await analyzeProject(
          {
            root: input.projectRoot ?? process.cwd(),
            ...(input.signal === undefined ? {} : { signal: input.signal }),
            ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
            ...(input.configFile === undefined ? {} : { configFile: input.configFile }),
          },
          context,
        );
  const selection = selectInstalledPackages(report.packages, input.packageSpec, {
    ...(input.allVersions === undefined ? {} : { allVersions: input.allVersions }),
    ...(input.remote === undefined ? {} : { remote: input.remote }),
  });
  const selected = [...selection.packages];
  const selectedIds = new Set(selected.map((item) => item.id));
  const findings = report.findings.filter(
    (finding) =>
      finding.subject.key === selection.name ||
      finding.subject.packageIds.some((id) => selectedIds.has(id)),
  );
  const includePaths = input.includePaths !== false;
  const remote =
    input.remote === true
      ? await fetchNpmPackage(
          {
            name: selection.name,
            ...(selection.requestedVersion === undefined
              ? {}
              : { requestedVersion: selection.requestedVersion }),
            offline: input.offline ?? false,
            refresh: input.refresh ?? false,
            cache: input.cache ?? true,
            ...(input.cacheDirectory === undefined ? {} : { cacheDirectory: input.cacheDirectory }),
            timeoutMs: input.timeoutMs ?? 10_000,
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          },
          {
            fetch: context.fetch,
            now: context.now,
            ...(context.sleep === undefined ? {} : { sleep: context.sleep }),
            ...(context.random === undefined ? {} : { random: context.random }),
          },
        )
      : undefined;

  if (selected.length === 0 && remote?.status === 'not-found') {
    throw new PkgWiseError({
      code: 'PW_PACKAGE_NOT_FOUND',
      userMessage: `Package ${input.packageSpec} was not found in the project or npm registry.`,
      recoverable: false,
    });
  }
  if (selected.length === 0 && remote !== undefined && remote.status !== 'available') {
    throw new PkgWiseError({
      code: 'PW_PROVIDER_UNAVAILABLE',
      userMessage:
        remote.status === 'offline'
          ? `Package ${input.packageSpec} is not cached and offline mode forbids a registry request.`
          : `The npm registry could not provide ${input.packageSpec}.`,
      recoverable: true,
    });
  }
  const selectedVersions = [...new Set(selected.flatMap((item) => item.version ?? []))];
  const securityVersion =
    remote?.selectedVersion ?? (selectedVersions.length === 1 ? selectedVersions[0] : undefined);
  const osv =
    input.remote === true && securityVersion !== undefined
      ? await fetchOsvAdvisories(
          {
            name: selection.name,
            version: securityVersion,
            offline: input.offline ?? false,
            refresh: input.refresh ?? false,
            cache: input.cache ?? true,
            ...(input.cacheDirectory === undefined ? {} : { cacheDirectory: input.cacheDirectory }),
            timeoutMs: input.timeoutMs ?? 10_000,
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          },
          {
            fetch: context.fetch,
            now: context.now,
            ...(context.sleep === undefined ? {} : { sleep: context.sleep }),
            ...(context.random === undefined ? {} : { random: context.random }),
          },
        )
      : undefined;
  const securityFindings =
    securityVersion === undefined
      ? []
      : createSecurityFindings(selection.name, securityVersion, selected, osv?.advisories ?? []);

  return {
    schemaVersion: '1',
    selector: input.packageSpec,
    availableVersions:
      selection.availableVersions.length === 0 && remote?.status === 'available'
        ? remote.availableVersions
        : selection.availableVersions,
    packages: selected.map((item) => withoutPathsWhenDisabled(item, includePaths)),
    findings: [...findings, ...securityFindings]
      .sort(compareFindings)
      .map((finding) => withoutFindingPathsWhenDisabled(finding, includePaths)),
    advisories: osv?.advisories ?? [],
    ...(remote === undefined ? {} : { remote }),
    report: {
      generatedAt: report.generatedAt,
      status: report.status,
      project: report.project,
      diagnostics: [
        ...report.diagnostics,
        ...(osv !== undefined && osv.status !== 'available'
          ? [
              {
                code: 'PW_OSV_UNAVAILABLE',
                level: 'warning' as const,
                message:
                  osv.status === 'offline'
                    ? 'OSV advisory data is not cached and offline mode forbids a request.'
                    : 'OSV advisory data is currently unavailable.',
              },
            ]
          : []),
      ],
    },
  };
}

function withoutPathsWhenDisabled(item: PackageReport, includePaths: boolean): PackageReport {
  return includePaths ? item : { ...item, dependencyPaths: [], pathsTruncated: false };
}

function withoutFindingPathsWhenDisabled(item: Finding, includePaths: boolean): Finding {
  return includePaths ? item : { ...item, dependencyPaths: [], pathsTruncated: false };
}

function createRemoteOnlyReport(context: AnalyzeProjectContext): AnalysisReport {
  return {
    schemaVersion: '1',
    status: 'partial',
    generatedAt: context.now().toISOString(),
    tool: { name: 'pkgwise', version: context.toolVersion },
    project: { rootName: 'remote', manager: 'npm', mode: 'manifest-only' },
    graph: {
      packageCount: 0,
      directDependencyCount: 0,
      transitiveDependencyCount: 0,
      edgeCount: 0,
      unresolvedDependencyCount: 0,
      maximumDepth: 0,
      duplicateVersionGroupCount: 0,
      cycleCount: 0,
      duplicateVersions: [],
      cycles: [],
      unresolvedDependencies: [],
      dependencyCounts: { runtime: 0, development: 0, peer: 0, optional: 0 },
    },
    packages: [],
    findings: [],
    scores: calculateProjectScores({ packages: [], findings: [] }),
    coverage: { overall: 0 },
    advisories: [],
    packageMetadata: [],
    enrichment: {
      requested: false,
      osv: {
        status: 'not-requested',
        eligibleCoordinateCount: 0,
        evaluatedCoordinateCount: 0,
        unavailableCoordinateCount: 0,
      },
      npm: {
        status: 'not-requested',
        eligibleCoordinateCount: 0,
        evaluatedCoordinateCount: 0,
        unavailableCoordinateCount: 0,
      },
    },
    policy: { status: 'passed', configured: false, evaluatedFindingCount: 0, violations: [] },
    configuration: { source: 'defaults', enabledRules: [], policyConfigured: false },
    diagnostics: [
      {
        code: 'PW_REMOTE_ONLY_INSPECTION',
        level: 'info',
        message: 'No project context was requested; only npm Registry metadata is included.',
      },
    ],
  };
}
