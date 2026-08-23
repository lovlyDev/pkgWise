import { PkgWiseError } from '@lovlydev/pkgwise-core';

export function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof PkgWiseError)) {
    return 5;
  }

  switch (error.code) {
    case 'PW_CLI_INVALID_ARGUMENT':
    case 'PW_CONFIG_INVALID':
    case 'PW_CACHE_UNSAFE':
    case 'PW_FINDING_NOT_FOUND':
    case 'PW_FINDING_SELECTOR_AMBIGUOUS':
    case 'PW_PACKAGE_NOT_FOUND':
    case 'PW_PACKAGE_SELECTOR_AMBIGUOUS':
    case 'PW_PACKAGE_SPEC_INVALID':
      return 2;
    case 'PW_PROJECT_NOT_FOUND':
    case 'PW_PROJECT_AMBIGUOUS_MANAGER':
    case 'PW_WORKSPACE_NOT_FOUND':
    case 'PW_WORKSPACE_SELECTOR_AMBIGUOUS':
    case 'PW_MANIFEST_PARSE_FAILED':
    case 'PW_LOCKFILE_PARSE_FAILED':
    case 'PW_LOCKFILE_VERSION_UNSUPPORTED':
      return 3;
    case 'PW_CANCELLED':
      return 130;
    case 'PW_PROVIDER_UNAVAILABLE':
      return 4;
    case 'PW_FEATURE_NOT_IMPLEMENTED':
    case 'PW_INTERNAL_ERROR':
      return 5;
  }
}
