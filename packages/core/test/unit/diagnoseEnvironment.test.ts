import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPkgWise } from '../../src/public/index.js';

describe('diagnoseEnvironment', () => {
  it('reports the runtime and a readable project root', async () => {
    const report = await createPkgWise().diagnose({ root: process.cwd(), offline: true });

    assert.equal(report.schemaVersion, '1');
    assert.equal(
      report.checks.some((check) => check.id === 'runtime/node'),
      true,
    );
    assert.equal(
      report.checks.some((check) => check.id === 'project/root' && check.status === 'pass'),
      true,
    );
  });
});
