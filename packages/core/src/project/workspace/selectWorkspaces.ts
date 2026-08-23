import { PkgWiseError } from '../../errors/PkgWiseError.js';
import type { WorkspacePackage } from './WorkspacePackage.js';

export function selectWorkspaces(
  available: readonly WorkspacePackage[],
  selectors: readonly string[] | undefined,
): WorkspacePackage[] {
  if (selectors === undefined || selectors.length === 0) return [];
  if (selectors.includes('*')) return [...available];
  const selected = new Map<string, WorkspacePackage>();
  for (const rawSelector of [...new Set(selectors)]) {
    const selector = rawSelector.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
    const matches = available.filter(
      (workspace) => workspace.name === selector || workspace.relativePath === selector,
    );
    if (matches.length === 0) {
      throw new PkgWiseError({
        code: 'PW_WORKSPACE_NOT_FOUND',
        userMessage: `Workspace ${JSON.stringify(rawSelector)} was not found. Available workspaces: ${available.map((workspace) => workspace.name ?? workspace.relativePath).join(', ') || 'none'}.`,
        recoverable: false,
      });
    }
    if (matches.length > 1) {
      throw new PkgWiseError({
        code: 'PW_WORKSPACE_SELECTOR_AMBIGUOUS',
        userMessage: `Workspace selector ${JSON.stringify(rawSelector)} matches multiple package paths. Use a relative workspace path.`,
        recoverable: false,
      });
    }
    const match = matches[0] as WorkspacePackage;
    selected.set(match.relativePath, match);
  }
  return [...selected.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}
