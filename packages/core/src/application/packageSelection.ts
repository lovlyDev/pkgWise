import { PkgWiseError } from '../errors/PkgWiseError.js';
import type { PackageReport } from '../public/ClientResults.js';

export interface InstalledPackageSelection {
  readonly selector: string;
  readonly name: string;
  readonly requestedVersion?: string;
  readonly availableVersions: readonly string[];
  readonly packages: readonly PackageReport[];
}

export function selectInstalledPackages(
  packages: readonly PackageReport[],
  packageSpec: string,
  options: { readonly allVersions?: boolean; readonly remote?: boolean } = {},
): InstalledPackageSelection {
  const selector = parsePackageSelector(packageSpec, options.remote === true);
  const candidates = packages.filter((item) => item.name === selector.name);
  if (candidates.length === 0) {
    if (options.remote === true) {
      return {
        selector: packageSpec,
        name: selector.name,
        ...(selector.version === undefined ? {} : { requestedVersion: selector.version }),
        availableVersions: [],
        packages: [],
      };
    }
    throw new PkgWiseError({
      code: 'PW_PACKAGE_NOT_FOUND',
      userMessage: `Package ${selector.name} is not installed in this project. Use --remote when remote inspection becomes available.`,
      recoverable: false,
    });
  }

  const availableVersions = [...new Set(candidates.flatMap((item) => item.version ?? []))].sort(
    compareVersions,
  );
  let selected: PackageReport[];
  if (selector.version !== undefined) {
    selected = candidates.filter((item) => item.version === selector.version);
    if (selected.length === 0) {
      if (options.remote === true) {
        return {
          selector: packageSpec,
          name: selector.name,
          requestedVersion: selector.version,
          availableVersions,
          packages: [],
        };
      }
      throw new PkgWiseError({
        code: 'PW_PACKAGE_NOT_FOUND',
        userMessage: `${selector.name}@${selector.version} is not installed. Available versions: ${availableVersions.join(', ') || 'unknown'}.`,
        recoverable: false,
        details: { availableVersions },
      });
    }
  } else if (availableVersions.length > 1 && options.allVersions !== true) {
    throw new PkgWiseError({
      code: 'PW_PACKAGE_SELECTOR_AMBIGUOUS',
      userMessage: `${selector.name} has ${availableVersions.length} installed versions: ${availableVersions.join(', ')}. Use an exact name@version or --all-versions.`,
      recoverable: false,
      details: { availableVersions },
    });
  } else {
    selected = [...candidates];
  }

  selected.sort(comparePackages);
  return {
    selector: packageSpec,
    name: selector.name,
    ...(selector.version === undefined ? {} : { requestedVersion: selector.version }),
    availableVersions,
    packages: selected,
  };
}

function parsePackageSelector(
  value: string,
  allowRemoteSelector: boolean,
): { readonly name: string; readonly version?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) throw invalidPackageSpec(value);
  let delimiter = -1;
  if (trimmed.startsWith('@')) {
    const slash = trimmed.indexOf('/');
    if (slash <= 1) throw invalidPackageSpec(value);
    delimiter = trimmed.indexOf('@', slash + 1);
  } else {
    delimiter = trimmed.indexOf('@');
  }
  const name = delimiter < 0 ? trimmed : trimmed.slice(0, delimiter);
  const version = delimiter < 0 ? undefined : trimmed.slice(delimiter + 1);
  if (
    !isPackageName(name) ||
    version === '' ||
    (version !== undefined &&
      !(allowRemoteSelector ? isRemoteVersionSelector(version) : isExactVersion(version)))
  ) {
    throw invalidPackageSpec(value);
  }
  return { name, ...(version === undefined ? {} : { version }) };
}

function isRemoteVersionSelector(value: string): boolean {
  return value.length <= 128 && !/[\s/@\\]/.test(value);
}

function isExactVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    value,
  );
}

function isPackageName(value: string): boolean {
  return /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(value) && value.length <= 214;
}

function invalidPackageSpec(value: string): PkgWiseError {
  return new PkgWiseError({
    code: 'PW_PACKAGE_SPEC_INVALID',
    userMessage: `Invalid package selector ${JSON.stringify(value)}. Use name, @scope/name, or an exact name@version.`,
    recoverable: false,
  });
}

function comparePackages(left: PackageReport, right: PackageReport): number {
  return (
    compareVersions(left.version ?? '', right.version ?? '') ||
    left.minimumDepth - right.minimumDepth ||
    left.id.localeCompare(right.id)
  );
}

function compareVersions(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true });
}
