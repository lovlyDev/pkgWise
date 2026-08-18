import type { DependencyGraphSummary, LockfileGraphSnapshot } from './LockfileGraphSnapshot.js';
import { analyzeDependencyGraph } from './analyzeDependencyGraph.js';

export function summarizeDependencyGraph(
  graph: LockfileGraphSnapshot,
  includeDevelopment = true,
): DependencyGraphSummary {
  return analyzeDependencyGraph(graph, includeDevelopment).summary;
}
