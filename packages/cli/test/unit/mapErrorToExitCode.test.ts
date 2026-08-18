import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PkgWiseError } from '@lovlydev/pkgwise-core';
import { mapErrorToExitCode } from '../../src/exit/mapErrorToExitCode.js';

describe('mapErrorToExitCode', () => {
  it('maps project errors to exit code 3', () => {
    const error = new PkgWiseError({
      code: 'PW_PROJECT_NOT_FOUND',
      userMessage: 'Project not found.',
      recoverable: false,
    });

    assert.equal(mapErrorToExitCode(error), 3);
  });

  it('maps unknown errors to exit code 5', () => {
    assert.equal(mapErrorToExitCode(new Error('boom')), 5);
  });
});
