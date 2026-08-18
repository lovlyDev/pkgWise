import type { AnalysisReport, Finding } from '@pkgwise/core';

export function renderMarkdownReport(report: AnalysisReport): string {
  const projectName = report.project.name ?? report.project.rootName;
  const lines = [
    '# PkgWise dependency report',
    '',
    `Generated: ${escapeMarkdown(report.generatedAt)}`,
    '',
    '## Project',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Name | ${escapeMarkdown(projectName)} |`,
    `| Version | ${escapeMarkdown(report.project.version ?? 'unknown')} |`,
    `| Package manager | ${escapeMarkdown(report.project.manager)} |`,
    `| Lockfile | ${escapeMarkdown(report.project.lockfile ?? 'none')} |`,
    `| Analysis status | ${escapeMarkdown(report.status)} |`,
    `| Configuration | ${escapeMarkdown(report.configuration.source)} |`,
    `| Policy | ${escapeMarkdown(report.policy.status)} |`,
    '',
    '## Dependency graph',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Resolved packages | ${report.graph.packageCount} |`,
    `| Direct dependencies | ${report.graph.directDependencyCount} |`,
    `| Transitive dependencies | ${report.graph.transitiveDependencyCount} |`,
    `| Edges | ${report.graph.edgeCount} |`,
    `| Maximum depth | ${report.graph.maximumDepth} |`,
    `| Unresolved relations | ${report.graph.unresolvedDependencyCount} |`,
    `| Duplicate-version groups | ${report.graph.duplicateVersionGroupCount} |`,
    `| Cycles | ${report.graph.cycleCount} |`,
    `| Analysis coverage | ${Math.round(report.coverage.overall * 100)}% |`,
    '',
    '## Security enrichment',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| OSV status | ${escapeMarkdown(report.enrichment.osv.status)} |`,
    `| Exact coordinates eligible | ${report.enrichment.osv.eligibleCoordinateCount} |`,
    `| Exact coordinates evaluated | ${report.enrichment.osv.evaluatedCoordinateCount} |`,
    `| Unavailable coordinates | ${report.enrichment.osv.unavailableCoordinateCount} |`,
    `| Security coverage | ${report.coverage.security === undefined ? 'not requested' : `${Math.round(report.coverage.security * 100)}%`} |`,
    `| Advisory records | ${report.advisories.length} |`,
    '',
    `## Policy (${report.policy.violations.length} violations)`,
    '',
    report.policy.configured
      ? `Policy evaluation: **${escapeMarkdown(report.policy.status)}**.`
      : 'No policy is configured; the default policy passes.',
  ];

  if (report.policy.violations.length > 0) {
    lines.push('', '| Violation | Findings |', '| --- | ---: |');
    for (const violation of report.policy.violations) {
      lines.push(
        `| ${escapeMarkdown(violation.message)} | ${violation.findingFingerprints.length} |`,
      );
    }
  }

  lines.push('', `## Findings (${report.findings.length})`);

  if (report.findings.length === 0) {
    lines.push('', 'No findings were produced by the enabled rules.');
  } else {
    for (const finding of report.findings) appendFinding(lines, finding);
  }

  lines.push('', `## Diagnostics (${report.diagnostics.length})`);
  if (report.diagnostics.length === 0) {
    lines.push('', 'No analysis diagnostics.');
  } else {
    lines.push('', '| Level | Code | Message |', '| --- | --- | --- |');
    for (const diagnostic of report.diagnostics) {
      lines.push(
        `| ${escapeMarkdown(diagnostic.level)} | ${escapeMarkdown(diagnostic.code)} | ${escapeMarkdown(diagnostic.message)} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderGenericMarkdown(value: unknown, title = 'PkgWise result'): string {
  const json = JSON.stringify(value, null, 2) ?? 'null';
  return `# ${escapeMarkdown(title)}\n\n${json
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}\n`;
}

function appendFinding(lines: string[], finding: Finding): void {
  lines.push(
    '',
    `### ${escapeMarkdown(finding.severity.toUpperCase())}: ${escapeMarkdown(finding.title)}`,
    '',
    `- Rule: ${escapeMarkdown(`${finding.ruleId}@${finding.ruleVersion}`)}`,
    `- Priority: ${escapeMarkdown(finding.priority)}`,
    `- Confidence: ${Math.round(finding.confidence * 100)}%`,
    `- Evidence class: ${escapeMarkdown(finding.evidence[0]?.kind ?? 'unknown')}`,
    `- Fingerprint: ${escapeMarkdown(finding.fingerprint)}`,
    '',
    escapeMarkdown(finding.summary),
    '',
    '**Evidence**',
    '',
  );
  for (const evidence of finding.evidence) lines.push(`- ${escapeMarkdown(evidence.summary)}`);
  lines.push('', '**Dependency paths**', '');
  if (finding.dependencyPaths.length === 0) {
    lines.push('- No resolved path is available.');
  } else {
    for (const path of finding.dependencyPaths) {
      const packages = path.packages.map(
        (item) => `${item.name}${item.version === undefined ? '' : `@${item.version}`}`,
      );
      lines.push(
        `- ${escapeMarkdown(`project${packages.length === 0 ? '' : ` -> ${packages.join(' -> ')}`}`)}`,
      );
    }
    if (finding.pathsTruncated) lines.push('- Additional paths were truncated.');
  }
  lines.push('', `**Recommendation:** ${escapeMarkdown(finding.recommendation.summary)}`, '');
  for (const action of finding.recommendation.actions) lines.push(`- ${escapeMarkdown(action)}`);
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replaceAll('`', '&#96;');
}
