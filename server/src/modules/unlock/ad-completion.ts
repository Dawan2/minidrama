/**
 * Whether a rewarded-ad close is complete enough to grant an episode.
 *
 * There is no platform server-side verification callback (U-18). The client reports `isEnded`
 * from `onClose`, and that boolean is the only signal the SDK gives us. Granting from the
 * HTTP body alone — `if (body.isEnded) writeUnlock()` — is the fraud path C4-08 exists to
 * close: a modified client posts `{ isEnded: true }` without showing an ad.
 *
 * The replaceable verifier is the isolation AC-4 asked for. The default implementation still
 * reads the reported flag, because nothing else exists, but it is a named decision behind an
 * interface: a later slot can plug in a stricter check without the route growing a second
 * grant path. Tests inject a verifier that refuses even when `isEnded` is true, which is what
 * makes "never grant from the client event alone" a failing fixture rather than a comment.
 */

export type AdCompletionVerdict = 'COMPLETED' | 'NOT_COMPLETED';

export interface AdCompletionInput {
  /** The boolean the client claims came from the SDK close callback. */
  readonly isEnded: boolean;
}

export interface AdCompletionVerifier {
  verify(input: AdCompletionInput): AdCompletionVerdict;
}

/**
 * The default: `isEnded === true` is complete, everything else is not.
 *
 * Strict equality, not truthiness. `"true"`, `1`, and a missing field have already been
 * rejected at the HTTP edge; this function only ever sees a boolean, and `false` is the skip.
 */
export function createReportedCompletionVerifier(): AdCompletionVerifier {
  return {
    verify(input) {
      return input.isEnded === true ? 'COMPLETED' : 'NOT_COMPLETED';
    },
  };
}
