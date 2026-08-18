import type { PolicyDecisionSummary } from '@lovlydev/pkgwise-core';

export function mapPolicyToExitCode(policy: PolicyDecisionSummary): number {
  return policy.status === 'failed' ? 1 : 0;
}
