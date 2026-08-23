import type { PackageReport } from '../../public/ClientResults.js';
import { stablePackageId } from '../lockfile/analyzeDependencyGraph.js';
import type { PackageManifestSnapshot } from './PackageManifestSnapshot.js';

export function createManifestPackageReports(
  manifests: readonly PackageManifestSnapshot[],
  manager: string,
  includeDevelopment: boolean,
): PackageReport[] {
  const scopesByName = new Map<string, Set<PackageReport['directScopes'][number]>>();
  for (const manifest of manifests) {
    addScopes(
      scopesByName,
      Object.fromEntries(
        Object.entries(manifest.dependencies).filter(
          ([name]) => !(name in manifest.optionalDependencies),
        ),
      ),
      'runtime',
    );
    if (includeDevelopment) addScopes(scopesByName, manifest.devDependencies, 'development');
    addScopes(scopesByName, manifest.peerDependencies, 'peer');
    addScopes(scopesByName, manifest.optionalDependencies, 'optional');
  }
  return [...scopesByName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, scopes]) => ({
      id: stablePackageId(manager, `manifest:${name}`),
      name,
      direct: true,
      directScopes: [...scopes].sort(compareScopes),
      minimumDepth: 1,
      dependencyPaths: [{ packages: [{ id: stablePackageId(manager, `manifest:${name}`), name }] }],
      pathsTruncated: false,
      resolvedDependencyCount: 0,
    }));
}

function addScopes(
  target: Map<string, Set<PackageReport['directScopes'][number]>>,
  dependencies: Readonly<Record<string, string>>,
  scope: PackageReport['directScopes'][number],
): void {
  for (const name of Object.keys(dependencies)) {
    const scopes = target.get(name) ?? new Set<PackageReport['directScopes'][number]>();
    scopes.add(scope);
    target.set(name, scopes);
  }
}

function compareScopes(
  left: PackageReport['directScopes'][number],
  right: PackageReport['directScopes'][number],
): number {
  const order: readonly PackageReport['directScopes'][number][] = [
    'runtime',
    'development',
    'peer',
    'optional',
  ];
  return order.indexOf(left) - order.indexOf(right);
}
