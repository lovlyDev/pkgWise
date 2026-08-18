import { PkgWiseError } from '../errors/PkgWiseError.js';
import type { ExplainFindingInput } from '../public/ClientInputs.js';
import type { Finding, FindingExplanation } from '../public/ClientResults.js';
import { analyzeProject, type AnalyzeProjectContext } from './analyzeProject.js';

export async function explainFinding(
  input: ExplainFindingInput,
  context: AnalyzeProjectContext,
): Promise<FindingExplanation> {
  const selector = input.selector.trim();
  if (selector.length === 0) {
    throw new PkgWiseError({
      code: 'PW_FINDING_NOT_FOUND',
      userMessage: 'Finding selector must not be empty.',
      recoverable: false,
    });
  }

  const report = await analyzeProject(
    {
      root: input.projectRoot ?? process.cwd(),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
      ...(input.configFile === undefined ? {} : { configFile: input.configFile }),
    },
    context,
  );
  const finding = selectFinding(report.findings, report.packages, selector);
  const packageIds = new Set(finding.subject.packageIds);

  return {
    schemaVersion: '1',
    selector,
    finding,
    relatedPackages: report.packages.filter((item) => packageIds.has(item.id)),
    report: {
      generatedAt: report.generatedAt,
      status: report.status,
      project: report.project,
      diagnostics: report.diagnostics,
    },
  };
}

function selectFinding(
  findings: readonly Finding[],
  packages: readonly { readonly id: string; readonly name: string; readonly version?: string }[],
  selector: string,
): Finding {
  const exactFingerprint = findings.find((finding) => finding.fingerprint === selector);
  if (exactFingerprint !== undefined) return exactFingerprint;

  const packageNamesById = new Map(packages.map((item) => [item.id, item]));
  const matches = findings.filter((finding) => {
    if (selector.length >= 8 && finding.fingerprint.startsWith(selector)) return true;
    if (finding.ruleId === selector || finding.subject.key === selector) return true;
    return finding.subject.packageIds.some((id) => {
      const item = packageNamesById.get(id);
      return item?.name === selector || `${item?.name}@${item?.version}` === selector;
    });
  });

  if (matches.length === 0) {
    throw new PkgWiseError({
      code: 'PW_FINDING_NOT_FOUND',
      userMessage: `No finding matches selector ${JSON.stringify(selector)} in this project.`,
      recoverable: false,
    });
  }
  if (matches.length > 1) {
    throw new PkgWiseError({
      code: 'PW_FINDING_SELECTOR_AMBIGUOUS',
      userMessage: `Selector ${JSON.stringify(selector)} matches ${matches.length} findings. Use a full fingerprint.`,
      recoverable: false,
      details: { fingerprints: matches.map((finding) => finding.fingerprint).sort() },
    });
  }
  return matches[0] as Finding;
}
