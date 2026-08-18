import type { PackageComparison } from '@lovlydev/pkgwise-core';

export function renderPackageComparison(comparison: PackageComparison): string {
  const lines = [
    `PkgWise compare · ${comparison.selectors[0]} ↔ ${comparison.selectors[1]}`,
    `${comparison.report.project.manager} · ${comparison.report.project.lockfile ?? 'no lockfile'}`,
  ];

  comparison.candidates.forEach((candidate, index) => {
    lines.push('', `Candidate ${index === 0 ? 'A' : 'B'}: ${candidate.selector}`);
    for (const item of candidate.packages) {
      lines.push(
        `  ${item.name}${item.version === undefined ? '' : `@${item.version}`}`,
        `    direct ${item.direct ? 'yes' : 'no'} · depth ${item.minimumDepth} · immediate dependencies ${item.resolvedDependencyCount}`,
        `    scopes ${item.directScopes.join(', ') || 'none'} · locator ${item.id}`,
      );
    }
    lines.push(`  Related findings: ${candidate.findings.length}`);
  });

  lines.push('', 'Metric comparison:');
  for (const metric of comparison.metrics) {
    lines.push(
      `  ${metric.status === 'equal' ? '=' : '≠'} ${metric.name}: ${formatValue(metric.candidateA)} | ${formatValue(metric.candidateB)}`,
      `    ${metric.summary}`,
    );
  }

  lines.push('', `Conclusion: ${comparison.conclusion.summary}`);
  if (comparison.recommendation !== undefined) {
    lines.push(`Recommendation: ${comparison.recommendation.summary}`);
    for (const action of comparison.recommendation.actions) lines.push(`  - ${action}`);
  }
  if (comparison.context.unavailableData.length > 0) {
    lines.push('', 'Unavailable data:');
    for (const item of comparison.context.unavailableData) lines.push(`  - ${item}`);
  }
  lines.push('', `Analysis status: ${comparison.report.status}`);
  for (const diagnostic of comparison.report.diagnostics) {
    lines.push(`${diagnostic.level.toUpperCase()}: ${diagnostic.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatValue(value: string | number | boolean | readonly string[] | undefined): string {
  if (value === undefined) return 'unavailable';
  if (Array.isArray(value)) return value.join(', ') || 'none';
  return String(value);
}
