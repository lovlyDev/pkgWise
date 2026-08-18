import { diagnoseEnvironment } from '../application/diagnoseEnvironment.js';
import { analyzeProject } from '../application/analyzeProject.js';
import { explainFinding } from '../application/explainFinding.js';
import { inspectPackage } from '../application/inspectPackage.js';
import { comparePackages } from '../application/comparePackages.js';
import { clearCache, getCacheStatus } from '../cache/cacheOperations.js';
import type { PkgWiseClient } from './PkgWiseClient.js';

export interface CreatePkgWiseOptions {
  readonly version?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => Date;
}

export function createPkgWise(options: CreatePkgWiseOptions = {}): PkgWiseClient {
  const context = {
    toolVersion: options.version ?? '0.1.0-alpha.0',
    now: options.now ?? (() => new Date()),
    fetch: options.fetch ?? globalThis.fetch,
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    ...(options.random === undefined ? {} : { random: options.random }),
  };
  return {
    analyzeProject: (input) => analyzeProject(input, context),
    inspectPackage: (input) => inspectPackage(input, context),
    comparePackages: (input) => comparePackages(input, context),
    explainFinding: (input) => explainFinding(input, context),
    diagnose: diagnoseEnvironment,
    getCacheStatus,
    clearCache,
  };
}
