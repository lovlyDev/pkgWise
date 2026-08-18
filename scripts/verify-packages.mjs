import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(workspace, '.artifacts');
const temporary = await mkdtemp(join(tmpdir(), 'pkgwise-install-smoke-'));
const pnpmCli = process.env.npm_execpath;
const npmCli =
  process.platform === 'win32'
    ? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
    : undefined;

if (pnpmCli === undefined) {
  throw new Error('verify-packages must be started through pnpm so npm_execpath is available.');
}

try {
  runNodeCli(pnpmCli, ['clean'], workspace);
  runNodeCli(pnpmCli, ['build'], workspace);
  runNodeCli(
    pnpmCli,
    ['--filter', '@lovlydev/pkgwise-core', 'pack', '--pack-destination', artifacts],
    workspace,
  );
  runNodeCli(pnpmCli, ['--filter', 'pkgwise', 'pack', '--pack-destination', artifacts], workspace);

  const tarballs = (await readdir(artifacts))
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => resolve(artifacts, name));
  const coreTarball = tarballs.find((name) => name.includes('pkgwise-core-'));
  const cliTarball = tarballs.find((name) => /pkgwise-\d/.test(name));
  if (coreTarball === undefined || cliTarball === undefined) {
    throw new Error(`Expected core and CLI tarballs, found: ${tarballs.join(', ')}`);
  }

  await writeFile(
    join(temporary, 'package.json'),
    JSON.stringify({ name: 'pkgwise-install-smoke', version: '1.0.0', private: true }),
  );
  const installArguments = [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    coreTarball,
    cliTarball,
  ];
  if (npmCli === undefined) run('npm', installArguments, temporary);
  else runNodeCli(npmCli, installArguments, temporary);

  const installedCore = JSON.parse(
    await readFile(join(temporary, 'node_modules/@lovlydev/pkgwise-core/package.json'), 'utf8'),
  );
  const installedCli = JSON.parse(
    await readFile(join(temporary, 'node_modules/pkgwise/package.json'), 'utf8'),
  );
  await readFile(join(temporary, 'node_modules/@lovlydev/pkgwise-core/README.md'), 'utf8');
  await readFile(join(temporary, 'node_modules/@lovlydev/pkgwise-core/CHANGELOG.md'), 'utf8');
  await readFile(join(temporary, 'node_modules/@lovlydev/pkgwise-core/LICENSE'), 'utf8');
  await readFile(join(temporary, 'node_modules/pkgwise/README.md'), 'utf8');
  await readFile(join(temporary, 'node_modules/pkgwise/CHANGELOG.md'), 'utf8');
  await readFile(join(temporary, 'node_modules/pkgwise/LICENSE'), 'utf8');
  if (String(installedCli.dependencies?.['@lovlydev/pkgwise-core']).startsWith('workspace:')) {
    throw new Error('Packed CLI still contains a workspace protocol dependency.');
  }
  if (installedCore.version !== installedCli.version) {
    throw new Error('Installed core and CLI versions are not synchronized.');
  }

  run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { createPkgWise } from '@lovlydev/pkgwise-core'; if (typeof createPkgWise !== 'function') process.exit(1);",
    ],
    temporary,
  );
  const bin =
    process.platform === 'win32'
      ? resolve(temporary, 'node_modules/pkgwise/dist/bin/pkgwise.js')
      : resolve(temporary, 'node_modules/.bin/pkgwise');
  const binCommand = process.platform === 'win32' ? process.execPath : bin;
  const binPrefix = process.platform === 'win32' ? [bin] : [];
  const version = run(binCommand, [...binPrefix, '--version'], temporary).trim();
  if (version !== installedCli.version) {
    throw new Error(`Installed binary reported ${version}; expected ${installedCli.version}.`);
  }
  run(binCommand, [...binPrefix, '--help'], temporary);
  process.stdout.write(
    `Verified ${installedCore.name}@${installedCore.version} and ${installedCli.name}@${installedCli.version} from tarballs.\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
      { cause: result.error },
    );
  }
  return result.stdout;
}

function runNodeCli(cli, args, cwd) {
  return run(process.execPath, [cli, ...args], cwd);
}
