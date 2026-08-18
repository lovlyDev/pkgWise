import { access, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { PkgWiseError } from '../errors/PkgWiseError.js';
import type { PackageManifestSnapshot } from '../project/manifest/PackageManifestSnapshot.js';
import { localRuleIds } from '../rules/runLocalRules.js';
import type {
  FindingPolicyCondition,
  LoadedPkgWiseConfig,
  PkgWiseConfigV1,
  SupportedPolicyCondition,
} from '../public/PkgWiseConfig.js';

const maximumConfigBytes = 1024 * 1024;
const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
const evidenceKinds = ['confirmed-fact', 'heuristic', 'potential-risk'] as const;
const scopes = ['runtime', 'development', 'peer', 'optional'] as const;
const policyRuleIds = [...localRuleIds, 'security/osv-vulnerability'] as const;

export async function loadPkgWiseConfig(
  projectRoot: string,
  manifest: PackageManifestSnapshot,
  explicitFile?: string,
  signal?: AbortSignal,
): Promise<LoadedPkgWiseConfig> {
  signal?.throwIfAborted();
  if (explicitFile !== undefined) {
    const path = resolve(explicitFile);
    return {
      config: validateConfig(await readConfigFile(path, signal)),
      source: 'explicit-file',
      relativePath: basename(path),
    };
  }

  const projectFile = resolve(projectRoot, 'pkgwise.config.json');
  try {
    await access(projectFile);
    return {
      config: validateConfig(await readConfigFile(projectFile, signal)),
      source: 'project-file',
      relativePath: 'pkgwise.config.json',
    };
  } catch (cause) {
    if (cause instanceof PkgWiseError) throw cause;
    if (!isMissingFileError(cause)) {
      throw new PkgWiseError({
        code: 'PW_CONFIG_INVALID',
        userMessage: `Unable to access ${projectFile}.`,
        recoverable: false,
        cause,
      });
    }
  }

  if (manifest.pkgwise !== undefined) {
    return {
      config: validateConfig(manifest.pkgwise),
      source: 'package-json',
      relativePath: 'package.json#pkgwise',
    };
  }
  return { config: { schemaVersion: 1 }, source: 'defaults' };
}

async function readConfigFile(path: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const file = await stat(path);
    if (!file.isFile()) throw new Error('not a regular file');
    if (file.size > maximumConfigBytes) {
      throw configError([`/: configuration exceeds the ${maximumConfigBytes}-byte safety limit`]);
    }
    const text = await readFile(path, 'utf8');
    signal?.throwIfAborted();
    return JSON.parse(text) as unknown;
  } catch (cause) {
    if (cause instanceof PkgWiseError) throw cause;
    throw new PkgWiseError({
      code: 'PW_CONFIG_INVALID',
      userMessage: `Unable to read ${path} as a valid JSON configuration file.`,
      recoverable: false,
      cause,
    });
  }
}

function validateConfig(value: unknown): PkgWiseConfigV1 {
  const issues: string[] = [];
  if (!isRecord(value)) throw configError(['/: expected an object']);
  rejectUnknownKeys(value, ['schemaVersion', 'project', 'rules', 'policy'], '', issues);
  if (value.schemaVersion !== 1) issues.push('/schemaVersion: expected the number 1');

  const project = validateProject(value.project, issues);
  const rules = validateRules(value.rules, issues);
  const policy = validatePolicy(value.policy, issues);
  if (issues.length > 0) throw configError(issues);
  return {
    schemaVersion: 1,
    ...(project === undefined ? {} : { project }),
    ...(rules === undefined ? {} : { rules }),
    ...(policy === undefined ? {} : { policy }),
  };
}

function validateProject(value: unknown, issues: string[]): PkgWiseConfigV1['project'] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push('/project: expected an object');
    return undefined;
  }
  rejectUnknownKeys(value, ['includeDev'], '/project', issues);
  if (value.includeDev !== undefined && typeof value.includeDev !== 'boolean') {
    issues.push('/project/includeDev: expected a boolean');
  }
  return typeof value.includeDev === 'boolean' ? { includeDev: value.includeDev } : {};
}

function validateRules(value: unknown, issues: string[]): PkgWiseConfigV1['rules'] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push('/rules: expected an object');
    return undefined;
  }
  const result = Object.create(null) as Record<
    string,
    false | { enabled?: boolean; options?: Readonly<Record<string, unknown>> }
  >;
  for (const [ruleId, setting] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (!(localRuleIds as readonly string[]).includes(ruleId)) {
      issues.push(`/rules/${escapePointer(ruleId)}: unknown rule ID`);
      continue;
    }
    if (setting === false) {
      result[ruleId] = false;
      continue;
    }
    if (!isRecord(setting)) {
      issues.push(`/rules/${escapePointer(ruleId)}: expected false or an object`);
      continue;
    }
    rejectUnknownKeys(setting, ['enabled', 'options'], `/rules/${escapePointer(ruleId)}`, issues);
    if (setting.enabled !== undefined && typeof setting.enabled !== 'boolean') {
      issues.push(`/rules/${escapePointer(ruleId)}/enabled: expected a boolean`);
    }
    if (setting.options !== undefined) {
      if (!isRecord(setting.options)) {
        issues.push(`/rules/${escapePointer(ruleId)}/options: expected an object`);
      } else if (Object.keys(setting.options).length > 0) {
        issues.push(
          `/rules/${escapePointer(ruleId)}/options: this rule has no configurable options`,
        );
      }
    }
    result[ruleId] = {
      ...(typeof setting.enabled === 'boolean' ? { enabled: setting.enabled } : {}),
      ...(isRecord(setting.options) ? { options: setting.options } : {}),
    };
  }
  return result;
}

function validatePolicy(value: unknown, issues: string[]): PkgWiseConfigV1['policy'] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push('/policy: expected an object');
    return undefined;
  }
  rejectUnknownKeys(value, ['fail', 'minimumOverallCoverage'], '/policy', issues);
  const fail: SupportedPolicyCondition[] = [];
  if (value.fail !== undefined) {
    if (!Array.isArray(value.fail)) {
      issues.push('/policy/fail: expected an array');
    } else {
      value.fail.forEach((condition, index) => {
        const parsed = validateCondition(condition, index, issues);
        if (parsed !== undefined) fail.push(parsed);
      });
    }
  }
  const minimum = validateUnitInterval(
    value.minimumOverallCoverage,
    '/policy/minimumOverallCoverage',
    issues,
  );
  return {
    ...(value.fail === undefined ? {} : { fail }),
    ...(minimum === undefined ? {} : { minimumOverallCoverage: minimum }),
  };
}

function validateCondition(
  value: unknown,
  index: number,
  issues: string[],
): SupportedPolicyCondition | undefined {
  const pointer = `/policy/fail/${index}`;
  if (!isRecord(value)) {
    issues.push(`${pointer}: expected an object`);
    return undefined;
  }
  if (value.type === 'coverage') {
    rejectUnknownKeys(value, ['type', 'below'], pointer, issues);
    const below = validateUnitInterval(value.below, `${pointer}/below`, issues);
    return below === undefined ? undefined : { type: 'coverage', below };
  }
  if (value.type !== 'finding') {
    issues.push(`${pointer}/type: expected "finding" or "coverage"`);
    return undefined;
  }
  rejectUnknownKeys(
    value,
    [
      'type',
      'minimumSeverity',
      'evidenceKinds',
      'minimumConfidence',
      'rules',
      'packages',
      'scopes',
      'directOnly',
    ],
    pointer,
    issues,
  );
  if (!(severities as readonly unknown[]).includes(value.minimumSeverity)) {
    issues.push(`${pointer}/minimumSeverity: expected ${severities.join(', ')}`);
  }
  const minimumConfidence = validateUnitInterval(
    value.minimumConfidence,
    `${pointer}/minimumConfidence`,
    issues,
  );
  const configuredEvidenceKinds = validateStringEnumArray(
    value.evidenceKinds,
    evidenceKinds,
    `${pointer}/evidenceKinds`,
    issues,
  );
  const configuredScopes = validateStringEnumArray(
    value.scopes,
    scopes,
    `${pointer}/scopes`,
    issues,
  );
  const rules = validateStringArray(value.rules, `${pointer}/rules`, issues);
  if (rules !== undefined) {
    for (const rule of rules) {
      if (!(policyRuleIds as readonly string[]).includes(rule)) {
        issues.push(`${pointer}/rules: unknown rule ID ${JSON.stringify(rule)}`);
      }
    }
  }
  const packages = validateStringArray(value.packages, `${pointer}/packages`, issues);
  if (value.directOnly !== undefined && typeof value.directOnly !== 'boolean') {
    issues.push(`${pointer}/directOnly: expected a boolean`);
  }
  if (!(severities as readonly unknown[]).includes(value.minimumSeverity)) return undefined;
  return {
    type: 'finding',
    minimumSeverity: value.minimumSeverity as FindingPolicyCondition['minimumSeverity'],
    ...(configuredEvidenceKinds === undefined ? {} : { evidenceKinds: configuredEvidenceKinds }),
    ...(minimumConfidence === undefined ? {} : { minimumConfidence }),
    ...(rules === undefined ? {} : { rules }),
    ...(packages === undefined ? {} : { packages }),
    ...(configuredScopes === undefined ? {} : { scopes: configuredScopes }),
    ...(typeof value.directOnly === 'boolean' ? { directOnly: value.directOnly } : {}),
  };
}

function validateStringEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  pointer: string,
  issues: string[],
): readonly T[] | undefined {
  const values = validateStringArray(value, pointer, issues);
  if (values === undefined) return undefined;
  const result: T[] = [];
  for (const item of values) {
    if (!(allowed as readonly string[]).includes(item)) {
      issues.push(`${pointer}: unsupported value ${JSON.stringify(item)}`);
    } else result.push(item as T);
  }
  return result;
}

function validateStringArray(
  value: unknown,
  pointer: string,
  issues: string[],
): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    issues.push(`${pointer}: expected an array of non-empty strings`);
    return undefined;
  }
  return [...new Set(value as string[])].sort();
}

function validateUnitInterval(
  value: unknown,
  pointer: string,
  issues: string[],
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    issues.push(`${pointer}: expected a finite number from 0 to 1`);
    return undefined;
  }
  return value;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  pointer: string,
  issues: string[],
): void {
  for (const key of Object.keys(value).sort()) {
    if (!allowed.includes(key)) issues.push(`${pointer}/${escapePointer(key)}: unknown property`);
  }
}

function configError(issues: readonly string[]): PkgWiseError {
  const sorted = [...issues].sort().slice(0, 100);
  return new PkgWiseError({
    code: 'PW_CONFIG_INVALID',
    userMessage: `Invalid PkgWise configuration:\n${sorted.map((issue) => `- ${issue}`).join('\n')}`,
    recoverable: false,
    details: { issues: sorted },
  });
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(value: unknown): boolean {
  return value instanceof Error && 'code' in value && value.code === 'ENOENT';
}
