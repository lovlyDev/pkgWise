import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DependencyGraphAnalysis } from '../../src/project/lockfile/analyzeDependencyGraph.js';
import type { ProjectOsvResult } from '../../src/providers/osv/fetchProjectOsv.js';
import type {
  FindingSeverity,
  PackageReport,
  SecurityAdvisory,
} from '../../src/public/ClientResults.js';
import { calculateProjectScores } from '../../src/scoring/calculateProjectScores.js';

describe('project scoring', () => {
  it('is deterministic under input permutation and keeps every value in range', () => {
    const packages = [packageReport('a', '1.0.0', true), packageReport('b', '2.0.0', false)];
    const osv = osvResult([
      coordinate('a', '1.0.0', 'medium'),
      coordinate('b', '2.0.0', undefined),
    ]);
    const first = calculateProjectScores({
      graph: graph(packages),
      packages,
      findings: [],
      osv,
    });
    const second = calculateProjectScores({
      graph: graph([...packages].reverse()),
      packages: [...packages].reverse(),
      findings: [],
      osv: osvResult([...osv.coordinates].reverse()),
    });

    assert.deepEqual(first, second);
    assert.ok(first.overall !== undefined && first.overall >= 0 && first.overall <= 100);
    assert.ok(first.coverage >= 0 && first.coverage <= 1);
    assert.ok(first.confidence >= 0 && first.confidence <= 1);
    for (const category of first.categories) {
      if (category.score !== undefined) assert.ok(category.score >= 0 && category.score <= 100);
    }
  });

  it('scores a direct critical advisory below a transitive low advisory', () => {
    const direct = packageReport('affected', '1.0.0', true);
    const transitive = packageReport('affected', '1.0.0', false);
    const critical = calculateProjectScores({
      packages: [direct],
      findings: [],
      osv: osvResult([coordinate('affected', '1.0.0', 'critical')]),
    });
    const low = calculateProjectScores({
      packages: [transitive],
      findings: [],
      osv: osvResult([coordinate('affected', '1.0.0', 'low')]),
    });

    assert.ok(securityScore(critical) < securityScore(low));
    assert.equal(securityScore(critical), 5);
    assert.equal(securityScore(low), 88);
  });

  it('applies monotonic fragmentation penalties and supports focused category weights', () => {
    const healthyPackages = [packageReport('shared', '1.0.0', false)];
    const fragmentedPackages = [
      packageReport('shared', '1.0.0', false),
      packageReport('shared', '2.0.0', false),
      packageReport('shared', '3.0.0', false),
    ];
    const healthy = calculateProjectScores({
      graph: graph(healthyPackages),
      packages: healthyPackages,
      findings: [],
      categoryWeights: focusedLocalWeights,
    });
    const fragmented = calculateProjectScores({
      graph: graph(fragmentedPackages, [
        { name: 'shared', versions: ['1.0.0', '2.0.0', '3.0.0'], packageCount: 3 },
      ]),
      packages: fragmentedPackages,
      findings: [],
      categoryWeights: focusedLocalWeights,
    });

    assert.equal(healthy.coverage, 1);
    assert.equal(healthy.label, 'strong');
    assert.ok((fragmented.overall ?? 100) < (healthy.overall ?? 0));
  });

  it('reports insufficient data instead of inventing an empty-project score', () => {
    const result = calculateProjectScores({ packages: [], findings: [] });

    assert.equal(result.status, 'insufficient-data');
    assert.equal(result.overall, undefined);
    assert.equal(result.coverage, 0);
    assert.equal(result.confidence, 0);
  });
});

const focusedLocalWeights = {
  security: 0,
  maintenance: 0,
  'supply-chain': 0,
  reliability: 0.6,
  compatibility: 0.4,
  quality: 0,
} as const;

function packageReport(name: string, version: string, direct: boolean): PackageReport {
  return {
    id: `${name}-${version}-${direct ? 'direct' : 'transitive'}`,
    name,
    version,
    direct,
    directScopes: direct ? ['runtime'] : [],
    minimumDepth: direct ? 1 : 2,
    dependencyPaths: [],
    pathsTruncated: false,
    resolvedDependencyCount: 0,
  };
}

function graph(
  packages: readonly PackageReport[],
  duplicateVersions: DependencyGraphAnalysis['duplicateVersions'] = [],
): DependencyGraphAnalysis {
  return {
    summary: {
      packageCount: packages.length,
      edgeCount: packages.length,
      unresolvedDependencyCount: 0,
      maximumDepth: packages.length === 0 ? 0 : 1,
    },
    packages,
    duplicateVersions,
    cycles: [],
    unresolvedDependencies: [],
    pathsByPackageId: new Map(),
  };
}

function coordinate(name: string, version: string, severity?: FindingSeverity) {
  return {
    name,
    version,
    result: {
      status: 'available' as const,
      cache: 'miss' as const,
      advisories: severity === undefined ? [] : [advisory(severity)],
    },
  };
}

function advisory(severity: FindingSeverity): SecurityAdvisory {
  return {
    id: `TEST-${severity}`,
    aliases: [],
    severity,
    active: true,
    references: [],
    source: { provider: 'osv', url: 'https://api.osv.dev/v1/query', cache: 'miss' },
  };
}

function osvResult(coordinates: ProjectOsvResult['coordinates']): ProjectOsvResult {
  return {
    status: 'available',
    coordinates,
    advisories: [],
    eligibleCoordinateCount: coordinates.length,
    evaluatedCoordinateCount: coordinates.length,
    unavailableCoordinateCount: 0,
  };
}

function securityScore(result: ReturnType<typeof calculateProjectScores>): number {
  return result.categories.find((category) => category.category === 'security')?.score as number;
}
