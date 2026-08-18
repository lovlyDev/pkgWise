import { createHash } from 'node:crypto';
import type { Finding, PackageReport, SecurityAdvisory } from '../public/ClientResults.js';

export function createSecurityFindings(
  name: string,
  version: string,
  packages: readonly PackageReport[],
  advisories: readonly SecurityAdvisory[],
): Finding[] {
  const packageIds = packages.map((item) => item.id).sort();
  const scopes: Finding['context']['scopes'] = [
    ...new Set(packages.flatMap((item) => item.directScopes)),
  ].sort();
  return advisories
    .filter((advisory) => advisory.active)
    .map((advisory) => {
      const severity = advisory.severity === 'unknown' ? 'info' : advisory.severity;
      const fingerprint = createHash('sha256')
        .update(['security/osv-vulnerability', '1', name, version, advisory.id].join('\0'))
        .digest('hex');
      return {
        ruleId: 'security/osv-vulnerability',
        ruleVersion: '1.0.0',
        fingerprint,
        subject: { type: 'package' as const, key: name, packageIds },
        title: `${advisory.id} affects ${name}@${version}`,
        summary: advisory.summary ?? `OSV reports an active advisory for ${name}@${version}.`,
        severity,
        priority:
          severity === 'critical' || severity === 'high'
            ? ('action-required' as const)
            : severity === 'medium'
              ? ('review' as const)
              : severity === 'low'
                ? ('worth-knowing' as const)
                : ('informational' as const),
        confidence: 1,
        category: 'security' as const,
        context: { direct: packages.some((item) => item.direct), scopes },
        evidence: [
          {
            id: createHash('sha256').update(`osv\0${fingerprint}`).digest('hex'),
            kind: 'confirmed-fact' as const,
            summary: `OSV matched ${advisory.id} to the exact npm coordinate ${name}@${version}.`,
          },
        ],
        dependencyPaths: packages.flatMap((item) => item.dependencyPaths).slice(0, 3),
        pathsTruncated:
          packages.some((item) => item.pathsTruncated) ||
          packages.reduce((sum, item) => sum + item.dependencyPaths.length, 0) > 3,
        recommendation: {
          summary: 'Review the advisory and upgrade to a non-affected version when available.',
          actions: [
            `Open the OSV record for ${advisory.id} and confirm affected ranges and fixes.`,
            'Update through the package manager and rerun the project test suite.',
          ],
        },
      } satisfies Finding;
    })
    .sort(compareFindings);
}

export function compareFindings(left: Finding, right: Finding): number {
  const severity: readonly Finding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
  return (
    severity.indexOf(left.severity) - severity.indexOf(right.severity) ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.fingerprint.localeCompare(right.fingerprint)
  );
}
