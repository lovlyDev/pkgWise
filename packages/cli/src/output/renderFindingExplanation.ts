import type { FindingExplanation } from '@pkgwise/core';

export function renderFindingExplanation(explanation: FindingExplanation): string {
  const finding = explanation.finding;
  const lines = [
    `PkgWise explanation · ${finding.fingerprint}`,
    '',
    `${finding.severity.toUpperCase()} [${finding.ruleId}@${finding.ruleVersion}]`,
    finding.title,
    '',
    finding.summary,
    `Evidence class: ${finding.evidence[0]?.kind ?? 'unknown'} · confidence ${formatConfidence(finding.confidence)}`,
  ];

  for (const evidence of finding.evidence) {
    lines.push(`  Evidence: ${evidence.summary}`);
  }

  lines.push('', 'Dependency paths:');
  if (finding.dependencyPaths.length === 0) {
    lines.push('  No resolved path is available.');
  } else {
    for (const path of finding.dependencyPaths) {
      const packages = path.packages.map(
        (item) => `${item.name}${item.version === undefined ? '' : `@${item.version}`}`,
      );
      lines.push(`  project${packages.length === 0 ? '' : ` -> ${packages.join(' -> ')}`}`);
    }
    if (finding.pathsTruncated) lines.push('  Additional paths were truncated.');
  }

  lines.push('', `Recommendation: ${finding.recommendation.summary}`);
  for (const action of finding.recommendation.actions) lines.push(`  - ${action}`);
  lines.push('', `Analysis status: ${explanation.report.status}`);
  for (const diagnostic of explanation.report.diagnostics) {
    lines.push(`${diagnostic.level.toUpperCase()}: ${diagnostic.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
