import type { AnalysisReport, Finding, FindingSeverity } from '@lovlydev/pkgwise-core';

export function renderSarifReport(report: AnalysisReport): string {
  const ruleIds = [...new Set(report.findings.map((finding) => finding.ruleId))].sort();
  const ruleIndexes = new Map(ruleIds.map((id, index) => [id, index] as const));
  const artifactUri = report.project.lockfile ?? 'package.json';
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'PkgWise',
            version: report.tool.version,
            ...(isSemanticVersion(report.tool.version)
              ? { semanticVersion: report.tool.version }
              : {}),
            informationUri: 'docs/spec/README.md',
            rules: ruleIds.map((ruleId) => createRuleDescriptor(ruleId, report.findings)),
          },
        },
        artifacts: [{ location: { uri: artifactUri } }],
        invocations: [
          {
            executionSuccessful: true,
            toolExecutionNotifications: report.diagnostics.map((diagnostic) => ({
              descriptor: { id: diagnostic.code },
              level: diagnostic.level === 'warning' ? 'warning' : 'note',
              message: { text: diagnostic.message },
            })),
            properties: {
              analysisStatus: report.status,
              coverage: report.coverage.overall,
              overallScore: report.scores.overall,
              scoreConfidence: report.scores.confidence,
              scoreCoverage: report.scores.coverage,
              policyStatus: report.policy.status,
            },
          },
        ],
        results: report.findings.map((finding) =>
          createResult(finding, ruleIndexes.get(finding.ruleId) as number, artifactUri),
        ),
        properties: {
          schemaVersion: report.schemaVersion,
          packageManager: report.project.manager,
          packageCount: report.graph.packageCount,
          scoreModelVersion: report.scores.modelVersion,
          categoryScores: Object.fromEntries(
            report.scores.categories.map((category) => [
              category.category,
              {
                status: category.status,
                score: category.score,
                coverage: category.coverage,
                confidence: category.confidence,
              },
            ]),
          ),
        },
      },
    ],
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function createRuleDescriptor(ruleId: string, findings: readonly Finding[]): object {
  const representative = findings.find((finding) => finding.ruleId === ruleId) as Finding;
  return {
    id: ruleId,
    name: ruleId.replaceAll(/[^a-zA-Z0-9]+/g, '_'),
    shortDescription: { text: ruleTitle(ruleId) },
    fullDescription: { text: ruleDescription(ruleId) },
    help: {
      text: representative.recommendation.summary,
      markdown: representative.recommendation.summary,
    },
    defaultConfiguration: { level: defaultRuleLevel(ruleId) },
    properties: {
      ruleVersion: representative.ruleVersion,
      category: representative.category,
      evidenceKind: representative.evidence[0]?.kind ?? 'unknown',
    },
  };
}

function createResult(finding: Finding, ruleIndex: number, artifactUri: string): object {
  const resolvedPaths = finding.dependencyPaths.filter((path) => path.packages.length > 0);
  return {
    ruleId: finding.ruleId,
    ruleIndex,
    level: sarifLevel(finding.severity),
    message: {
      text: `${finding.title}: ${finding.summary} Recommendation: ${finding.recommendation.summary}`,
    },
    partialFingerprints: {
      'pkgwiseFindingFingerprint/v1': finding.fingerprint,
    },
    locations: [{ physicalLocation: { artifactLocation: { uri: artifactUri } } }],
    ...(resolvedPaths.length === 0
      ? {}
      : {
          codeFlows: resolvedPaths.map((path) => ({
            threadFlows: [
              {
                locations: path.packages.map((item) => ({
                  location: {
                    logicalLocations: [
                      {
                        name: item.name,
                        fullyQualifiedName: `${item.name}${item.version === undefined ? '' : `@${item.version}`}`,
                        kind: 'package',
                      },
                    ],
                  },
                })),
              },
            ],
          })),
        }),
    properties: {
      priority: finding.priority,
      confidence: finding.confidence,
      category: finding.category,
      evidenceKind: finding.evidence[0]?.kind ?? 'unknown',
      packageIds: finding.subject.packageIds,
      pathsTruncated: finding.pathsTruncated,
    },
  };
}

function defaultRuleLevel(ruleId: string): 'warning' | 'note' {
  return ruleId === 'compatibility/unresolved-dependency' ? 'warning' : 'note';
}

function isSemanticVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    value,
  );
}

function sarifLevel(severity: FindingSeverity): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

function ruleTitle(ruleId: string): string {
  if (ruleId === 'reliability/version-fragmentation') return 'Multiple package versions';
  if (ruleId === 'reliability/dependency-cycle') return 'Dependency cycle';
  if (ruleId === 'compatibility/unresolved-dependency') return 'Unresolved dependency';
  return ruleId;
}

function ruleDescription(ruleId: string): string {
  if (ruleId === 'reliability/version-fragmentation') {
    return 'Reports multiple exact versions of the same package in the reachable dependency graph.';
  }
  if (ruleId === 'reliability/dependency-cycle') {
    return 'Reports strongly connected components in the resolved dependency graph.';
  }
  if (ruleId === 'compatibility/unresolved-dependency') {
    return 'Reports required dependency relations without a matching lockfile locator.';
  }
  return 'PkgWise dependency analysis rule.';
}
