import type { PackageManifestSnapshot } from './PackageManifestSnapshot.js';

export function summarizeManifestDependencies(
  manifests: readonly PackageManifestSnapshot[],
  includeDevelopment: boolean,
) {
  const runtime = new Set<string>();
  const development = new Set<string>();
  const peer = new Set<string>();
  const optional = new Set<string>();
  for (const manifest of manifests) {
    Object.keys(manifest.dependencies).forEach((name) => runtime.add(name));
    if (includeDevelopment) {
      Object.keys(manifest.devDependencies).forEach((name) => development.add(name));
    }
    Object.keys(manifest.peerDependencies).forEach((name) => peer.add(name));
    Object.keys(manifest.optionalDependencies).forEach((name) => optional.add(name));
  }
  return {
    names: new Set([...runtime, ...development, ...peer, ...optional]),
    counts: {
      runtime: runtime.size,
      development: development.size,
      peer: peer.size,
      optional: optional.size,
    },
  };
}
