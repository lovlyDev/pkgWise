import type {
  AnalysisReport,
  Finding,
  FindingPriority,
  FindingSeverity,
} from '@lovlydev/pkgwise-core';

export interface RenderAnalysisReportOptions {
  readonly minimumSeverity?: FindingSeverity;
  readonly includePriorities?: readonly FindingPriority[];
  readonly maximumFindings?: number;
}

export function renderAnalysisReport(
  report: AnalysisReport,
  options: RenderAnalysisReportOptions = {},
): string {
  const lockfile = report.project.lockfile === undefined ? 'no lockfile' : report.project.lockfile;
  const lines = [
    `PkgWise ${report.tool.version} · ${report.project.manager} · ${lockfile}`,
    '',
    `${report.project.name ?? report.project.rootName}${
      report.project.version === undefined ? '' : `@${report.project.version}`
    }`,
    `Direct dependencies: ${report.graph.directDependencyCount}`,
    `Resolved packages: ${report.graph.packageCount} (${report.graph.transitiveDependencyCount} transitive)`,
    `Graph: ${report.graph.edgeCount} edges · depth ${report.graph.maximumDepth} · unresolved ${report.graph.unresolvedDependencyCount}`,
    `Topology: ${report.graph.duplicateVersionGroupCount} duplicate-version groups · ${report.graph.cycleCount} cycles`,
    `  runtime ${report.graph.dependencyCounts.runtime} · development ${report.graph.dependencyCounts.development} · peer ${report.graph.dependencyCounts.peer} · optional ${report.graph.dependencyCounts.optional}`,
    '',
    `Analysis status: ${report.status}`,
    ...renderScoreLines(report),
    `Security: OSV ${report.enrichment.osv.status} · ${report.enrichment.osv.evaluatedCoordinateCount}/${report.enrichment.osv.eligibleCoordinateCount} coordinates · ${report.advisories.length} advisories${report.coverage.security === undefined ? '' : ` · ${Math.round(report.coverage.security * 100)}% coverage`}`,
    `Metadata: npm Registry ${report.enrichment.npm.status} · ${report.enrichment.npm.evaluatedCoordinateCount}/${report.enrichment.npm.eligibleCoordinateCount} coordinates`,
    `Configuration: ${report.configuration.source}${report.configuration.relativePath === undefined ? '' : ` (${report.configuration.relativePath})`} · ${report.configuration.enabledRules.length} rules`,
    `Policy: ${report.policy.status}${report.policy.configured ? ` · ${report.policy.violations.length} violations` : ' · not configured'}`,
  ];

  for (const violation of report.policy.violations) {
    lines.push(`  POLICY VIOLATION: ${violation.message}`);
  }

  const filteredFindings = filterFindings(report.findings, options);
  const displayedFindings = filteredFindings.slice(0, options.maximumFindings);
  lines.push(
    '',
    `Findings: ${report.findings.length} total · ${displayedFindings.length} displayed`,
  );
  for (const finding of displayedFindings) {
    lines.push(
      '',
      `${finding.severity.toUpperCase()} [${finding.ruleId}] ${finding.title}`,
      `  ${finding.summary}`,
      `  Recommendation: ${finding.recommendation.summary}`,
      `  Fingerprint: ${finding.fingerprint}`,
    );
  }
  if (displayedFindings.length < filteredFindings.length) {
    lines.push(
      `... ${filteredFindings.length - displayedFindings.length} additional matching findings omitted.`,
    );
  }

  for (const diagnostic of report.diagnostics) {
    lines.push(`${diagnostic.level.toUpperCase()}: ${diagnostic.message}`);
  }

  return `${lines.join('\n')}\n`;
}

function renderScoreLines(report: AnalysisReport): string[] {
  const headline =
    report.scores.overall === undefined
      ? `Scores: insufficient data · coverage ${formatPercent(report.scores.coverage)} · confidence ${formatPercent(report.scores.confidence)}`
      : `Scores: ${formatScore(report.scores.overall)}/100${report.scores.label === undefined ? ' · label withheld' : ` · ${report.scores.label.replaceAll('-', ' ')}`} · coverage ${formatPercent(report.scores.coverage)} · confidence ${formatPercent(report.scores.confidence)} · model ${report.scores.modelVersion}`;
  const lines = [headline];
  for (const category of report.scores.categories) {
    lines.push(
      `  ${category.category}: ${category.score === undefined ? category.status : `${formatScore(category.score)}/100`} · coverage ${formatPercent(category.coverage)} · confidence ${formatPercent(category.confidence)}`,
    );
    for (const contribution of category.contributions) {
      lines.push(
        `    ${contribution.ruleId}: ${formatScore(contribution.value)}/100 — ${contribution.explanation}`,
      );
    }
  }
  return lines;
}

function formatScore(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function filterFindings(
  findings: readonly Finding[],
  options: RenderAnalysisReportOptions,
): Finding[] {
  const severityOrder: readonly FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const maximumSeverityIndex = severityOrder.indexOf(options.minimumSeverity ?? 'low');
  const includedPriorities = new Set<FindingPriority>([
    'action-required',
    'review',
    'worth-knowing',
    ...(options.includePriorities ?? []),
  ]);
  return findings.filter(
    (finding) =>
      severityOrder.indexOf(finding.severity) <= maximumSeverityIndex &&
      includedPriorities.has(finding.priority),
  );
}
