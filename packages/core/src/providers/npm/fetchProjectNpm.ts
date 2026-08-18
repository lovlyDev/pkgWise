import type { ProjectPackageMetadata } from '../../public/ClientResults.js';
import {
  fetchNpmPackage,
  type NpmPackageRequest,
  type NpmProviderRuntime,
} from './fetchNpmPackage.js';

export interface ProjectNpmCoordinate {
  readonly name: string;
  readonly version: string;
}

export interface ProjectNpmResult {
  readonly status: 'available' | 'partial' | 'offline' | 'unavailable';
  readonly packages: readonly ProjectPackageMetadata[];
  readonly eligibleCoordinateCount: number;
  readonly evaluatedCoordinateCount: number;
  readonly unavailableCoordinateCount: number;
}

export async function fetchProjectNpm(
  coordinates: readonly ProjectNpmCoordinate[],
  request: Omit<NpmPackageRequest, 'name' | 'requestedVersion'> & {
    readonly concurrency: number;
  },
  runtime: NpmProviderRuntime,
): Promise<ProjectNpmResult> {
  const unique = [
    ...new Map(
      coordinates.map((coordinate) => [`${coordinate.name}\0${coordinate.version}`, coordinate]),
    ).values(),
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
  const grouped = new Map<string, ProjectNpmCoordinate[]>();
  for (const coordinate of unique) {
    const group = grouped.get(coordinate.name) ?? [];
    group.push(coordinate);
    grouped.set(coordinate.name, group);
  }
  const groups = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  const packages: ProjectPackageMetadata[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < groups.length) {
      const group = groups[next++];
      if (group === undefined) return;
      for (const coordinate of group[1]) {
        const metadata = await fetchNpmPackage(
          { ...request, name: coordinate.name, requestedVersion: coordinate.version },
          runtime,
        );
        packages.push(compactMetadata(coordinate, metadata));
      }
    }
  };
  const workerCount = Math.min(groups.length, Math.max(1, Math.min(4, request.concurrency)));
  await Promise.all(Array.from({ length: workerCount }, worker));
  packages.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
  const evaluatedCoordinateCount = packages.filter(
    (metadata) => metadata.status === 'available',
  ).length;
  const unavailableCoordinateCount = unique.length - evaluatedCoordinateCount;
  return {
    status: summarizeStatus(packages, evaluatedCoordinateCount),
    packages,
    eligibleCoordinateCount: unique.length,
    evaluatedCoordinateCount,
    unavailableCoordinateCount,
  };
}

function compactMetadata(
  coordinate: ProjectNpmCoordinate,
  metadata: Awaited<ReturnType<typeof fetchNpmPackage>>,
): ProjectPackageMetadata {
  return {
    name: coordinate.name,
    version: coordinate.version,
    status: metadata.status,
    source: metadata.source,
    ...(metadata.deprecated === undefined ? {} : { deprecated: metadata.deprecated }),
    ...(metadata.license === undefined ? {} : { license: metadata.license }),
    ...(metadata.repository === undefined ? {} : { repository: metadata.repository }),
    ...(metadata.publishedAt === undefined ? {} : { publishedAt: metadata.publishedAt }),
    ...(metadata.createdAt === undefined ? {} : { createdAt: metadata.createdAt }),
    ...(metadata.maintainerCount === undefined
      ? {}
      : { maintainerCount: metadata.maintainerCount }),
    ...(metadata.lifecycleScripts === undefined
      ? {}
      : { lifecycleScripts: metadata.lifecycleScripts }),
  };
}

function summarizeStatus(
  packages: readonly ProjectPackageMetadata[],
  available: number,
): ProjectNpmResult['status'] {
  if (available === packages.length) return 'available';
  if (available > 0) return 'partial';
  return packages.every((metadata) => metadata.status === 'offline') ? 'offline' : 'unavailable';
}
