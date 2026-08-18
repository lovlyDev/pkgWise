import type { Finding, PackageReport, PolicyDecisionSummary } from '../public/ClientResults.js';
import type { FindingPolicyCondition, PkgWiseConfigV1 } from '../public/PkgWiseConfig.js';

export function evaluatePolicy(
  config: PkgWiseConfigV1['policy'],
  findings: readonly Finding[],
  packages: readonly PackageReport[],
  overallCoverage: number,
): PolicyDecisionSummary {
  const conditions = config?.fail ?? [];
  const configured = config !== undefined;
  const violations: PolicyDecisionSummary['violations'][number][] = [];

  if (
    config?.minimumOverallCoverage !== undefined &&
    overallCoverage < config.minimumOverallCoverage
  ) {
    violations.push({
      condition: 'minimumOverallCoverage',
      message: `Overall coverage ${formatPercent(overallCoverage)} is below required ${formatPercent(config.minimumOverallCoverage)}.`,
      findingFingerprints: [],
    });
  }

  conditions.forEach((condition, index) => {
    if (condition.type === 'coverage') {
      if (overallCoverage < condition.below) {
        violations.push({
          condition: `fail[${index}].coverage`,
          message: `Overall coverage ${formatPercent(overallCoverage)} is below ${formatPercent(condition.below)}.`,
          findingFingerprints: [],
        });
      }
      return;
    }

    const matching = findings.filter((finding) => matchesFinding(condition, finding, packages));
    if (matching.length > 0) {
      violations.push({
        condition: `fail[${index}].finding`,
        message: `${matching.length} finding${matching.length === 1 ? '' : 's'} matched the configured ${condition.minimumSeverity}+ policy condition.`,
        findingFingerprints: matching.map((finding) => finding.fingerprint).sort(),
      });
    }
  });

  return {
    status: violations.length === 0 ? 'passed' : 'failed',
    configured,
    evaluatedFindingCount: findings.length,
    violations,
  };
}

function matchesFinding(
  condition: FindingPolicyCondition,
  finding: Finding,
  packages: readonly PackageReport[],
): boolean {
  if (!meetsSeverity(finding.severity, condition.minimumSeverity)) return false;
  if (
    condition.minimumConfidence !== undefined &&
    finding.confidence < condition.minimumConfidence
  ) {
    return false;
  }
  if (
    condition.evidenceKinds !== undefined &&
    !finding.evidence.some((evidence) => condition.evidenceKinds?.includes(evidence.kind))
  ) {
    return false;
  }
  if (condition.rules !== undefined && !condition.rules.includes(finding.ruleId)) return false;
  if (condition.directOnly === true && !finding.context.direct) return false;
  if (
    condition.scopes !== undefined &&
    !finding.context.scopes.some((scope) => condition.scopes?.includes(scope))
  ) {
    return false;
  }
  if (condition.packages !== undefined) {
    const packageNames = new Set(
      packages
        .filter((item) => finding.subject.packageIds.includes(item.id))
        .map((item) => item.name),
    );
    packageNames.add(finding.subject.key);
    if (!condition.packages.some((name) => packageNames.has(name))) return false;
  }
  return true;
}

function meetsSeverity(actual: Finding['severity'], minimum: Finding['severity']): boolean {
  const order: readonly Finding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
  return order.indexOf(actual) <= order.indexOf(minimum);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
