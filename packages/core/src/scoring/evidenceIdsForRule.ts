import type { Finding } from '../public/ClientResults.js';

export function evidenceIdsForRule(findings: readonly Finding[], ruleId: string): string[] {
  return [
    ...new Set(
      findings
        .filter((finding) => finding.ruleId === ruleId)
        .flatMap((finding) => finding.evidence.map((evidence) => evidence.id)),
    ),
  ].sort();
}
