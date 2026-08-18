import { basename } from 'node:path';
import { loadPkgWiseConfig } from '../config/loadPkgWiseConfig.js';
import { evaluatePolicy } from '../policy/evaluatePolicy.js';
import { detectPackageManager } from '../project/discovery/detectPackageManager.js';
import { discoverProjectRoot } from '../project/discovery/discoverProjectRoot.js';
import { loadPackageManifest } from '../project/manifest/loadPackageManifest.js';
import {
  analyzeDependencyGraph,
  stablePackageId,
} from '../project/lockfile/analyzeDependencyGraph.js';
import { parseProjectLockfile } from '../project/lockfile/parseProjectLockfile.js';
import type { AnalyzeProjectInput } from '../public/ClientInputs.js';
import type { AnalysisReport, Finding, PackageReport } from '../public/ClientResults.js';
import { defaultLocalRuleIds, localRuleIds, runLocalRules } from '../rules/runLocalRules.js';
import { fetchProjectOsv } from '../providers/osv/fetchProjectOsv.js';
import { compareFindings, createSecurityFindings } from '../rules/createSecurityFindings.js';

export interface AnalyzeProjectContext {
  readonly toolVersion: string;
  readonly now: () => Date;
  readonly fetch: typeof globalThis.fetch;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly random?: () => number;
}

export async function analyzeProject(
  input: AnalyzeProjectInput,
  context: AnalyzeProjectContext,
): Promise<AnalysisReport> {
  emitProgress(input, 'phase-started', 'discovery');
  const root = await discoverProjectRoot(input.root, input.signal);
  const manifest = await loadPackageManifest(root, input.signal);
  const loadedConfig = await loadPkgWiseConfig(root, manifest, input.configFile, input.signal);
  const manager = await detectPackageManager(root, manifest, input.signal);
  const includeDevelopment = input.includeDev ?? loadedConfig.config.project?.includeDev ?? true;
  const enabledRules =
    input.rules !== undefined
      ? [...new Set(input.rules)].sort()
      : resolveConfiguredRules(loadedConfig.config.rules);
  emitProgress(input, 'phase-completed', 'discovery');

  emitProgress(input, 'phase-started', 'parsing');
  const lockfileGraph = await parseProjectLockfile(root, manager, input.signal);
  emitProgress(input, 'phase-completed', 'parsing');

  emitProgress(input, 'phase-started', 'graph');
  const graphAnalysis =
    lockfileGraph === undefined
      ? undefined
      : analyzeDependencyGraph(lockfileGraph, includeDevelopment);
  emitProgress(input, 'phase-completed', 'graph');

  const dependencyCounts = {
    runtime: Object.keys(manifest.dependencies).length,
    development: includeDevelopment ? Object.keys(manifest.devDependencies).length : 0,
    peer: Object.keys(manifest.peerDependencies).length,
    optional: Object.keys(manifest.optionalDependencies).length,
  };
  const directNames = new Set([
    ...Object.keys(manifest.dependencies),
    ...(includeDevelopment ? Object.keys(manifest.devDependencies) : []),
    ...Object.keys(manifest.peerDependencies),
    ...Object.keys(manifest.optionalDependencies),
  ]);

  const packages =
    graphAnalysis?.packages ??
    createManifestPackageReports(manifest, manager.name, includeDevelopment);

  emitProgress(input, 'phase-started', 'rules');
  const localFindings = runLocalRules(graphAnalysis, enabledRules);
  emitProgress(input, 'phase-completed', 'rules');

  const coordinates = packages.flatMap((item) =>
    item.version === undefined ? [] : [{ name: item.name, version: item.version }],
  );
  const osv =
    input.remote === true
      ? await enrichWithOsv(input, context, coordinates)
      : {
          status: 'not-requested' as const,
          coordinates: [],
          advisories: [],
          eligibleCoordinateCount: 0,
          evaluatedCoordinateCount: 0,
          unavailableCoordinateCount: 0,
        };
  const securityFindings: Finding[] = osv.coordinates.flatMap(({ name, version, result }) =>
    createSecurityFindings(
      name,
      version,
      packages.filter((item) => item.name === name && item.version === version),
      result.advisories,
    ),
  );
  const findings = [...localFindings, ...securityFindings].sort(compareFindings);
  const securityCoverage =
    input.remote === true
      ? osv.eligibleCoordinateCount === 0
        ? 1
        : osv.evaluatedCoordinateCount / osv.eligibleCoordinateCount
      : undefined;
  const coverage = {
    overall: 0,
    ...(securityCoverage === undefined ? {} : { security: securityCoverage }),
  };
  const policy = evaluatePolicy(loadedConfig.config.policy, findings, packages, coverage.overall);

  return {
    schemaVersion: '1',
    status: 'partial',
    generatedAt: context.now().toISOString(),
    tool: { name: 'pkgwise', version: context.toolVersion },
    project: {
      ...(manifest.name === undefined ? {} : { name: manifest.name }),
      ...(manifest.version === undefined ? {} : { version: manifest.version }),
      rootName: basename(root),
      manager: manager.name,
      ...(manager.lockfile === undefined ? {} : { lockfile: manager.lockfile }),
      mode: manager.lockfile === undefined ? 'manifest-only' : 'locked',
    },
    graph: {
      packageCount: graphAnalysis?.summary.packageCount ?? directNames.size,
      directDependencyCount: directNames.size,
      transitiveDependencyCount: Math.max(
        0,
        (graphAnalysis?.summary.packageCount ?? directNames.size) - directNames.size,
      ),
      edgeCount: graphAnalysis?.summary.edgeCount ?? directNames.size,
      unresolvedDependencyCount:
        graphAnalysis?.summary.unresolvedDependencyCount ?? directNames.size,
      maximumDepth: graphAnalysis?.summary.maximumDepth ?? (directNames.size === 0 ? 0 : 1),
      duplicateVersionGroupCount: graphAnalysis?.duplicateVersions.length ?? 0,
      cycleCount: graphAnalysis?.cycles.length ?? 0,
      duplicateVersions: graphAnalysis?.duplicateVersions ?? [],
      cycles: graphAnalysis?.cycles ?? [],
      unresolvedDependencies: graphAnalysis?.unresolvedDependencies ?? [],
      ...(lockfileGraph === undefined
        ? {}
        : {
            lockfileVersion: lockfileGraph.lockfileVersion,
            fidelity: lockfileGraph.fidelity,
          }),
      dependencyCounts,
    },
    packages,
    findings,
    scores: { status: 'unavailable' },
    coverage,
    advisories: osv.advisories,
    enrichment: {
      requested: input.remote === true,
      osv: {
        status: osv.status,
        eligibleCoordinateCount: osv.eligibleCoordinateCount,
        evaluatedCoordinateCount: osv.evaluatedCoordinateCount,
        unavailableCoordinateCount: osv.unavailableCoordinateCount,
      },
    },
    policy,
    configuration: {
      source: loadedConfig.source,
      ...(loadedConfig.relativePath === undefined
        ? {}
        : { relativePath: loadedConfig.relativePath }),
      enabledRules,
      policyConfigured: loadedConfig.config.policy !== undefined,
    },
    diagnostics: [
      ...(lockfileGraph === undefined
        ? [
            {
              code:
                manifest.packageManager !== undefined && manager.lockfile === undefined
                  ? 'PW_PROJECT_DECLARED_LOCKFILE_MISSING'
                  : manager.lockfile === undefined
                    ? 'PW_ANALYSIS_DIRECT_DEPENDENCIES_ONLY'
                    : 'PW_LOCKFILE_MANAGER_NOT_IMPLEMENTED',
              level: 'warning' as const,
              message:
                manifest.packageManager !== undefined && manager.lockfile === undefined
                  ? `${manager.name} is declared in package.json, but its lockfile was not found; only manifest dependencies are included.`
                  : manager.lockfile === undefined
                    ? 'Only direct manifest dependencies are included because no lockfile was found.'
                    : `${manager.name} lockfile graph parsing is not implemented yet; only manifest dependencies are included.`,
            },
          ]
        : [
            {
              code: 'PW_ANALYSIS_GRAPH_READY_RULES_PENDING',
              level: 'warning' as const,
              message:
                input.remote === true
                  ? `Resolved ${graphAnalysis?.summary.packageCount ?? 0} lockfile packages and ran local topology and OSV security rules; scoring is not implemented yet.`
                  : `Resolved ${graphAnalysis?.summary.packageCount ?? 0} lockfile packages and ran local topology rules; remote security enrichment is opt-in and scoring is not implemented yet.`,
            },
          ]),
      ...(input.remote === true && osv.status !== 'available'
        ? [
            {
              code: 'PW_OSV_PROJECT_ENRICHMENT_INCOMPLETE',
              level: 'warning' as const,
              message:
                osv.status === 'offline'
                  ? 'OSV project data is not fully cached and offline mode forbids requests.'
                  : `OSV evaluated ${osv.evaluatedCoordinateCount} of ${osv.eligibleCoordinateCount} exact package coordinates.`,
            },
          ]
        : []),
    ],
  };
}

async function enrichWithOsv(
  input: AnalyzeProjectInput,
  context: AnalyzeProjectContext,
  coordinates: readonly { readonly name: string; readonly version: string }[],
) {
  emitProgress(input, 'phase-started', 'providers');
  const result = await fetchProjectOsv(
    coordinates,
    {
      offline: input.offline ?? false,
      refresh: input.refresh ?? false,
      cache: input.cache ?? true,
      ...(input.cacheDirectory === undefined ? {} : { cacheDirectory: input.cacheDirectory }),
      timeoutMs: input.timeoutMs ?? 10_000,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      concurrency: input.concurrency ?? 2,
    },
    {
      fetch: context.fetch,
      now: context.now,
      ...(context.sleep === undefined ? {} : { sleep: context.sleep }),
      ...(context.random === undefined ? {} : { random: context.random }),
    },
  );
  emitProgress(input, 'phase-completed', 'providers');
  return result;
}

function resolveConfiguredRules(
  settings: import('../public/PkgWiseConfig.js').PkgWiseConfigV1['rules'],
): string[] {
  const enabled = new Set<string>(defaultLocalRuleIds);
  if (settings !== undefined) {
    for (const ruleId of localRuleIds) {
      const setting = settings[ruleId];
      if (setting === false || setting?.enabled === false) enabled.delete(ruleId);
      if (setting !== false && setting?.enabled === true) enabled.add(ruleId);
    }
  }
  return [...enabled].sort();
}

function createManifestPackageReports(
  manifest: Awaited<ReturnType<typeof loadPackageManifest>>,
  manager: string,
  includeDevelopment: boolean,
): PackageReport[] {
  const names = new Set([
    ...Object.keys(manifest.dependencies),
    ...(includeDevelopment ? Object.keys(manifest.devDependencies) : []),
    ...Object.keys(manifest.peerDependencies),
    ...Object.keys(manifest.optionalDependencies),
  ]);
  const optionalNames = new Set(Object.keys(manifest.optionalDependencies));

  return [...names].sort().map((name) => {
    const scopes: PackageReport['directScopes'][number][] = [];
    if (name in manifest.dependencies && !optionalNames.has(name)) scopes.push('runtime');
    if (includeDevelopment && name in manifest.devDependencies) scopes.push('development');
    if (name in manifest.peerDependencies) scopes.push('peer');
    if (optionalNames.has(name)) scopes.push('optional');
    return {
      id: stablePackageId(manager, `manifest:${name}`),
      name,
      direct: true,
      directScopes: scopes,
      minimumDepth: 1,
      dependencyPaths: [
        {
          packages: [{ id: stablePackageId(manager, `manifest:${name}`), name }],
        },
      ],
      pathsTruncated: false,
      resolvedDependencyCount: 0,
    };
  });
}

function emitProgress(
  input: AnalyzeProjectInput,
  type: 'phase-started' | 'phase-completed',
  phase: 'discovery' | 'parsing' | 'graph' | 'providers' | 'rules',
): void {
  input.onProgress?.({ type, phase });
}
