export type DependencyScope = 'runtime' | 'development' | 'peer' | 'optional';

export interface LockfileDependencyReference {
  readonly name: string;
  readonly requested: string;
  readonly scope: DependencyScope;
  readonly optional: boolean;
  readonly peer: boolean;
  readonly targetId?: string;
}

export interface LockfilePackageRecord {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly dependencies: readonly LockfileDependencyReference[];
}

export interface LockfileImporterRecord {
  readonly id: string;
  readonly dependencies: readonly LockfileDependencyReference[];
}

export interface LockfileGraphSnapshot {
  readonly manager: 'npm' | 'pnpm';
  readonly lockfileVersion: string;
  readonly fidelity: 'full' | 'reduced';
  readonly packages: readonly LockfilePackageRecord[];
  readonly importer: LockfileImporterRecord;
}

export interface DependencyGraphSummary {
  readonly packageCount: number;
  readonly edgeCount: number;
  readonly unresolvedDependencyCount: number;
  readonly maximumDepth: number;
}
