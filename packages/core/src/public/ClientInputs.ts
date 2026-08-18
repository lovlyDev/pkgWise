import type { ProgressEvent } from './ProgressEvent.js';

export interface CommonOperationInput {
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: ProgressEvent) => void;
  readonly configFile?: string;
  readonly offline?: boolean;
  readonly refresh?: boolean;
  readonly cache?: boolean;
  readonly cacheDirectory?: string;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
}

export interface AnalyzeProjectInput extends CommonOperationInput {
  readonly root: string;
  readonly workspaces?: readonly string[];
  readonly includeDev?: boolean;
  readonly rules?: readonly string[];
  readonly remote?: boolean;
}

export interface InspectPackageInput extends CommonOperationInput {
  readonly packageSpec: string;
  readonly projectRoot?: string;
  readonly allVersions?: boolean;
  readonly remote?: boolean;
  readonly includePaths?: boolean;
}

export interface ComparePackagesInput extends CommonOperationInput {
  readonly packageA: string;
  readonly packageB: string;
  readonly projectRoot?: string;
  readonly targetNode?: string;
  readonly metrics?: readonly string[];
  readonly includeRecommendation?: boolean;
}

export interface ExplainFindingInput extends CommonOperationInput {
  readonly selector: string;
  readonly projectRoot?: string;
}

export interface DiagnoseInput extends CommonOperationInput {
  readonly root?: string;
  readonly offline?: boolean;
}

export interface CacheStatusInput extends CommonOperationInput {}

export interface ClearCacheInput extends CacheStatusInput {
  readonly provider?: string;
}
