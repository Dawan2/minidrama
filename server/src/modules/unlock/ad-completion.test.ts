import { describe, expect, it } from 'vitest';

import { createReportedCompletionVerifier } from './ad-completion.js';

describe('createReportedCompletionVerifier', () => {
  const verifier = createReportedCompletionVerifier();

  it('treats only the boolean true as a completed view', () => {
    expect(verifier.verify({ isEnded: true })).toBe('COMPLETED');
    expect(verifier.verify({ isEnded: false })).toBe('NOT_COMPLETED');
  });
});
