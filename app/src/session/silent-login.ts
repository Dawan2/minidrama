import { classifyFailure } from '../data/failure';
import type { ApiFailure } from '../data/failure';
import type { PlatformBridge } from '../platform/types';
import type { SessionApi } from '../data/session-api';
import type { SessionRejection, SessionStore } from './session-store';

/**
 * Silent login: bridge code → server exchange → the store. The one path by which this client
 * acquires a credential.
 *
 * It is a plain async function for the same reason `runCoinUnlock` is one — the parts that decide
 * who the viewer is should be assertable without a DOM, a router or a render.
 *
 * **Every failure ends signed out.** There is no fallback identity, no cached openId, no retry with
 * a synthesised code. The outcomes below exist to be *reported* (a log line at boot, a sentence in
 * a panel later), never to be worked around: a client that answers "the platform would not identify
 * you" by inventing a viewer has replaced authentication with a guess, and the server would then
 * be asked to sell an episode to nobody.
 */

export const SILENT_LOGIN_OUTCOMES = [
  'SIGNED_IN',
  /** A session was already held. No code was spent. */
  'ALREADY_SIGNED_IN',
  /** No `login` on this client, or the bridge is not initialised. Nothing to exchange. */
  'PLATFORM_UNAVAILABLE',
  /** The SDK refused or timed out. Retryable later; nothing is retried here. */
  'PLATFORM_REFUSED',
  /** The exchange never reached the server, or the server faulted. */
  'UNREACHABLE',
  /** The server refused the code: expired, spent, or issued to another client key. */
  'CODE_REJECTED',
  /** A `2xx` the store would not accept. Our bug or the server's, never the viewer's. */
  'SESSION_UNUSABLE',
] as const;

export type SilentLoginOutcome = (typeof SILENT_LOGIN_OUTCOMES)[number];

export interface SilentLoginResult {
  readonly outcome: SilentLoginOutcome;
  /** Present when the server answered. Diagnostic only — it carries a trace id, not display copy. */
  readonly failure: ApiFailure | null;
  /** Present when the grant itself was refused, so the log says which field was wrong. */
  readonly rejection: SessionRejection | null;
}

export interface SilentLoginDeps {
  /** Narrowed to the two methods used, so this cannot reach for `pay` or the player. */
  readonly bridge: Pick<PlatformBridge, 'canIUse' | 'login'>;
  readonly api: SessionApi;
  readonly store: SessionStore;
}

export async function runSilentLogin(deps: SilentLoginDeps): Promise<SilentLoginResult> {
  if (deps.store.bearerToken() !== null) {
    return result('ALREADY_SIGNED_IN');
  }

  // The capability check is the platform contract: calling a method an older TikTok client does not
  // have is the classic mini-app crash, so it is asked before every dispatch (system-overview §3.3).
  if (!deps.bridge.canIUse('login')) {
    return result('PLATFORM_UNAVAILABLE');
  }

  const code = await deps.bridge.login();
  if (!code.ok) {
    return result(
      code.error.code === 'BRIDGE_UNSUPPORTED' || code.error.code === 'BRIDGE_NOT_READY'
        ? 'PLATFORM_UNAVAILABLE'
        : 'PLATFORM_REFUSED',
    );
  }

  const exchanged = await deps.api.exchangeAuthCode(code.value.authCode);
  if (!exchanged.ok) {
    return { ...refusedExchange(exchanged.error), rejection: null };
  }

  const adopted = deps.store.adopt(exchanged.value);
  if (!adopted.ok) {
    // The store already refused it, so there is nothing to clean up. Reported rather than swallowed
    // because "the server issued a session this client cannot use" is an alert, not a user problem.
    return { outcome: 'SESSION_UNUSABLE', failure: null, rejection: adopted.error };
  }

  return result('SIGNED_IN');
}

/**
 * Runs silent login at most once at a time.
 *
 * The `authCode` is single-use. Two concurrent logins spend two codes and the second exchange
 * fails, which would then be reported as "the platform rejected you" — so callers share one
 * in-flight attempt instead. Boot is one caller; a `401`-driven re-login is the next.
 */
export function createSilentLogin(deps: SilentLoginDeps): () => Promise<SilentLoginResult> {
  let inFlight: Promise<SilentLoginResult> | null = null;

  return () => {
    if (inFlight !== null) {
      return inFlight;
    }
    const attempt = runSilentLogin(deps).finally(() => {
      inFlight = null;
    });
    inFlight = attempt;
    return attempt;
  };
}

/**
 * Why the exchange did not produce a session.
 *
 * `401` is read off the status rather than the error code: the code is `AUTH_REQUIRED` today, and
 * the difference between "expired", "already spent" and "wrong client key" is deliberately not
 * disclosed by the endpoint. A `502 AUTH_PROVIDER_ERROR` is ours to fix and classifies as
 * retryable, which is why it lands in `UNREACHABLE` alongside a dead network — the viewer's
 * situation is identical and neither is their fault.
 *
 * A `400` is our own bug — a provider the server does not support — and it lands in `CODE_REJECTED`
 * with the refusals, because the property that matters to a caller is the same: no session exists
 * and presenting this code again cannot change that.
 */
function refusedExchange(failure: ApiFailure): Omit<SilentLoginResult, 'rejection'> {
  if (failure.kind !== 'HTTP') {
    return { outcome: 'UNREACHABLE', failure };
  }
  if (failure.status === 401) {
    return { outcome: 'CODE_REJECTED', failure };
  }
  return classifyFailure(failure).kind === 'RETRYABLE'
    ? { outcome: 'UNREACHABLE', failure }
    : { outcome: 'CODE_REJECTED', failure };
}

function result(outcome: SilentLoginOutcome): SilentLoginResult {
  return { outcome, failure: null, rejection: null };
}
