export interface PolicyDecisionSummary {
  readonly status: 'passed' | 'failed' | 'not-evaluated';
  readonly configured: boolean;
  readonly evaluatedFindingCount: number;
  readonly unevaluatedConditions?: readonly string[];
  readonly violations: readonly {
    readonly condition: string;
    readonly message: string;
    readonly findingFingerprints: readonly string[];
  }[];
}

export interface PackageReport {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly direct: boolean;
  readonly directScopes: readonly ('runtime' | 'development' | 'peer' | 'optional')[];
  readonly minimumDepth: number;
  readonly dependencyPaths: readonly DependencyPath[];
  readonly pathsTruncated: boolean;
  readonly resolvedDependencyCount: number;
  readonly integrity?: 'present' | 'missing';
}

export interface DuplicateVersionGroup {
  readonly name: string;
  readonly versions: readonly string[];
  readonly packageCount: number;
}

export interface DependencyCycleSummary {
  readonly packageIds: readonly string[];
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingPriority = 'action-required' | 'review' | 'worth-knowing' | 'informational';
export type ScoreCategory =
  'security' | 'maintenance' | 'supply-chain' | 'reliability' | 'compatibility' | 'quality';

export interface ScoreContribution {
  readonly ruleId: string;
  readonly category: ScoreCategory;
  readonly value: number;
  readonly weight: number;
  readonly confidence: number;
  readonly evidenceIds: readonly string[];
  readonly explanation: string;
}

export interface CategoryScore {
  readonly category: ScoreCategory;
  readonly status: 'available' | 'insufficient-data' | 'not-applicable';
  readonly score?: number;
  readonly confidence: number;
  readonly coverage: number;
  readonly contributions: readonly ScoreContribution[];
}

export interface ProjectScores {
  readonly status: 'available' | 'insufficient-data';
  readonly modelVersion: '1.0.0' | '1.1.0';
  readonly overall?: number;
  readonly label?: 'strong' | 'generally-healthy' | 'review-recommended' | 'material-concerns';
  readonly confidence: number;
  readonly coverage: number;
  readonly categories: readonly CategoryScore[];
}

export interface FindingEvidence {
  readonly id: string;
  readonly kind: 'confirmed-fact' | 'heuristic' | 'potential-risk';
  readonly summary: string;
}

export interface DependencyPath {
  readonly packages: readonly {
    readonly id: string;
    readonly name: string;
    readonly version?: string;
  }[];
}

export interface Finding {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly fingerprint: string;
  readonly subject: {
    readonly type: 'package' | 'package-group' | 'dependency-cycle' | 'dependency-relation';
    readonly key: string;
    readonly packageIds: readonly string[];
  };
  readonly title: string;
  readonly summary: string;
  readonly severity: FindingSeverity;
  readonly priority: FindingPriority;
  readonly confidence: number;
  readonly category: ScoreCategory;
  readonly context: {
    readonly direct: boolean;
    readonly scopes: readonly ('runtime' | 'development' | 'peer' | 'optional')[];
  };
  readonly evidence: readonly FindingEvidence[];
  readonly dependencyPaths: readonly DependencyPath[];
  readonly pathsTruncated: boolean;
  readonly recommendation: {
    readonly summary: string;
    readonly actions: readonly string[];
  };
}

export interface UnresolvedDependencyRelation {
  readonly fromPackageId?: string;
  readonly dependencyName: string;
  readonly requested: string;
  readonly scope: 'runtime' | 'development' | 'peer' | 'optional';
  readonly optional: boolean;
  readonly peer: boolean;
}

export interface AnalysisReport {
  readonly schemaVersion: '1';
  readonly status: 'complete' | 'partial';
  readonly generatedAt: string;
  readonly tool: { readonly name: 'pkgwise'; readonly version: string };
  readonly project: {
    readonly name?: string;
    readonly version?: string;
    readonly rootName: string;
    readonly manager: string;
    readonly lockfile?: string;
    readonly mode: 'locked' | 'manifest-only';
    readonly workspaces: {
      readonly availableCount: number;
      readonly selected: readonly { readonly name?: string; readonly path: string }[];
    };
  };
  readonly graph: {
    readonly packageCount: number;
    readonly directDependencyCount: number;
    readonly transitiveDependencyCount: number;
    readonly edgeCount: number;
    readonly unresolvedDependencyCount: number;
    readonly maximumDepth: number;
    readonly duplicateVersionGroupCount: number;
    readonly cycleCount: number;
    readonly duplicateVersions: readonly DuplicateVersionGroup[];
    readonly cycles: readonly DependencyCycleSummary[];
    readonly unresolvedDependencies: readonly UnresolvedDependencyRelation[];
    readonly lockfileVersion?: string;
    readonly fidelity?: 'full' | 'reduced';
    readonly dependencyCounts: {
      readonly runtime: number;
      readonly development: number;
      readonly peer: number;
      readonly optional: number;
    };
  };
  readonly packages: readonly PackageReport[];
  readonly findings: readonly Finding[];
  readonly scores: ProjectScores;
  readonly coverage: { readonly overall: number; readonly security?: number };
  readonly advisories: readonly ProjectSecurityAdvisory[];
  readonly packageMetadata: readonly ProjectPackageMetadata[];
  readonly enrichment: {
    readonly requested: boolean;
    readonly osv: {
      readonly status: 'not-requested' | 'available' | 'partial' | 'offline' | 'unavailable';
      readonly eligibleCoordinateCount: number;
      readonly evaluatedCoordinateCount: number;
      readonly unavailableCoordinateCount: number;
    };
    readonly npm: {
      readonly status: 'not-requested' | 'available' | 'partial' | 'offline' | 'unavailable';
      readonly eligibleCoordinateCount: number;
      readonly evaluatedCoordinateCount: number;
      readonly unavailableCoordinateCount: number;
    };
  };
  readonly policy: PolicyDecisionSummary;
  readonly configuration: {
    readonly source: 'explicit-file' | 'project-file' | 'package-json' | 'defaults';
    readonly relativePath?: string;
    readonly enabledRules: readonly string[];
    readonly policyConfigured: boolean;
  };
  readonly diagnostics: readonly {
    readonly code: string;
    readonly level: 'warning' | 'info';
    readonly message: string;
  }[];
}

export interface PackageInspection {
  readonly schemaVersion: '1';
  readonly selector: string;
  readonly availableVersions: readonly string[];
  readonly packages: readonly PackageReport[];
  readonly findings: readonly Finding[];
  readonly advisories: readonly SecurityAdvisory[];
  readonly remote?: RemotePackageMetadata;
  readonly report: {
    readonly generatedAt: string;
    readonly status: 'complete' | 'partial';
    readonly project: AnalysisReport['project'];
    readonly diagnostics: AnalysisReport['diagnostics'];
  };
}

export interface SecurityAdvisory {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly summary?: string;
  readonly severity: FindingSeverity | 'unknown';
  readonly active: boolean;
  readonly published?: string;
  readonly modified?: string;
  readonly withdrawn?: string;
  readonly references: readonly string[];
  readonly source: {
    readonly provider: 'osv';
    readonly url: string;
    readonly cache: 'miss' | 'fresh' | 'stale';
  };
}

export interface ProjectSecurityAdvisory {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly advisory: SecurityAdvisory;
}

export interface RemotePackageMetadata {
  readonly status: 'available' | 'not-found' | 'unavailable' | 'offline';
  readonly source: {
    readonly provider: 'npm-registry';
    readonly url: string;
    readonly cache: 'miss' | 'fresh' | 'stale';
  };
  readonly name: string;
  readonly selectedVersion?: string;
  readonly availableVersions: readonly string[];
  readonly distTags: Readonly<Record<string, string>>;
  readonly description?: string;
  readonly license?: string;
  readonly deprecated?: string;
  readonly engines?: Readonly<Record<string, string>>;
  readonly repository?: string;
  readonly publishedAt?: string;
  readonly createdAt?: string;
  readonly maintainerCount?: number;
  readonly lifecycleScripts?: readonly string[];
}

export interface ProjectPackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly status: RemotePackageMetadata['status'];
  readonly source: RemotePackageMetadata['source'];
  readonly deprecated?: string;
  readonly license?: string;
  readonly repository?: string;
  readonly publishedAt?: string;
  readonly createdAt?: string;
  readonly maintainerCount?: number;
  readonly lifecycleScripts?: readonly string[];
}

export interface PackageComparison {
  readonly schemaVersion: '1';
  readonly selectors: readonly [string, string];
  readonly candidates: readonly [PackageComparisonCandidate, PackageComparisonCandidate];
  readonly metrics: readonly PackageComparisonMetric[];
  readonly context: {
    readonly targetNode?: string;
    readonly unavailableData: readonly string[];
  };
  readonly conclusion: {
    readonly winner: 'not-declared';
    readonly summary: string;
  };
  readonly recommendation?: {
    readonly summary: string;
    readonly actions: readonly string[];
  };
  readonly report: {
    readonly generatedAt: string;
    readonly status: 'complete' | 'partial';
    readonly project: AnalysisReport['project'];
    readonly diagnostics: AnalysisReport['diagnostics'];
  };
}

export type PackageComparisonMetricName =
  'version' | 'directness' | 'scopes' | 'depth' | 'footprint' | 'findings';

export interface PackageComparisonCandidate {
  readonly selector: string;
  readonly availableVersions: readonly string[];
  readonly packages: readonly PackageReport[];
  readonly findings: readonly Finding[];
}

export interface PackageComparisonMetric {
  readonly name: PackageComparisonMetricName;
  readonly status: 'equal' | 'different' | 'unavailable';
  readonly candidateA?: string | number | boolean | readonly string[];
  readonly candidateB?: string | number | boolean | readonly string[];
  readonly summary: string;
}

export interface FindingExplanation {
  readonly schemaVersion: '1';
  readonly selector: string;
  readonly finding: Finding;
  readonly relatedPackages: readonly PackageReport[];
  readonly report: {
    readonly generatedAt: string;
    readonly status: 'complete' | 'partial';
    readonly project: AnalysisReport['project'];
    readonly diagnostics: AnalysisReport['diagnostics'];
  };
}

export interface DoctorCheck {
  readonly id: string;
  readonly status: 'pass' | 'warning' | 'fail';
  readonly message: string;
}

export interface DoctorReport {
  readonly schemaVersion: '1';
  readonly status: 'healthy' | 'degraded';
  readonly checks: readonly DoctorCheck[];
}

export interface CacheStatusReport {
  readonly schemaVersion: '1';
  readonly path: string;
  readonly exists: boolean;
  readonly owned: boolean;
  readonly entryCount: number;
  readonly totalBytes: number;
  readonly expiredEntryCount: number;
  readonly corruptEntryCount: number;
  readonly providers: Readonly<Record<string, number>>;
}

export interface ClearCacheResult {
  readonly schemaVersion: '1';
  readonly path: string;
  readonly provider?: string;
  readonly removedEntries: number;
  readonly removedBytes: number;
  readonly namespaceRemoved: boolean;
}
