import { createHash } from 'node:crypto';
import type { Finding, PackageReport, ProjectPackageMetadata } from '../public/ClientResults.js';
import { compareFindings } from './createSecurityFindings.js';

export const registryRuleIds = [
  'maintenance/npm-deprecated',
  'supply-chain/install-script',
] as const;

export function createRegistryFindings(
  metadata: readonly ProjectPackageMetadata[],
  packages: readonly PackageReport[],
): Finding[] {
  const findings: Finding[] = [];
  for (const item of metadata) {
    if (item.status !== 'available') continue;
    const related = packages.filter(
      (candidate) => candidate.name === item.name && candidate.version === item.version,
    );
    if (item.deprecated !== undefined && item.deprecated.trim() !== '') {
      findings.push(createDeprecatedFinding(item, related));
    }
    const installScripts = (item.lifecycleScripts ?? []).filter((script) =>
      ['preinstall', 'install', 'postinstall'].includes(script),
    );
    if (installScripts.length > 0)
      findings.push(createInstallScriptFinding(item, related, installScripts));
  }
  return findings.sort(compareFindings);
}

function createDeprecatedFinding(
  metadata: ProjectPackageMetadata,
  packages: readonly PackageReport[],
): Finding {
  const runtimeDirect = packages.some(
    (item) =>
      item.direct && item.directScopes.some((scope) => scope === 'runtime' || scope === 'optional'),
  );
  return baseFinding('maintenance/npm-deprecated', metadata, packages, {
    title: `${metadata.name}@${metadata.version} is deprecated`,
    summary: metadata.deprecated ?? 'The npm Registry marks this release as deprecated.',
    severity: runtimeDirect ? 'medium' : 'low',
    priority: runtimeDirect ? 'review' : 'worth-knowing',
    evidenceKind: 'confirmed-fact',
    evidenceSummary: `The npm Registry deprecation field is set for the exact release ${metadata.name}@${metadata.version}.`,
    recommendation:
      'Replace or upgrade the deprecated release after reviewing the publisher guidance.',
    actions: [
      'Review the npm deprecation message and the package release notes.',
      'Upgrade or replace the dependency, run tests, and rescan the project.',
    ],
  });
}

function createInstallScriptFinding(
  metadata: ProjectPackageMetadata,
  packages: readonly PackageReport[],
  scripts: readonly string[],
): Finding {
  const runtimeDirect = packages.some(
    (item) =>
      item.direct && item.directScopes.some((scope) => scope === 'runtime' || scope === 'optional'),
  );
  return baseFinding('supply-chain/install-script', metadata, packages, {
    title: `${metadata.name}@${metadata.version} runs lifecycle code during installation`,
    summary: `The release declares ${scripts.join(', ')} lifecycle script${scripts.length === 1 ? '' : 's'}. This is common but increases installation-time execution exposure.`,
    severity: runtimeDirect ? 'low' : 'info',
    priority: runtimeDirect ? 'worth-knowing' : 'informational',
    evidenceKind: 'potential-risk',
    evidenceSummary: `The npm Registry manifest for the exact release declares: ${scripts.join(', ')}.`,
    recommendation:
      'Review install-time scripts when the package is high impact or newly introduced.',
    actions: [
      'Inspect the package lifecycle scripts and their invoked files.',
      'Use lockfile integrity, trusted registries, and dependency review in CI.',
    ],
  });
}

function baseFinding(
  ruleId: (typeof registryRuleIds)[number],
  metadata: ProjectPackageMetadata,
  packages: readonly PackageReport[],
  details: {
    readonly title: string;
    readonly summary: string;
    readonly severity: Finding['severity'];
    readonly priority: Finding['priority'];
    readonly evidenceKind: Finding['evidence'][number]['kind'];
    readonly evidenceSummary: string;
    readonly recommendation: string;
    readonly actions: readonly string[];
  },
): Finding {
  const fingerprint = hash([ruleId, '1', metadata.name, metadata.version]);
  const paths = packages.flatMap((item) => item.dependencyPaths);
  return {
    ruleId,
    ruleVersion: '1.0.0',
    fingerprint,
    subject: {
      type: 'package',
      key: `${metadata.name}@${metadata.version}`,
      packageIds: packages.map((item) => item.id).sort(),
    },
    title: details.title,
    summary: details.summary,
    severity: details.severity,
    priority: details.priority,
    confidence: 1,
    category: ruleId.startsWith('maintenance/') ? 'maintenance' : 'supply-chain',
    context: {
      direct: packages.some((item) => item.direct),
      scopes: [...new Set(packages.flatMap((item) => item.directScopes))].sort(),
    },
    evidence: [
      {
        id: hash(['npm-registry', fingerprint]),
        kind: details.evidenceKind,
        summary: details.evidenceSummary,
      },
    ],
    dependencyPaths: paths.slice(0, 3),
    pathsTruncated: packages.some((item) => item.pathsTruncated) || paths.length > 3,
    recommendation: { summary: details.recommendation, actions: details.actions },
  };
}

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}
