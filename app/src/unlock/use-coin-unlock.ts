import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_UNLOCK_PACING, runCoinUnlock } from './coin-unlock';
import { newIdempotencyKey } from './idempotency';
import type { CoinUnlockOutcome, CoinUnlockStage, UnlockPacing } from './coin-unlock';
import type { PlatformBridge } from '../platform/types';
import type { UnlockApi } from '../data/unlock-api';

/**
 * `runCoinUnlock` published into React state, and nothing else.
 *
 * The three things it does that are genuinely the hook's business rather than the flow's:
 *
 * 1. **One attempt at a time.** A double tap on a purchase button is the cheapest way to open two
 *    payments, and a `disabled` attribute is not a guarantee — the second press lands before the
 *    re-render. The guard is a ref, checked before anything asynchronous starts.
 * 2. **One key per attempt, kept across retries.** Reusing it is what makes "try again" return the
 *    existing order rather than mint a second payable one. It is replaced only when the server says
 *    the key itself was the problem.
 * 3. **A closed panel stops the flow.** Otherwise abandoning a purchase leaves a poll loop holding
 *    timers for the next minute and calling `setState` on a component that is gone.
 */

export type CoinUnlockSettlement = Exclude<CoinUnlockOutcome, { kind: 'ABANDONED' }>;

export type CoinUnlockState =
  /** Nothing has been asked of the server. The panel is showing the offer. */
  | { readonly status: 'OFFERED' }
  | { readonly status: 'RUNNING'; readonly stage: CoinUnlockStage }
  | { readonly status: 'SETTLED'; readonly outcome: CoinUnlockSettlement };

export interface CoinUnlockOptions {
  readonly api: UnlockApi;
  readonly bridge: PlatformBridge;
  readonly episodeId: string;
  /**
   * Called when the server's answer about this episode may have changed — a grant, or an episode
   * the viewer turned out to already own. The caller refetches; it never patches the episode it
   * has, because `viewerAccess` is the server's answer and a locally edited one is a client-side
   * entitlement decision under a different name.
   */
  readonly onEntitlementChanged: () => void;
  readonly pacing?: UnlockPacing;
}

export interface CoinUnlockHandle {
  readonly state: CoinUnlockState;
  /** Begins, or retries, the one attempt this panel session is allowed to have in flight. */
  readonly start: () => void;
}

export function useCoinUnlock(options: CoinUnlockOptions): CoinUnlockHandle {
  const { api, bridge, episodeId, onEntitlementChanged, pacing } = options;

  const [state, setState] = useState<CoinUnlockState>({ status: 'OFFERED' });

  const idempotencyKey = useRef<string | null>(null);
  const running = useRef(false);
  const abandoned = useRef(false);

  useEffect(() => {
    abandoned.current = false;
    return () => {
      abandoned.current = true;
    };
  }, []);

  const start = useCallback(() => {
    if (running.current) {
      return;
    }
    running.current = true;
    idempotencyKey.current ??= newIdempotencyKey();
    setState({ status: 'RUNNING', stage: 'ORDERING' });

    void (async () => {
      let outcome: CoinUnlockOutcome;
      try {
        outcome = await runCoinUnlock({
          api,
          bridge,
          episodeId,
          idempotencyKey: idempotencyKey.current ?? newIdempotencyKey(),
          pacing: pacing ?? DEFAULT_UNLOCK_PACING,
          onStage: (stage) => {
            if (!abandoned.current) {
              setState({ status: 'RUNNING', stage });
            }
          },
          abandoned: () => abandoned.current,
        });
      } catch {
        // Nothing in the flow is supposed to throw — every failure below it is a value. If one
        // escapes anyway it must not become an unhandled rejection, which inside a WebView is a
        // spinner that never resolves and no console to read it in.
        outcome = { kind: 'FAILED', reason: 'REFUSED', retry: 'NONE', failure: null };
      } finally {
        running.current = false;
      }

      if (abandoned.current || outcome.kind === 'ABANDONED') {
        return;
      }

      if (outcome.kind === 'FAILED' && outcome.retry === 'FRESH_KEY') {
        idempotencyKey.current = newIdempotencyKey();
      }

      if (outcome.kind === 'UNLOCKED' || outcome.kind === 'ALREADY_UNLOCKED') {
        onEntitlementChanged();
      }

      setState({ status: 'SETTLED', outcome });
    })();
  }, [api, bridge, episodeId, onEntitlementChanged, pacing]);

  return { state, start };
}
