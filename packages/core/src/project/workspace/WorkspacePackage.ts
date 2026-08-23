import type { PackageManifestSnapshot } from '../manifest/PackageManifestSnapshot.js';

export interface WorkspacePackage {
  readonly name?: string;
  readonly relativePath: string;
  readonly manifest: PackageManifestSnapshot;
}
