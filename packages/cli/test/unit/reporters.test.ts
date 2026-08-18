import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AnalysisReport } from '@lovlydev/pkgwise-core';
import { renderMarkdownReport } from '../../src/output/renderMarkdownReport.js';
import { renderSarifReport } from '../../src/output/renderSarifReport.js';

const packageId = 'a'.repeat(64);
const fingerprint = 'b'.repeat(64);
const report: AnalysisReport = {
  schemaVersion: '1',
  status: 'partial',
  generatedAt: '2026-08-15T00:00:00.000Z',
  tool: { name: 'pkgwise', version: '0.1.0-test.1' },
  project: {
    name: 'unsafe<script>|`project`',
    rootName: 'fixture',
    manager: 'npm',
    lockfile: 'package-lock.json',
    mode: 'locked',
  },
  graph: {
    packageCount: 1,
    directDependencyCount: 1,
    transitiveDependencyCount: 0,
    edgeCount: 1,
    unresolvedDependencyCount: 0,
    maximumDepth: 1,
    duplicateVersionGroupCount: 0,
    cycleCount: 0,
    duplicateVersions: [],
    cycles: [],
    unresolvedDependencies: [],
    lockfileVersion: '3',
    fidelity: 'full',
    dependencyCounts: { runtime: 1, development: 0, peer: 0, optional: 0 },
  },
  packages: [
    {
      id: packageId,
      name: 'a|b',
      version: '1.0.0',
      direct: true,
      directScopes: ['runtime'],
      minimumDepth: 1,
      dependencyPaths: [{ packages: [{ id: packageId, name: 'a|b', version: '1.0.0' }] }],
      pathsTruncated: false,
      resolvedDependencyCount: 0,
    },
  ],
  findings: [
    {
      ruleId: 'compatibility/unresolved-dependency',
      ruleVersion: '1.0.0',
      fingerprint,
      subject: { type: 'dependency-relation', key: 'a|b', packageIds: [packageId] },
      title: 'Unsafe <title> | `code`',
      summary: 'A dependency relation is unresolved.',
      severity: 'medium',
      priority: 'review',
      confidence: 1,
      category: 'compatibility',
      context: { direct: true, scopes: ['runtime'] },
      evidence: [{ id: 'c'.repeat(64), kind: 'confirmed-fact', summary: 'Graph evidence.' }],
      dependencyPaths: [{ packages: [{ id: packageId, name: 'a|b', version: '1.0.0' }] }],
      pathsTruncated: false,
      recommendation: { summary: 'Review constraints.', actions: ['Regenerate the lockfile.'] },
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
  policy: { status: 'passed', configured: false, evaluatedFindingCount: 1, violations: [] },
  configuration: {
    source: 'defaults',
    enabledRules: ['compatibility/unresolved-dependency'],
    policyConfigured: false,
  },
  diagnostics: [
    { code: 'PW_TEST_DIAGNOSTIC', level: 'warning', message: 'Partial provider coverage.' },
  ],
};

describe('analysis reporters', () => {
  it('renders escaped deterministic Markdown without raw HTML', () => {
    const markdown = renderMarkdownReport(report);

    assert.match(markdown, /^# PkgWise dependency report/);
    assert.match(markdown, /npm Registry status/);
    assert.doesNotMatch(markdown, /<script>/);
    assert.match(markdown, /unsafe&lt;script&gt;\\\|&#96;project&#96;/);
    assert.match(markdown, /Unsafe &lt;title&gt; \\| &#96;code&#96;/);
    assert.match(markdown, /project -&gt; a\\\|b@1\.0\.0/);
    assert.match(markdown, /78\.50\/100/);
    assert.match(markdown, /Version spread and footprint were evaluated/);
  });

  it('renders SARIF 2.1.0 rules, results, fingerprints, paths, and diagnostics', () => {
    const sarif = JSON.parse(renderSarifReport(report)) as {
      $schema: string;
      version: string;
      runs: Array<{
        tool: { driver: { rules: unknown[] } };
        invocations: Array<{ toolExecutionNotifications: unknown[] }>;
        results: Array<{
          ruleId: string;
          ruleIndex: number;
          level: string;
          partialFingerprints: Record<string, string>;
          codeFlows: unknown[];
          locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
        }>;
      }>;
    };

    assert.equal(sarif.version, '2.1.0');
    assert.match(sarif.$schema, /sarif-2\.1\.0\.json$/);
    assert.equal(sarif.runs.length, 1);
    assert.equal(sarif.runs[0]?.tool.driver.rules.length, 1);
    assert.equal(sarif.runs[0]?.results[0]?.ruleId, 'compatibility/unresolved-dependency');
    assert.equal(sarif.runs[0]?.results[0]?.ruleIndex, 0);
    assert.equal(sarif.runs[0]?.results[0]?.level, 'warning');
    assert.equal(
      sarif.runs[0]?.results[0]?.partialFingerprints['pkgwiseFindingFingerprint/v1'],
      fingerprint,
    );
    assert.equal(
      sarif.runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri,
      'package-lock.json',
    );
    assert.equal(sarif.runs[0]?.results[0]?.codeFlows.length, 1);
    assert.equal(sarif.runs[0]?.invocations[0]?.toolExecutionNotifications.length, 1);
  });
});
