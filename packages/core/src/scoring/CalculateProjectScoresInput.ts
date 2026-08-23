import type { DependencyGraphAnalysis } from '../project/lockfile/analyzeDependencyGraph.js';
import type { ProjectNpmResult } from '../providers/npm/fetchProjectNpm.js';
import type { ProjectOsvResult } from '../providers/osv/fetchProjectOsv.js';
import type { Finding, PackageReport, ScoreCategory } from '../public/ClientResults.js';

export interface CalculateProjectScoresInput {
  readonly graph?: DependencyGraphAnalysis;
  readonly packages: readonly PackageReport[];
  readonly findings: readonly Finding[];
  readonly osv?: ProjectOsvResult;
  readonly npm?: ProjectNpmResult;
  readonly now?: Date;
  readonly categoryWeights?: Partial<Readonly<Record<ScoreCategory, number>>>;
}
