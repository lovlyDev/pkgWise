import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AnalysisReport, Finding } from '@lovlydev/pkgwise-core';
import { renderAnalysisReport } from '../../src/output/renderAnalysisReport.js';

const baseFinding: Finding = {
  ruleId: 'reliability/version-fragmentation',
  ruleVersion: '1.0.0',
  fingerprint: 'a'.repeat(64),
  subject: { type: 'package-group', key: 'shared', packageIds: [] },
  title: 'Multiple versions are installed',
  summary: 'Two versions are present.',
  severity: 'low',
  priority: 'worth-knowing',
  confidence: 1,
  category: 'reliability',
  context: { direct: false, scopes: [] },
  evidence: [{ id: 'b'.repeat(64), kind: 'confirmed-fact', summary: 'Graph fact.' }],
  dependencyPaths: [],
  pathsTruncated: false,
  recommendation: { summary: 'Review constraints.', actions: ['Inspect dependency paths.'] },
};

const report: AnalysisReport = {
  schemaVersion: '1',
  status: 'partial',
  generatedAt: '2026-08-15T00:00:00.000Z',
  tool: { name: 'pkgwise', version: 'test' },
  project: {
    rootName: 'fixture',
    manager: 'npm',
    mode: 'locked',
    workspaces: { availableCount: 0, selected: [] },
  },
  graph: {
    packageCount: 0,
    directDependencyCount: 0,
    transitiveDependencyCount: 0,
    edgeCount: 0,
    unresolvedDependencyCount: 0,
    maximumDepth: 0,
    duplicateVersionGroupCount: 0,
    cycleCount: 0,
    duplicateVersions: [],
    cycles: [],
    unresolvedDependencies: [],
    dependencyCounts: { runtime: 0, development: 0, peer: 0, optional: 0 },
  },
  packages: [],
  findings: [
    baseFinding,
    {
      ...baseFinding,
      ruleId: 'reliability/dependency-cycle',
      fingerprint: 'c'.repeat(64),
      severity: 'info',
      priority: 'informational',
      title: 'Cycle exists',
    },
  ],
  scores: {
    status: 'available',
    modelVersion: '1.0.0',
    overall: 78.5,
    confidence: 0.8,
    coverage: 0.7,
    categories: [
      {
        category: 'reliability',
        status: 'available',
        score: 78.5,
        confidence: 0.8,
        coverage: 0.7,
        contributions: [
          {
            ruleId: 'score/version-fragmentation',
            category: 'reliability',
            value: 78.5,
            weight: 1,
            confidence: 0.8,
            evidenceIds: [],
            explanation: 'Version spread and footprint were evaluated.',
          },
        ],
      },
    ],
  },
  coverage: { overall: 0 },
  advisories: [],
  packageMetadata: [],
  enrichment: {
    requested: false,
    osv: {
      status: 'not-requested',
      eligibleCoordinateCount: 0,
      evaluatedCoordinateCount: 0,
      unavailableCoordinateCount: 0,
    },
    npm: {
      status: 'not-requested',
      eligibleCoordinateCount: 0,
      evaluatedCoordinateCount: 0,
      unavailableCoordinateCount: 0,
    },
  },
  policy: { status: 'passed', configured: false, evaluatedFindingCount: 2, violations: [] },
  configuration: {
    source: 'defaults',
    enabledRules: ['reliability/version-fragmentation'],
    policyConfigured: false,
  },
  diagnostics: [],
};

describe('renderAnalysisReport', () => {
  it('hides informational findings by default', () => {
    const output = renderAnalysisReport(report);

    assert.match(output, /Findings: 2 total · 1 displayed/);
    assert.match(output, /Multiple versions are installed/);
    assert.match(output, /Scores: 78\.50\/100/);
    assert.match(output, /Metadata: npm Registry not-requested/);
    assert.match(output, /score\/version-fragmentation/);
    assert.doesNotMatch(output, /Cycle exists/);
  });

  it('supports severity, priority, and maximum finding presentation filters', () => {
    const output = renderAnalysisReport(report, {
      minimumSeverity: 'info',
      includePriorities: ['informational'],
      maximumFindings: 1,
    });

    assert.match(output, /Findings: 2 total · 1 displayed/);
    assert.match(output, /1 additional matching findings omitted/);
  });
});
