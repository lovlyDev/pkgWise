import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import { join, resolve } from 'node:path';
import { createPkgWise } from '@lovlydev/pkgwise-core';
import { runCli } from '../../src/runCli.js';
import { createMemoryIo } from '../support/createMemoryIo.js';

describe('runCli', () => {
  it('prints top-level help without an error', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--help'], { io, version: '0.1.0-test' });

    assert.equal(exitCode, 0);
    assert.match(io.readStdout(), /Usage: pkgwise/);
    assert.match(io.readStdout(), /scan/);
    assert.equal(io.readStderr(), '');
  });

  it('prints the supplied version', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--version'], { io, version: '0.1.0-test' });

    assert.equal(exitCode, 0);
    assert.equal(io.readStdout(), '0.1.0-test\n');
  });

  it('runs doctor through the public core API', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--offline', 'doctor'], {
      io,
      client: createPkgWise(),
    });

    assert.equal(exitCode, 0);
    assert.match(io.readStdout(), /PkgWise doctor · healthy/);
    assert.match(io.readStdout(), /Offline mode is enabled/);
    assert.equal(io.readStderr(), '');
  });

  it('reports an empty explicit cache and requires confirmation before clearing', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pkgwise-cli-cache-'));
    try {
      const statusIo = createMemoryIo();
      const clearIo = createMemoryIo();

      const statusExit = await runCli(['--cache-dir', base, 'cache', 'status'], { io: statusIo });
      const clearExit = await runCli(['--cache-dir', base, 'cache', 'clear'], { io: clearIo });

      assert.equal(statusExit, 0);
      assert.match(statusIo.readStdout(), /PkgWise cache · empty/);
      assert.equal(clearExit, 2);
      assert.match(clearIo.readStderr(), /requires --yes/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('keeps package lookup JSON errors isolated in stdout', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--format', 'json', 'inspect', 'react'], { io });

    assert.equal(exitCode, 2);
    const output = JSON.parse(io.readStdout()) as {
      status: string;
      error: { code: string };
    };
    assert.equal(output.status, 'error');
    assert.equal(output.error.code, 'PW_PACKAGE_NOT_FOUND');
    assert.equal(io.readStderr(), '');
  });

  it('scans the current pnpm project with a resolved graph', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--format', 'json', 'scan', resolve(process.cwd(), '../..')], {
      io,
    });

    assert.equal(exitCode, 0);
    const report = JSON.parse(io.readStdout()) as {
      status: string;
      project: { manager: string };
      graph: { directDependencyCount: number; packageCount: number; lockfileVersion?: string };
      diagnostics: Array<{ code: string }>;
    };
    assert.equal(report.status, 'partial');
    assert.equal(report.project.manager, 'pnpm');
    assert.ok(report.graph.directDependencyCount >= 1);
    assert.ok(report.graph.packageCount >= report.graph.directDependencyCount);
    assert.equal(report.graph.lockfileVersion, '9.0');
    assert.equal(report.diagnostics[0]?.code, 'PW_ANALYSIS_GRAPH_AND_SCORING_READY');
  });

  it('passes workspace selection through CLI into the core graph roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-cli-workspace-'));
    try {
      await mkdir(join(root, 'packages', 'selected'), { recursive: true });
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'cli-workspace-root', workspaces: ['packages/*'] }),
      );
      await writeFile(
        join(root, 'packages', 'selected', 'package.json'),
        JSON.stringify({ name: '@fixture/selected', dependencies: { chosen: '1.0.0' } }),
      );
      const io = createMemoryIo();

      const exitCode = await runCli(
        ['--format', 'json', 'scan', root, '--workspace', '@fixture/selected'],
        { io },
      );
      const report = JSON.parse(io.readStdout()) as {
        project: { workspaces: { availableCount: number; selected: Array<{ name: string }> } };
        packages: Array<{ name: string }>;
      };

      assert.equal(exitCode, 0);
      assert.equal(report.project.workspaces.availableCount, 1);
      assert.equal(report.project.workspaces.selected[0]?.name, '@fixture/selected');
      assert.deepEqual(
        report.packages.map((item) => item.name),
        ['chosen'],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid concurrency with a CLI exit code', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--concurrency', '0', 'doctor'], { io });

    assert.equal(exitCode, 2);
    assert.match(io.readStderr(), /Concurrency must be an integer from 1 to 32/);
  });

  it('rejects an ambiguous timeout unit', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--timeout', '10', 'doctor'], { io });

    assert.equal(exitCode, 2);
    assert.match(io.readStderr(), /Duration must use ms, s, or m/);
  });

  it('rejects invalid finding presentation filters', async () => {
    const severityIo = createMemoryIo();
    const countIo = createMemoryIo();

    const severityExit = await runCli(['scan', '.', '--severity', 'severe'], { io: severityIo });
    const countExit = await runCli(['scan', '.', '--max-findings', '0'], { io: countIo });

    assert.equal(severityExit, 2);
    assert.match(severityIo.readStderr(), /Severity must be one of/);
    assert.equal(countExit, 2);
    assert.match(countIo.readStderr(), /Maximum findings must be an integer/);
  });

  it('rejects an unknown selected rule', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(
      ['scan', resolve(process.cwd(), '../..'), '--rule', 'unknown/rule'],
      { io },
    );

    assert.equal(exitCode, 2);
    assert.match(io.readStderr(), /Unknown rule ID/);
  });

  it('returns exit code 1 and explains a configured policy violation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-cli-policy-'));
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'cli-policy', dependencies: { missing: '1.0.0' } }),
      );
      await writeFile(
        join(root, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: { '': { dependencies: { missing: '1.0.0' } } },
        }),
      );
      await writeFile(
        join(root, 'pkgwise.config.json'),
        JSON.stringify({
          schemaVersion: 1,
          policy: {
            fail: [
              {
                type: 'finding',
                minimumSeverity: 'medium',
                rules: ['compatibility/unresolved-dependency'],
              },
            ],
          },
        }),
      );
      const io = createMemoryIo();

      const exitCode = await runCli(['scan', root], { io });

      assert.equal(exitCode, 1);
      assert.match(io.readStdout(), /Policy: failed · 1 violations/);
      assert.match(io.readStdout(), /POLICY VIOLATION:/);
      assert.equal(io.readStderr(), '');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('scans OSV remotely and returns exit code 1 for a security policy violation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-cli-osv-policy-'));
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'cli-osv-policy',
          dependencies: { vulnerable: '1.0.0' },
          pkgwise: {
            schemaVersion: 1,
            policy: {
              fail: [
                {
                  type: 'finding',
                  minimumSeverity: 'high',
                  rules: ['security/osv-vulnerability'],
                },
              ],
            },
          },
        }),
      );
      await writeFile(
        join(root, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { vulnerable: '1.0.0' } },
            'node_modules/vulnerable': { version: '1.0.0' },
          },
        }),
      );
      const client = createPkgWise({
        fetch: (async () =>
          new Response(
            JSON.stringify({
              vulns: [
                {
                  id: 'GHSA-cli-test',
                  database_specific: { severity: 'HIGH' },
                },
              ],
            }),
            { status: 200 },
          )) as typeof globalThis.fetch,
      });
      const io = createMemoryIo();

      const exitCode = await runCli(['--no-cache', 'scan', root, '--remote'], { io, client });

      assert.equal(exitCode, 1);
      assert.match(io.readStdout(), /Security: OSV available · 1\/1 coordinates · 1 advisories/);
      assert.match(io.readStdout(), /GHSA-cli-test affects vulnerable@1\.0\.0/);
      assert.match(io.readStdout(), /Policy: failed · 1 violations/);
      assert.equal(io.readStderr(), '');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('honors an explicit --config file over the discovered project file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-cli-config-'));
    const explicit = join(root, 'ci.json');
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'cli-config' }));
      await writeFile(
        join(root, 'pkgwise.config.json'),
        JSON.stringify({ schemaVersion: 1, policy: { minimumOverallCoverage: 1 } }),
      );
      await writeFile(explicit, JSON.stringify({ schemaVersion: 1 }));
      const io = createMemoryIo();

      const exitCode = await runCli(['--config', explicit, '--format', 'json', 'scan', root], {
        io,
      });
      const report = JSON.parse(io.readStdout()) as {
        configuration: { source: string; relativePath: string };
        policy: { status: string; configured: boolean };
      };

      assert.equal(exitCode, 0);
      assert.deepEqual(report.configuration, {
        source: 'explicit-file',
        relativePath: 'ci.json',
        enabledRules: ['compatibility/unresolved-dependency', 'reliability/version-fragmentation'],
        policyConfigured: false,
      });
      assert.deepEqual(report.policy.status, 'passed');
      assert.equal(report.policy.configured, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('explains a finding by fingerprint in terminal mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-cli-explain-'));
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'cli-explain', dependencies: { a: '1.0.0', b: '1.0.0' } }),
      );
      await writeFile(
        join(root, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { a: '1.0.0', b: '1.0.0' } },
            'node_modules/a': { version: '1.0.0', dependencies: { shared: '1.0.0' } },
            'node_modules/b': { version: '1.0.0', dependencies: { shared: '2.0.0' } },
            'node_modules/shared': { version: '1.0.0' },
            'node_modules/b/node_modules/shared': { version: '2.0.0' },
          },
        }),
      );
      const client = createPkgWise();
      const report = await client.analyzeProject({ root });
      const fingerprint = report.findings[0]?.fingerprint;
      assert.ok(fingerprint !== undefined);
      const io = createMemoryIo();

      const exitCode = await runCli(['explain', fingerprint, '--project', root], { io, client });

      assert.equal(exitCode, 0);
      assert.match(io.readStdout(), /PkgWise explanation/);
      assert.match(io.readStdout(), /project -> a@1\.0\.0 -> shared@1\.0\.0/);
      assert.equal(io.readStderr(), '');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('inspects an installed package in terminal mode', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(
      ['inspect', 'typescript@5.9.3', '--project', resolve(process.cwd(), '../..')],
      { io },
    );

    assert.equal(exitCode, 0);
    assert.match(io.readStdout(), /PkgWise inspect · typescript@5\.9\.3/);
    assert.match(io.readStdout(), /project -> typescript@5\.9\.3/);
    assert.equal(io.readStderr(), '');
  });

  it('inspects npm metadata remotely and renders provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkgwise-cli-remote-'));
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'cli-remote' }));
      const client = createPkgWise({
        fetch: (async (input) =>
          String(input).includes('api.osv.dev')
            ? new Response(JSON.stringify({ vulns: [] }), { status: 200 })
            : new Response(
                JSON.stringify({
                  name: 'remote-demo',
                  'dist-tags': { latest: '1.2.3' },
                  versions: Object.fromEntries([
                    ...Array.from({ length: 12 }, (_, index) => [
                      `0.0.${index + 1}`,
                      { version: `0.0.${index + 1}` },
                    ]),
                    ['1.2.3', { version: '1.2.3', license: 'ISC', engines: { node: '>=22' } }],
                  ]),
                }),
                { status: 200 },
              )) as typeof globalThis.fetch,
      });
      const io = createMemoryIo();

      const exitCode = await runCli(['--no-cache', 'inspect', 'remote-demo@latest', '--remote'], {
        io,
        client,
      });

      assert.equal(exitCode, 0);
      assert.match(io.readStdout(), /npm Registry: available · cache miss/);
      assert.match(io.readStdout(), /Selected: remote-demo@1\.2\.3/);
      assert.match(io.readStdout(), /Available versions \(13\): …,/);
      assert.match(io.readStdout(), /License: ISC/);
      assert.equal(io.readStderr(), '');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('compares two installed packages without declaring a winner', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(
      [
        'compare',
        'typescript@5.9.3',
        '@types/node@24.13.3',
        '--project',
        resolve(process.cwd(), '../..'),
        '--metric',
        'footprint',
      ],
      { io },
    );

    assert.equal(exitCode, 0);
    assert.match(io.readStdout(), /PkgWise compare/);
    assert.match(io.readStdout(), /footprint:/);
    assert.match(
      io.readStdout(),
      /no package winner is declared|do not establish an overall winner/,
    );
    assert.equal(io.readStderr(), '');
  });

  it('does not pretend that an unfinished SARIF reporter is valid', async () => {
    const io = createMemoryIo();

    const exitCode = await runCli(['--format', 'sarif', 'doctor'], { io });

    assert.equal(exitCode, 5);
    const output = JSON.parse(io.readStdout()) as { error: { code: string; message: string } };
    assert.equal(output.error.code, 'PW_FEATURE_NOT_IMPLEMENTED');
    assert.match(output.error.message, /SARIF reporting is not implemented/);
  });

  it('renders scan as SARIF and Markdown while focused Markdown remains safe', async () => {
    const root = resolve(process.cwd(), '../..');
    const sarifIo = createMemoryIo();
    const markdownIo = createMemoryIo();
    const doctorIo = createMemoryIo();

    const sarifExit = await runCli(['--format', 'sarif', 'scan', root], { io: sarifIo });
    const markdownExit = await runCli(['--format', 'markdown', 'scan', root], { io: markdownIo });
    const doctorExit = await runCli(['--format', 'markdown', 'doctor'], { io: doctorIo });

    assert.equal(sarifExit, 0);
    const sarif = JSON.parse(sarifIo.readStdout()) as { version: string; runs: unknown[] };
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs.length, 1);
    assert.equal(markdownExit, 0);
    assert.match(markdownIo.readStdout(), /^# PkgWise dependency report/);
    assert.equal(doctorExit, 0);
    assert.match(doctorIo.readStdout(), /^# PkgWise result/);
  });
});
