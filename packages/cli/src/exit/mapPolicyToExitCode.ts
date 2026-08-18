import type { PolicyDecisionSummary } from '@pkgwise/core';

export function mapPolicyToExitCode(policy: PolicyDecisionSummary): number {
  return policy.status === 'failed' ? 1 : 0;
}
