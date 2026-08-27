import type { SilentLogin, SilentLoginResult } from './silent-login';

/**
 * What this client does after the server refuses its token, and — more importantly — what it stops
 * doing.
 *
 * C3 wired the first half: a `401` on a request that carried a token drops the token, so the next
 * request is honestly anonymous instead of replaying a credential the server has already refused.
 * Nothing re-acquired one, so a session that died mid-visit stayed dead until the next cold start,
 * and every purchase after that point was refused as `SIGN_IN_REQUIRED` by a client that could have
 * signed itself back in without asking the viewer for anything
 * (`docs/handoff/w7-work-auth-header.md` §5, §8).
 *
 * This is the second half. It is deliberately **not** the refresh-and-replay interceptor IA §8.2
 * describes, and it deviates in two places, both of them refusals:
 *
 * 1. **Nothing is replayed.** The refused request stays refused and its caller renders the failure
 *    it already knows how to render. Replaying is the part that needs care rather than the refresh:
 *    the one `POST` this client makes opens a payment, and a transport that repeats it on its own
 *    is a second thing the viewer can be charged for (`data/http.ts` rule 4). A viewer's own second
 *    press is safe because it carries the same `Idempotency-Key`; an automatic one has no such
 *    guarantee. So the re-acquire buys the *next* request a session, not this one.
 * 2. **The re-acquire is bounded, and it is not bounded by a timer.** A `401` triggers a login and
 *    a login is answered by a `401` on the next request — that is a loop, and a delay between the
 *    turns only slows it down. See `maxAttempts`.
 *
 * There is no store here on purpose. Dropping the dead token belongs to the transport that
 * presented it, and installing a new session belongs to the store's `adopt`; this module holds
 * neither, so the whole of it is the question "may another silent login run now, and what happened
 * when it did".
 */

export const SESSION_RECOVERY_OUTCOMES = [
  /** A silent login ran and the store holds a session again. The refused request is not repeated. */
  'REACQUIRED',
  /** A silent login ran and produced nothing. One unit of budget is gone. */
  'STILL_SIGNED_OUT',
  /** An attempt was already running. This refusal joined it and spent nothing. */
  'ATTEMPT_IN_FLIGHT',
  /** The budget is spent: nothing has worked since the last few attempts, so this one is refused. */
  'BUDGET_SPENT',
  /** This client has no way to obtain an `authCode`, so no number of attempts can change anything. */
  'NO_PLATFORM_LOGIN',
] as const;

export type SessionRecoveryOutcome = (typeof SESSION_RECOVERY_OUTCOMES)[number];

export interface SessionRecoveryResult {
  readonly outcome: SessionRecoveryOutcome;
  /**
   * The login this refusal ran, or `null` when none was made. Diagnostic only, and safe to log: a
   * `SilentLoginResult` carries an outcome, a trace id and a rejection reason, never a credential.
   */
  readonly login: SilentLoginResult | null;
  /** How many automatic attempts remain before only a viewer-initiated sign-in can help. */
  readonly attemptsLeft: number;
}

/**
 * How many automatic re-acquisitions may happen without a single authenticated request working in
 * between.
 *
 * One is needed for the case this exists for — a token that expired mid-visit — and the other two
 * are there because the attempt itself travels over the same network that has just proven it can
 * fail. Three is not a tuned number; it is a small one, and the property that matters is that it is
 * finite (§8.2's silent re-login has no such bound written down anywhere).
 */
export const DEFAULT_MAX_RECOVERY_ATTEMPTS = 3;

export interface SessionRecoveryOptions {
  /**
   * The shared single-flight login. Shared with boot and with the viewer's own retry, because the
   * `authCode` is single-use: two logins spend two codes and the second exchange fails.
   */
  readonly signIn: SilentLogin;
  readonly maxAttempts?: number;
  /**
   * Reporting, not control flow. Nothing here decides anything from the result — a caller logs the
   * outcome, and a later slot may show a banner.
   */
  readonly onRecovery?: (result: SessionRecoveryResult) => void;
}

export interface SessionRecovery {
  /**
   * Wired to the transport's `401` hook. Returns the attempt so a caller that wants the outcome can
   * await one; the transport does not, because awaiting it there is the replay this module refuses.
   *
   * It never rejects. It is called from inside a transport callback whose result nobody holds, so a
   * rejection would surface as an unhandled one.
   */
  credentialRefused(): Promise<SessionRecoveryResult>;
  /**
   * Wired to the transport's "a request that carried a token was accepted" hook. This is the only
   * thing that refills the budget.
   */
  credentialAccepted(): void;
  /** Diagnostic. Nothing branches on it outside the tests. */
  attemptsLeft(): number;
}

export function createSessionRecovery(options: SessionRecoveryOptions): SessionRecovery {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_RECOVERY_ATTEMPTS;

  let attemptsLeft = maxAttempts;
  /**
   * Set once and never unset. `PLATFORM_UNAVAILABLE` means there is no `login` on this client, or
   * the bridge never initialised — a property of the runtime rather than of the credential, and a
   * `401` is not evidence that it has changed.
   */
  let noPlatformLogin = false;
  let inFlight: Promise<SessionRecoveryResult> | null = null;

  const settle = (
    outcome: SessionRecoveryOutcome,
    login: SilentLoginResult | null,
  ): SessionRecoveryResult => {
    const result = { outcome, login, attemptsLeft };
    options.onRecovery?.(result);
    return result;
  };

  const attempt = async (): Promise<SessionRecoveryResult> => {
    let login: SilentLoginResult;
    try {
      login = await options.signIn();
    } catch {
      // A rejection here is a bug in the bridge or the transport, not an outcome silent login
      // publishes. It is reported as a failed attempt and charged to the budget like any other,
      // because the alternative is an unhandled rejection in a `401` handler.
      return settle('STILL_SIGNED_OUT', null);
    }

    if (login.outcome === 'ALREADY_SIGNED_IN') {
      // No code was spent and no exchange was made, so nothing was consumed. This happens when a
      // request that was already on the wire with the old token is refused after a newer attempt
      // has installed a session.
      attemptsLeft = Math.min(attemptsLeft + 1, maxAttempts);
      return settle('REACQUIRED', login);
    }
    if (login.outcome === 'SIGNED_IN') {
      return settle('REACQUIRED', login);
    }
    if (login.outcome === 'PLATFORM_UNAVAILABLE') {
      noPlatformLogin = true;
    }
    return settle('STILL_SIGNED_OUT', login);
  };

  return {
    credentialRefused: () => {
      if (inFlight !== null) {
        // Several requests in flight when a session expires means several `401`s, and they are one
        // event. Joining rather than queueing is what stops a screen with four panels on it from
        // spending four codes and reporting three of them as "the platform rejected you".
        return Promise.resolve(settle('ATTEMPT_IN_FLIGHT', null));
      }
      if (noPlatformLogin) {
        return Promise.resolve(settle('NO_PLATFORM_LOGIN', null));
      }
      if (attemptsLeft <= 0) {
        // The loop this bound exists for: a server that issues tokens and then refuses them would
        // otherwise have this client logging in once per request, forever, with every login
        // "succeeding". Resetting the budget on a successful login would not bound that at all —
        // only a request that the token actually worked on does, which is `credentialAccepted`.
        //
        // Signed out is a state the product already handles: the panel renders `SIGN_IN_REQUIRED`
        // and its retry runs the same silent login, on a viewer's tap rather than on a timer.
        return Promise.resolve(settle('BUDGET_SPENT', null));
      }

      attemptsLeft -= 1;
      const running = attempt().finally(() => {
        inFlight = null;
      });
      inFlight = running;
      return running;
    },

    credentialAccepted: () => {
      // A `2xx` on a request that presented a token is the only proof this client gets that its
      // credential works, which makes it the only honest place to forgive the attempts before it.
      attemptsLeft = maxAttempts;
    },

    attemptsLeft: () => attemptsLeft,
  };
}
