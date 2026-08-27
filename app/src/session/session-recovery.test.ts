import { describe, expect, it, vi } from 'vitest';

import { apiFailure } from '../data/failure';
import { createSessionRecovery, DEFAULT_MAX_RECOVERY_ATTEMPTS } from './session-recovery';
import type { SessionRecoveryOptions, SessionRecoveryResult } from './session-recovery';
import type { SilentLogin, SilentLoginOutcome, SilentLoginResult } from './silent-login';

function loginResult(outcome: SilentLoginOutcome): SilentLoginResult {
  return { outcome, failure: null, rejection: null };
}

/** A login that answers the given outcomes in order, repeating the last one forever. */
function loginAnswering(...outcomes: readonly SilentLoginOutcome[]): SilentLogin {
  let call = 0;
  return vi.fn(() => {
    const outcome = outcomes[Math.min(call, outcomes.length - 1)] ?? 'SIGNED_IN';
    call += 1;
    return Promise.resolve(loginResult(outcome));
  });
}

function recovery(overrides: Partial<SessionRecoveryOptions> = {}) {
  const options: SessionRecoveryOptions = { signIn: loginAnswering('SIGNED_IN'), ...overrides };
  return { ...createSessionRecovery(options), signIn: options.signIn };
}

describe('re-acquiring a session after the server refused the token', () => {
  it('runs a silent login and reports the session it got back', async () => {
    const wired = recovery();

    const result = await wired.credentialRefused();

    expect(result.outcome).toBe('REACQUIRED');
    expect(wired.signIn).toHaveBeenCalledTimes(1);
  });

  it('reports a login that ran and produced nothing', async () => {
    const wired = recovery({ signIn: loginAnswering('CODE_REJECTED') });

    const result = await wired.credentialRefused();

    expect(result.outcome).toBe('STILL_SIGNED_OUT');
    expect(result.login?.outcome).toBe('CODE_REJECTED');
  });

  /**
   * A session that expires while four panels are on screen is four `401`s and one event. Queueing
   * them would spend four `authCode`s — each single-use, so the last three exchanges fail and get
   * reported as "the platform rejected you".
   */
  it('folds the refusals that arrive while an attempt is running into that attempt', async () => {
    let release = (): void => {};
    const signIn = vi.fn<SilentLogin>(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(loginResult('SIGNED_IN'));
          };
        }),
    );
    const wired = recovery({ signIn });

    const first = wired.credentialRefused();
    const joined = await Promise.all([wired.credentialRefused(), wired.credentialRefused()]);
    release();

    expect((await first).outcome).toBe('REACQUIRED');
    expect(joined.map((result) => result.outcome)).toEqual([
      'ATTEMPT_IN_FLIGHT',
      'ATTEMPT_IN_FLIGHT',
    ]);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('lets the next refusal try again once the attempt has settled', async () => {
    const wired = recovery({ signIn: loginAnswering('UNREACHABLE', 'SIGNED_IN') });

    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect((await wired.credentialRefused()).outcome).toBe('REACQUIRED');
    expect(wired.signIn).toHaveBeenCalledTimes(2);
  });

  /**
   * The refusal can arrive from a request that was already on the wire with the old token, after a
   * newer attempt has already installed a session. No code was spent answering it, so no budget was
   * either — otherwise a burst of stragglers would exhaust the budget for a session that is fine.
   */
  it('charges nothing for a refusal that found a session already held', async () => {
    const wired = recovery({ signIn: loginAnswering('ALREADY_SIGNED_IN') });

    const result = await wired.credentialRefused();

    expect(result.outcome).toBe('REACQUIRED');
    expect(wired.attemptsLeft()).toBe(DEFAULT_MAX_RECOVERY_ATTEMPTS);
  });
});

/**
 * The whole reason this module is not two lines in `transports.ts`.
 *
 * A `401` provokes a login and a login is followed by a request that can be answered `401`, so
 * "re-acquire on a refused token" is a loop with nothing in it to stop. The bound is a budget, and
 * the only thing that refills it is evidence that a token *worked* — because a server that issues
 * tokens and then refuses them keeps every login successful, and a budget reset by a successful
 * login would bound nothing at all.
 */
describe('the bound on automatic attempts', () => {
  it('stops after the budget is spent, and stops calling login', async () => {
    const wired = recovery({ signIn: loginAnswering('UNREACHABLE'), maxAttempts: 2 });

    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect((await wired.credentialRefused()).outcome).toBe('BUDGET_SPENT');
    expect((await wired.credentialRefused()).outcome).toBe('BUDGET_SPENT');
    expect(wired.signIn).toHaveBeenCalledTimes(2);
    expect(wired.attemptsLeft()).toBe(0);
  });

  /**
   * The loop that matters, and the one a "reset on a successful login" bound would miss entirely:
   * every login here succeeds and every request is still refused.
   */
  it('cannot loop against a server that issues tokens and then refuses them', async () => {
    const wired = recovery({ signIn: loginAnswering('SIGNED_IN'), maxAttempts: 3 });

    const outcomes: SessionRecoveryResult['outcome'][] = [];
    for (let refusal = 0; refusal < 12; refusal += 1) {
      outcomes.push((await wired.credentialRefused()).outcome);
    }

    expect(outcomes.filter((outcome) => outcome === 'REACQUIRED')).toHaveLength(3);
    expect(outcomes.at(-1)).toBe('BUDGET_SPENT');
    expect(wired.signIn).toHaveBeenCalledTimes(3);
  });

  it('refills the budget when a request that carried a token was accepted', async () => {
    const wired = recovery({ signIn: loginAnswering('UNREACHABLE'), maxAttempts: 1 });

    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect((await wired.credentialRefused()).outcome).toBe('BUDGET_SPENT');

    wired.credentialAccepted();

    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect(wired.signIn).toHaveBeenCalledTimes(2);
  });

  it('never refills past the budget, so accepted requests cannot bank attempts', async () => {
    const wired = recovery({ maxAttempts: 2 });

    for (let accepted = 0; accepted < 10; accepted += 1) {
      wired.credentialAccepted();
    }

    expect(wired.attemptsLeft()).toBe(2);
  });

  /**
   * `PLATFORM_UNAVAILABLE` is a property of the runtime — there is no `login` on this client, or the
   * bridge never initialised — and a `401` is not evidence that it has changed. Spending the rest of
   * the budget discovering that again is a bridge call per request for nothing.
   */
  it('gives up permanently when the platform cannot log in at all', async () => {
    const wired = recovery({ signIn: loginAnswering('PLATFORM_UNAVAILABLE') });

    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect((await wired.credentialRefused()).outcome).toBe('NO_PLATFORM_LOGIN');
    expect(wired.signIn).toHaveBeenCalledTimes(1);
  });

  it('stays given up even after a request succeeds', async () => {
    const wired = recovery({ signIn: loginAnswering('PLATFORM_UNAVAILABLE') });

    await wired.credentialRefused();
    wired.credentialAccepted();

    expect((await wired.credentialRefused()).outcome).toBe('NO_PLATFORM_LOGIN');
    expect(wired.signIn).toHaveBeenCalledTimes(1);
  });

  // A platform that *refused* is a different thing: a cancelled or timed-out SDK call can work on
  // the next one, so it costs a unit of budget rather than the whole feature.
  it('keeps trying after a platform that merely refused', async () => {
    const wired = recovery({ signIn: loginAnswering('PLATFORM_REFUSED'), maxAttempts: 2 });

    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect((await wired.credentialRefused()).outcome).toBe('STILL_SIGNED_OUT');
    expect(wired.signIn).toHaveBeenCalledTimes(2);
  });
});

/**
 * The transport calls this from inside a `401` handler and discards the promise, so a rejection
 * would land as an unhandled one — in a WebView, where nobody sees it and the app is already in its
 * least happy state.
 */
describe('the refusal handler as the transport uses it', () => {
  it('does not reject when the login itself throws', async () => {
    const wired = recovery({
      signIn: vi.fn(() => Promise.reject(new Error('the bridge exploded'))),
    });

    const result = await wired.credentialRefused();

    expect(result.outcome).toBe('STILL_SIGNED_OUT');
    expect(result.login).toBeNull();
  });

  it('charges a thrown login to the budget like any other failure', async () => {
    const wired = recovery({
      signIn: vi.fn(() => Promise.reject(new Error('the bridge exploded'))),
      maxAttempts: 1,
    });

    await wired.credentialRefused();

    expect((await wired.credentialRefused()).outcome).toBe('BUDGET_SPENT');
  });

  it('clears the in-flight attempt after a throw, rather than folding every later refusal', async () => {
    const signIn = vi
      .fn<SilentLogin>()
      .mockRejectedValueOnce(new Error('the bridge exploded'))
      .mockResolvedValueOnce(loginResult('SIGNED_IN'));
    const wired = recovery({ signIn });

    await wired.credentialRefused();

    expect((await wired.credentialRefused()).outcome).toBe('REACQUIRED');
  });
});

describe('what the recovery reports', () => {
  it('reports every outcome, including the ones that ran nothing', async () => {
    const onRecovery = vi.fn();
    const wired = recovery({
      signIn: loginAnswering('UNREACHABLE'),
      maxAttempts: 1,
      onRecovery,
    });

    await wired.credentialRefused();
    await wired.credentialRefused();

    expect(onRecovery.mock.calls.map((call) => (call[0] as SessionRecoveryResult).outcome)).toEqual(
      ['STILL_SIGNED_OUT', 'BUDGET_SPENT'],
    );
  });

  it('says how many attempts are left, so a log line can show the budget draining', async () => {
    const seen: number[] = [];
    const wired = recovery({
      signIn: loginAnswering('UNREACHABLE'),
      maxAttempts: 3,
      onRecovery: (result) => {
        seen.push(result.attemptsLeft);
      },
    });

    await wired.credentialRefused();
    await wired.credentialRefused();

    expect(seen).toEqual([2, 1]);
  });

  /**
   * The result is handed to a `console.warn` in `main.tsx`, and a console in a WebView is not a
   * private place. A `SilentLoginResult` carries a status and a trace id for exactly that reason —
   * the `authCode` and the token stay in the modules that hold them.
   */
  it('carries a failure for the log without carrying a credential', async () => {
    const failure = apiFailure({
      kind: 'HTTP',
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'rejected',
      traceId: 'trace_1',
    });
    const wired = recovery({
      signIn: vi.fn(() =>
        Promise.resolve({ outcome: 'CODE_REJECTED' as const, failure, rejection: null }),
      ),
    });

    const result = await wired.credentialRefused();

    expect(result.login?.failure).toMatchObject({ status: 401, traceId: 'trace_1' });
    expect(JSON.stringify(result)).not.toMatch(/token|authCode/i);
  });
});
