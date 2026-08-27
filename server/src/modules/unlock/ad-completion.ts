/**
 * Whether a rewarded-ad showing completed, as far as this process can tell.
 *
 * Official docs do not publish a server-side verification callback (U-18). The default therefore
 * trusts the client's `isEnded` boolean — and *only* that boolean, not a truthy payload, not a
 * missing field defaulted to true. The port exists so a later verifier can refuse a showing the
 * client claimed, which is the fraud control C4-08 actually asks for: the client event alone is
 * never enough to write an unlock row.
 */

export interface AdCompletionInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly episodeId: string;
  /** What the client reported. Absent or non-boolean is not a completion. */
  readonly isEnded: unknown;
}

export interface AdCompletionVerdict {
  readonly completed: boolean;
  /** The boolean that was actually reported, for the reward log. `null` if it was not a boolean. */
  readonly isEndedReported: boolean | null;
}

export interface AdCompletionVerifier {
  verify(input: AdCompletionInput): Promise<AdCompletionVerdict>;
}

/**
 * The default: `isEnded === true` is a completion, everything else is not. A wrapper that ignores
 * `isEnded` and always returns true would be the C4-08 regression.
 */
export function createReportedCompletionVerifier(): AdCompletionVerifier {
  return {
    async verify(input) {
      const isEndedReported = typeof input.isEnded === 'boolean' ? input.isEnded : null;
      return {
        completed: isEndedReported === true,
        isEndedReported,
      };
    },
  };
}

/** Test double: even a reported completion is not one. Proves the grant path consults the port. */
export function createRefusingCompletionVerifier(): AdCompletionVerifier {
  return {
    async verify(input) {
      return {
        completed: false,
        isEndedReported: typeof input.isEnded === 'boolean' ? input.isEnded : null,
      };
    },
  };
}
