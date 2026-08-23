export interface PackageManifestSnapshot {
  readonly name?: string;
  readonly version?: string;
  readonly packageManager?: string;
  readonly workspaces: readonly string[];
  readonly pkgwise?: unknown;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly optionalDependencies: Readonly<Record<string, string>>;
}
