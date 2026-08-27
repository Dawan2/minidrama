import { describe, expect, it } from 'vitest';

import { ANONYMOUS, anonymousSession, isSignedIn } from './session';

describe('the session state', () => {
  it('reads a signed-in state only from an authenticated session', () => {
    expect(isSignedIn(ANONYMOUS)).toBe(false);
    expect(isSignedIn({ status: 'AUTHENTICATED', openId: 'open_1' })).toBe(true);
  });
});

describe('the session the app boots with', () => {
  it('is anonymous, because nothing has exchanged a code yet', () => {
    expect(anonymousSession().state).toEqual({ status: 'ANONYMOUS' });
  });

  /**
   * The identity port on the server refuses every auth code until the real platform call lands, so
   * a `signIn` that reported success would put the profile screen into a signed-in state with no
   * session behind it — the fabricated assets area the IA forbids (`docs/02-user-journeys.md`
   * J10-B). A viewer told they are signed in and then shown an empty history has been lied to
   * twice.
   */
  it('reports failure rather than pretending to sign anyone in', async () => {
    await expect(anonymousSession().signIn()).resolves.toBe(false);
  });

  // Every caller is a button on a screen the viewer is looking at. A rejection there is an
  // unhandled promise and, in the worst case, a blank screen.
  it('never rejects', async () => {
    const session = anonymousSession();
    const outcomes = await Promise.all([session.signIn(), session.signIn()]);
    expect(outcomes).toEqual([false, false]);
  });
});
