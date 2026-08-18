import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { loadPkgWiseConfig } from '../config/loadPkgWiseConfig.js';
import { discoverProjectRoot } from '../project/discovery/discoverProjectRoot.js';
import { loadPackageManifest } from '../project/manifest/loadPackageManifest.js';
import type { DiagnoseInput } from '../public/ClientInputs.js';
import type { DoctorCheck, DoctorReport } from '../public/ClientResults.js';
import { getCacheStatus } from '../cache/cacheOperations.js';

export async function diagnoseEnvironment(input: DiagnoseInput): Promise<DoctorReport> {
  input.signal?.throwIfAborted();

  const checks: DoctorCheck[] = [
    {
      id: 'runtime/node',
      status: Number(process.versions.node.split('.')[0]) >= 22 ? 'pass' : 'fail',
      message: `Node.js ${process.versions.node}`,
    },
    {
      id: 'runtime/platform',
      status: 'pass',
      message: `${process.platform} ${process.arch}`,
    },
    {
      id: 'network/mode',
      status: input.offline ? 'warning' : 'pass',
      message: input.offline ? 'Offline mode is enabled' : 'Online mode is enabled',
    },
  ];

  if (input.root !== undefined) {
    const root = resolve(input.root);
    try {
      await access(root, constants.R_OK);
      checks.push({
        id: 'project/root',
        status: 'pass',
        message: `Project root is readable: ${root}`,
      });
    } catch {
      checks.push({
        id: 'project/root',
        status: 'fail',
        message: `Project root is not readable: ${root}`,
      });
    }
  }

  if (input.root !== undefined || input.configFile !== undefined) {
    const projectRoot = await discoverProjectRoot(input.root ?? process.cwd(), input.signal);
    const manifest = await loadPackageManifest(projectRoot, input.signal);
    const config = await loadPkgWiseConfig(projectRoot, manifest, input.configFile, input.signal);
    checks.push({
      id: 'project/configuration',
      status: 'pass',
      message: `PkgWise configuration is valid (${config.source}).`,
    });
  }

  if (input.cache !== false) {
    const cache = await getCacheStatus({
      ...(input.cacheDirectory === undefined ? {} : { cacheDirectory: input.cacheDirectory }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    checks.push({
      id: 'cache/namespace',
      status: cache.exists && !cache.owned ? 'warning' : 'pass',
      message: cache.exists
        ? `${cache.entryCount} entries, ${cache.totalBytes} bytes at ${cache.path}`
        : `Cache namespace is empty: ${cache.path}`,
    });
  }

  input.signal?.throwIfAborted();

  return {
    schemaVersion: '1',
    status: checks.some((check) => check.status === 'fail') ? 'degraded' : 'healthy',
    checks,
  };
}
