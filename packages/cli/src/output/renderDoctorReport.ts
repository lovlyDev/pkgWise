import type { DoctorReport } from '@lovlydev/pkgwise-core';

const symbols = {
  pass: 'PASS',
  warning: 'WARN',
  fail: 'FAIL',
} as const;

export function renderDoctorReport(report: DoctorReport): string {
  const lines = [`PkgWise doctor · ${report.status}`, ''];
  for (const check of report.checks) {
    lines.push(`${symbols[check.status].padEnd(4)}  ${check.id.padEnd(18)} ${check.message}`);
  }
  return `${lines.join('\n')}\n`;
}
