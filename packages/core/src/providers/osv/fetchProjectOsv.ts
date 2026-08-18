import type { ProjectSecurityAdvisory } from '../../public/ClientResults.js';
import {
  fetchOsvAdvisories,
  type OsvRequest,
  type OsvResult,
  type OsvRuntime,
} from './fetchOsvAdvisories.js';

export interface PackageCoordinate {
  readonly name: string;
  readonly version: string;
}

export interface ProjectOsvResult {
  readonly status: 'available' | 'partial' | 'offline' | 'unavailable';
  readonly coordinates: readonly (PackageCoordinate & { readonly result: OsvResult })[];
  readonly advisories: readonly ProjectSecurityAdvisory[];
  readonly eligibleCoordinateCount: number;
  readonly evaluatedCoordinateCount: number;
  readonly unavailableCoordinateCount: number;
}

export async function fetchProjectOsv(
  coordinates: readonly PackageCoordinate[],
  request: Omit<OsvRequest, 'name' | 'version'> & { readonly concurrency: number },
  runtime: OsvRuntime,
): Promise<ProjectOsvResult> {
  const unique = [
    ...new Map(
      coordinates.map((coordinate) => [`${coordinate.name}\0${coordinate.version}`, coordinate]),
    ).values(),
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
  const results: Array<PackageCoordinate & { result: OsvResult }> = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < unique.length) {
      const coordinate = unique[next++];
      if (coordinate === undefined) return;
      const result = await fetchOsvAdvisories({ ...request, ...coordinate }, runtime);
      results.push({ ...coordinate, result });
    }
  };
  const workerCount = Math.min(unique.length, Math.max(1, Math.min(4, request.concurrency)));
  await Promise.all(Array.from({ length: workerCount }, worker));
  results.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
  );
  const evaluatedCoordinateCount = results.filter(
    ({ result }) => result.status === 'available',
  ).length;
  const unavailableCoordinateCount = unique.length - evaluatedCoordinateCount;
  const status = summarizeStatus(results, evaluatedCoordinateCount);
  return {
    status,
    coordinates: results,
    advisories: results.flatMap(({ name, version, result }) =>
      result.advisories.map((advisory) => ({
        packageName: name,
        packageVersion: version,
        advisory,
      })),
    ),
    eligibleCoordinateCount: unique.length,
    evaluatedCoordinateCount,
    unavailableCoordinateCount,
  };
}

function summarizeStatus(
  results: readonly { readonly result: OsvResult }[],
  available: number,
): ProjectOsvResult['status'] {
  if (available === results.length) return 'available';
  if (available > 0) return 'partial';
  return results.every(({ result }) => result.status === 'offline') ? 'offline' : 'unavailable';
}
