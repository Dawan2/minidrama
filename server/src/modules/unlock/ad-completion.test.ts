import { describe, expect, it } from 'vitest';

import {
  createRefusingCompletionVerifier,
  createReportedCompletionVerifier,
} from './ad-completion.js';

describe('createReportedCompletionVerifier', () => {
  const verifier = createReportedCompletionVerifier();

  it('completes only on isEnded === true', async () => {
    expect(
      await verifier.verify({ sessionId: 'ads_1', userId: 'u', episodeId: 'e', isEnded: true }),
    ).toEqual({
      completed: true,
      isEndedReported: true,
    });
    expect(
      await verifier.verify({ sessionId: 'ads_1', userId: 'u', episodeId: 'e', isEnded: false }),
    ).toEqual({
      completed: false,
      isEndedReported: false,
    });
    expect(
      await verifier.verify({ sessionId: 'ads_1', userId: 'u', episodeId: 'e', isEnded: 'true' }),
    ).toEqual({
      completed: false,
      isEndedReported: null,
    });
    expect(
      await verifier.verify({
        sessionId: 'ads_1',
        userId: 'u',
        episodeId: 'e',
        isEnded: undefined,
      }),
    ).toEqual({
      completed: false,
      isEndedReported: null,
    });
  });
});

describe('createRefusingCompletionVerifier', () => {
  it('refuses a reported completion, so a grant path that skipped the port would fail this', async () => {
    const verdict = await createRefusingCompletionVerifier().verify({
      sessionId: 'ads_1',
      userId: 'u',
      episodeId: 'e',
      isEnded: true,
    });
    expect(verdict).toEqual({ completed: false, isEndedReported: true });
  });
});
