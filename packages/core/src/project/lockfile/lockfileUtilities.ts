import { PkgWiseError } from '../../errors/PkgWiseError.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readStringMap(value: unknown, context: string): Readonly<Record<string, string>> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw lockfileParseError(`${context} must be an object.`);
  }

  const result = Object.create(null) as Record<string, string>;
  for (const [name, reference] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof reference !== 'string') {
      throw lockfileParseError(`${context}.${name} must be a string.`);
    }
    result[name] = reference;
  }
  return result;
}

export function lockfileParseError(message: string, cause?: unknown): PkgWiseError {
  return new PkgWiseError({
    code: 'PW_LOCKFILE_PARSE_FAILED',
    userMessage: message,
    recoverable: false,
    ...(cause === undefined ? {} : { cause }),
  });
}
