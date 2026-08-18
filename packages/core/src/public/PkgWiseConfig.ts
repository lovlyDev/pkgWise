import type { FindingSeverity, ScoreCategory } from './ClientResults.js';

export type ConfiguredEvidenceKind = 'confirmed-fact' | 'heuristic' | 'potential-risk';
export type ConfiguredDependencyScope = 'runtime' | 'development' | 'peer' | 'optional';

export interface FindingPolicyCondition {
  readonly type: 'finding';
  readonly minimumSeverity: FindingSeverity;
  readonly evidenceKinds?: readonly ConfiguredEvidenceKind[];
  readonly minimumConfidence?: number;
  readonly rules?: readonly string[];
  readonly packages?: readonly string[];
  readonly scopes?: readonly ConfiguredDependencyScope[];
  readonly directOnly?: boolean;
}

export interface CoveragePolicyCondition {
  readonly type: 'coverage';
  readonly below: number;
}

export interface ScorePolicyCondition {
  readonly type: 'score';
  readonly target: 'overall' | ScoreCategory;
  readonly below: number;
  readonly minimumCoverage?: number;
  readonly minimumConfidence?: number;
}

export type SupportedPolicyCondition =
  FindingPolicyCondition | CoveragePolicyCondition | ScorePolicyCondition;

export interface PkgWiseConfigV1 {
  readonly schemaVersion: 1;
  readonly project?: { readonly includeDev?: boolean };
  readonly rules?: Readonly<
    Record<
      string,
      false | { readonly enabled?: boolean; readonly options?: Readonly<Record<string, unknown>> }
    >
  >;
  readonly scoring?: {
    readonly categoryWeights?: Partial<Readonly<Record<ScoreCategory, number>>>;
  };
  readonly policy?: {
    readonly fail?: readonly SupportedPolicyCondition[];
    readonly minimumOverallCoverage?: number;
  };
}

export interface LoadedPkgWiseConfig {
  readonly config: PkgWiseConfigV1;
  readonly source: 'explicit-file' | 'project-file' | 'package-json' | 'defaults';
  readonly relativePath?: string;
}
