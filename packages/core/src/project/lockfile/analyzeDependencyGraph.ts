import { createHash } from 'node:crypto';
import type {
  DependencyGraphSummary,
  DependencyScope,
  LockfileGraphSnapshot,
  LockfilePackageRecord,
} from './LockfileGraphSnapshot.js';
import type {
  DependencyCycleSummary,
  DependencyPath,
  DuplicateVersionGroup,
  PackageReport,
  UnresolvedDependencyRelation,
} from '../../public/ClientResults.js';

export interface DependencyGraphAnalysis {
  readonly summary: DependencyGraphSummary;
  readonly packages: readonly PackageReport[];
  readonly duplicateVersions: readonly DuplicateVersionGroup[];
  readonly cycles: readonly DependencyCycleSummary[];
  readonly unresolvedDependencies: readonly UnresolvedDependencyRelation[];
  readonly pathsByPackageId: ReadonlyMap<string, DependencyPath>;
}

export function analyzeDependencyGraph(
  graph: LockfileGraphSnapshot,
  includeDevelopment = true,
): DependencyGraphAnalysis {
  const records = new Map(graph.packages.map((record) => [record.id, record]));
  const depths = new Map<string, number>();
  const directScopes = new Map<string, Set<DependencyScope>>();
  const predecessors = new Map<string, string | undefined>();
  const adjacency = new Map<string, Set<string>>();
  const queue: string[] = [];
  let edgeCount = 0;
  let unresolvedDependencyCount = 0;
  const unresolved: Array<{
    readonly fromId?: string;
    readonly dependencyName: string;
    readonly requested: string;
    readonly scope: DependencyScope;
    readonly optional: boolean;
    readonly peer: boolean;
  }> = [];

  for (const reference of graph.importer.dependencies) {
    if (!includeDevelopment && reference.scope === 'development') continue;
    edgeCount += 1;
    if (reference.targetId === undefined || !records.has(reference.targetId)) {
      unresolvedDependencyCount += 1;
      unresolved.push({
        dependencyName: reference.name,
        requested: reference.requested,
        scope: reference.scope,
        optional: reference.optional,
        peer: reference.peer,
      });
      continue;
    }
    const scopes = directScopes.get(reference.targetId) ?? new Set<DependencyScope>();
    scopes.add(reference.scope);
    directScopes.set(reference.targetId, scopes);
    if (!depths.has(reference.targetId)) {
      depths.set(reference.targetId, 1);
      predecessors.set(reference.targetId, undefined);
      queue.push(reference.targetId);
    }
  }

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === undefined) continue;
    const record = records.get(id);
    const depth = depths.get(id);
    if (record === undefined || depth === undefined) continue;

    const outgoing = adjacency.get(id) ?? new Set<string>();
    adjacency.set(id, outgoing);
    for (const reference of record.dependencies) {
      edgeCount += 1;
      if (reference.targetId === undefined || !records.has(reference.targetId)) {
        unresolvedDependencyCount += 1;
        unresolved.push({
          fromId: id,
          dependencyName: reference.name,
          requested: reference.requested,
          scope: reference.scope,
          optional: reference.optional,
          peer: reference.peer,
        });
        continue;
      }
      outgoing.add(reference.targetId);
      if (!depths.has(reference.targetId)) {
        depths.set(reference.targetId, depth + 1);
        predecessors.set(reference.targetId, id);
        queue.push(reference.targetId);
      }
    }
  }

  const reachableIds = [...depths.keys()].sort();
  const publicIds = new Map(
    reachableIds.map((id) => [id, stablePackageId(graph.manager, id)] as const),
  );
  const packages = reachableIds.map((id) =>
    createPackageReport(
      id,
      records.get(id),
      records,
      depths,
      directScopes,
      predecessors,
      publicIds,
    ),
  );
  const pathsByPackageId = new Map<string, DependencyPath>();
  for (const item of packages) {
    const path = item.dependencyPaths[0];
    if (path !== undefined) pathsByPackageId.set(item.id, path);
  }
  const duplicateVersions = findDuplicateVersions(packages);
  const cycles = findCycles(reachableIds, adjacency).map((component) => ({
    packageIds: component.map((id) => publicIds.get(id) as string).sort(),
  }));
  const unresolvedDependencies = unresolved
    .map((relation) => ({
      ...(relation.fromId === undefined
        ? {}
        : { fromPackageId: publicIds.get(relation.fromId) as string }),
      dependencyName: relation.dependencyName,
      requested: relation.requested,
      scope: relation.scope,
      optional: relation.optional,
      peer: relation.peer,
    }))
    .sort(compareUnresolvedRelations);

  return {
    summary: {
      packageCount: reachableIds.length,
      edgeCount,
      unresolvedDependencyCount,
      maximumDepth: Math.max(0, ...depths.values()),
    },
    packages,
    duplicateVersions,
    cycles,
    unresolvedDependencies,
    pathsByPackageId,
  };
}

function compareUnresolvedRelations(
  left: UnresolvedDependencyRelation,
  right: UnresolvedDependencyRelation,
): number {
  return `${left.fromPackageId ?? ''}\0${left.dependencyName}\0${left.scope}\0${left.requested}`.localeCompare(
    `${right.fromPackageId ?? ''}\0${right.dependencyName}\0${right.scope}\0${right.requested}`,
  );
}

function createPackageReport(
  id: string,
  record: LockfilePackageRecord | undefined,
  records: ReadonlyMap<string, LockfilePackageRecord>,
  depths: ReadonlyMap<string, number>,
  directScopes: ReadonlyMap<string, ReadonlySet<DependencyScope>>,
  predecessors: ReadonlyMap<string, string | undefined>,
  publicIds: ReadonlyMap<string, string>,
): PackageReport {
  if (record === undefined) throw new Error(`Missing reachable package record ${id}.`);
  const scopes = [...(directScopes.get(id) ?? [])].sort(compareScopes);
  return {
    id: publicIds.get(id) as string,
    name: record.name,
    ...(record.version === undefined ? {} : { version: stripPeerContext(record.version) }),
    direct: scopes.length > 0,
    directScopes: scopes,
    minimumDepth: depths.get(id) as number,
    dependencyPaths: [createDependencyPath(id, records, predecessors, publicIds)],
    pathsTruncated: false,
    resolvedDependencyCount: record.dependencies.filter(
      (dependency) => dependency.targetId !== undefined && records.has(dependency.targetId),
    ).length,
  };
}

function createDependencyPath(
  id: string,
  records: ReadonlyMap<string, LockfilePackageRecord>,
  predecessors: ReadonlyMap<string, string | undefined>,
  publicIds: ReadonlyMap<string, string>,
): DependencyPath {
  const internalIds: string[] = [];
  let cursor: string | undefined = id;
  while (cursor !== undefined) {
    internalIds.push(cursor);
    cursor = predecessors.get(cursor);
  }
  internalIds.reverse();
  return {
    packages: internalIds.map((internalId) => {
      const item = records.get(internalId);
      if (item === undefined) throw new Error(`Missing package record ${internalId}.`);
      return {
        id: publicIds.get(internalId) as string,
        name: item.name,
        ...(item.version === undefined ? {} : { version: stripPeerContext(item.version) }),
      };
    }),
  };
}

function findDuplicateVersions(packages: readonly PackageReport[]): DuplicateVersionGroup[] {
  const groups = new Map<string, { versions: Set<string>; count: number }>();
  for (const item of packages) {
    if (item.version === undefined) continue;
    const group = groups.get(item.name) ?? { versions: new Set<string>(), count: 0 };
    group.versions.add(item.version);
    group.count += 1;
    groups.set(item.name, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.versions.size > 1)
    .map(([name, group]) => ({
      name,
      versions: [...group.versions].sort(compareVersions),
      packageCount: group.count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findCycles(
  nodes: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const reachable = new Set(nodes);

  const visit = (node: string): void => {
    indexes.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    const neighbors = [...(adjacency.get(node) ?? [])]
      .filter((candidate) => reachable.has(candidate))
      .sort();
    for (const neighbor of neighbors) {
      if (!indexes.has(neighbor)) {
        visit(neighbor);
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) as number, lowLinks.get(neighbor) as number),
        );
      } else if (onStack.has(neighbor)) {
        lowLinks.set(node, Math.min(lowLinks.get(node) as number, indexes.get(neighbor) as number));
      }
    }

    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop() as string;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    component.sort();
    const selfLoop = component.length === 1 && adjacency.get(node)?.has(node) === true;
    if (component.length > 1 || selfLoop) components.push(component);
  };

  for (const node of nodes) {
    if (!indexes.has(node)) visit(node);
  }
  return components.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
}

export function stablePackageId(manager: string, locator: string): string {
  return createHash('sha256').update(`${manager}\0${locator}`).digest('hex');
}

function stripPeerContext(version: string): string {
  const parenthesis = version.indexOf('(');
  const underscore = version.indexOf('_');
  const boundary = [parenthesis, underscore].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return boundary === undefined ? version : version.slice(0, boundary);
}

function compareScopes(left: DependencyScope, right: DependencyScope): number {
  const order: readonly DependencyScope[] = ['runtime', 'development', 'peer', 'optional'];
  return order.indexOf(left) - order.indexOf(right);
}

function compareVersions(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true });
}
