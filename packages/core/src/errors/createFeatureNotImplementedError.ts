import { PkgWiseError } from './PkgWiseError.js';

export function createFeatureNotImplementedError(feature: string): PkgWiseError {
  return new PkgWiseError({
    code: 'PW_FEATURE_NOT_IMPLEMENTED',
    userMessage: `${feature} is not implemented in this development build yet.`,
    recoverable: false,
    details: { feature },
  });
}
