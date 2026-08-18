import type { PackageInspection } from '@lovlydev/pkgwise-core';

export function renderPackageInspection(inspection: PackageInspection): string {
  const lines = [
    `PkgWise inspect · ${inspection.selector}`,
    `${inspection.report.project.manager} · ${inspection.report.project.lockfile ?? 'no lockfile'}`,
    formatAvailableVersions(inspection.availableVersions),
  ];

  for (const item of inspection.packages) {
    lines.push(
      '',
      `${item.name}${item.version === undefined ? '' : `@${item.version}`}`,
      `  Locator ID: ${item.id}`,
      `  Direct: ${item.direct ? 'yes' : 'no'}${item.directScopes.length === 0 ? '' : ` · scopes ${item.directScopes.join(', ')}`}`,
      `  Minimum depth: ${item.minimumDepth}`,
      '  Dependency paths:',
    );
    if (item.dependencyPaths.length === 0) {
      lines.push('    Paths were not requested or are unavailable.');
    } else {
      for (const path of item.dependencyPaths) {
        lines.push(
          `    project -> ${path.packages
            .map((step) => `${step.name}${step.version === undefined ? '' : `@${step.version}`}`)
            .join(' -> ')}`,
        );
      }
    }
  }

  if (inspection.remote !== undefined) {
    lines.push(
      '',
      `npm Registry: ${inspection.remote.status} · cache ${inspection.remote.source.cache}`,
    );
    if (inspection.remote.status === 'available') {
      lines.push(
        `  Selected: ${inspection.remote.name}${inspection.remote.selectedVersion === undefined ? '' : `@${inspection.remote.selectedVersion}`}`,
        `  License: ${inspection.remote.license ?? 'unknown'}`,
        `  Node engines: ${inspection.remote.engines?.node ?? 'unknown'}`,
      );
      if (inspection.remote.description !== undefined) {
        lines.push(`  ${inspection.remote.description}`);
      }
      if (inspection.remote.deprecated !== undefined) {
        lines.push(`  DEPRECATED: ${inspection.remote.deprecated}`);
      }
    }
  }

  lines.push('', `Security advisories: ${inspection.advisories.length}`);
  for (const advisory of [...inspection.advisories].sort(compareAdvisories)) {
    lines.push(
      `  ${advisory.severity.toUpperCase()} ${advisory.id}${advisory.active ? '' : ' · withdrawn'}`,
      ...(advisory.summary === undefined ? [] : [`    ${advisory.summary}`]),
    );
  }

  lines.push('', `Related findings: ${inspection.findings.length}`);
  for (const finding of inspection.findings) {
    lines.push(
      `  ${finding.severity.toUpperCase()} [${finding.ruleId}] ${finding.title}`,
      `    ${finding.fingerprint}`,
    );
  }
  lines.push('', `Analysis status: ${inspection.report.status}`);
  for (const diagnostic of inspection.report.diagnostics) {
    lines.push(`${diagnostic.level.toUpperCase()}: ${diagnostic.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatAvailableVersions(versions: readonly string[]): string {
  if (versions.length === 0) return 'Available versions: unknown';
  if (versions.length <= 12) return `Available versions: ${versions.join(', ')}`;
  return `Available versions (${versions.length}): …, ${versions.slice(-10).join(', ')}`;
}

function compareAdvisories(
  left: PackageInspection['advisories'][number],
  right: PackageInspection['advisories'][number],
): number {
  const severity = ['critical', 'high', 'medium', 'low', 'info', 'unknown'];
  return (
    severity.indexOf(left.severity) - severity.indexOf(right.severity) ||
    left.id.localeCompare(right.id)
  );
}
