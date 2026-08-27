import { describe, expect, it } from 'vitest';

import { createSessionStore, DEFAULT_EXPIRY_GUARD_MS } from './session-store';
import type { SessionGrant } from './session-store';

const GRANT: SessionGrant = {
  accessToken: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo',
  expiresInSec: 3_600,
  openId: 'open_abc',
};

function storeAt(clock: { ms: number }) {
  return createSessionStore({ now: () => clock.ms });
}

describe('a store with nothing in it', () => {
  it('has no token, so a request goes out anonymous rather than with a placeholder', () => {
    expect(createSessionStore().bearerToken()).toBeNull();
  });

  /**
   * The whole fail-closed rule in one assertion. There is no guest, no device identity and no
   * remembered `openId`: a client that answers "who is this?" without a server has replaced
   * authentication with a guess, and would then ask the server to sell an episode to nobody.
   */
  it('has no user either', () => {
    expect(createSessionStore().session()).toBeNull();
  });
});

describe('adopting what the server issued', () => {
  it('holds the token and the account it belongs to', () => {
    const clock = { ms: 1_000 };
    const store = storeAt(clock);

    const adopted = store.adopt(GRANT);

    expect(adopted).toEqual({
      ok: true,
      value: { openId: 'open_abc', expiresAtMs: 1_000 + 3_600_000 },
    });
    expect(store.bearerToken()).toBe(GRANT.accessToken);
    expect(store.session()?.openId).toBe('open_abc');
  });

  it('replaces an earlier session rather than accumulating one', () => {
    const store = createSessionStore();
    store.adopt(GRANT);
    store.adopt({ ...GRANT, accessToken: 'second-token', openId: 'open_xyz' });

    expect(store.bearerToken()).toBe('second-token');
    expect(store.session()?.openId).toBe('open_xyz');
  });

  /**
   * A header value cannot hold a space or a control character. A token carrying `\r\n` in a header
   * assembled by hand is request splitting; through `fetch` it is a thrown error at the worst
   * possible moment. Either way it is not a credential, and refusing it here is the only place that
   * can say so before it is sent.
   */
  it('refuses a token that cannot go in a header', () => {
    for (const accessToken of ['', ' ', 'two words', 'tok\r\nX-Injected: 1', 'tok\u0000', 'tök']) {
      const store = createSessionStore();
      expect(store.adopt({ ...GRANT, accessToken }), accessToken).toEqual({
        ok: false,
        error: 'UNUSABLE_TOKEN',
      });
      expect(store.bearerToken(), accessToken).toBeNull();
    }
  });

  it('refuses a session that does not say whose it is', () => {
    const store = createSessionStore();
    expect(store.adopt({ ...GRANT, openId: '' })).toEqual({ ok: false, error: 'UNIDENTIFIED' });
    expect(store.bearerToken()).toBeNull();
  });

  it('refuses a lifetime that is absent, negative or nonsense', () => {
    for (const expiresInSec of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const store = createSessionStore();
      expect(store.adopt({ ...GRANT, expiresInSec }), String(expiresInSec)).toEqual({
        ok: false,
        error: 'EXPIRED_ON_ARRIVAL',
      });
      expect(store.bearerToken()).toBeNull();
    }
  });

  /**
   * Shorter than the guard means it cannot survive the request it would be attached to. Refusing it
   * on arrival is louder than holding a token that reads as absent a moment later, and the caller
   * gets a reason to log.
   */
  it('refuses a lifetime too short to be worth attaching', () => {
    const store = createSessionStore({ expiryGuardMs: 5_000 });
    expect(store.adopt({ ...GRANT, expiresInSec: 4 })).toEqual({
      ok: false,
      error: 'EXPIRED_ON_ARRIVAL',
    });
  });

  it('does not disturb an existing session when a new grant is refused', () => {
    const store = createSessionStore();
    store.adopt(GRANT);
    store.adopt({ ...GRANT, accessToken: 'not a token' });

    expect(store.bearerToken()).toBe(GRANT.accessToken);
  });
});

describe('expiry', () => {
  it('stops handing out a token once the lifetime has run out', () => {
    const clock = { ms: 0 };
    const store = storeAt(clock);
    store.adopt({ ...GRANT, expiresInSec: 60 });

    clock.ms = 30_000;
    expect(store.bearerToken()).toBe(GRANT.accessToken);

    clock.ms = 60_000;
    expect(store.bearerToken()).toBeNull();
    expect(store.session()).toBeNull();
  });

  /**
   * The guard, and the reason for it: a token that dies mid-flight is a `401` on a request the
   * viewer already committed to — and when that request is the coin order, they are told to sign in
   * immediately after tapping "Unlock".
   */
  it('gives up on a token that would expire while the request is in flight', () => {
    const clock = { ms: 0 };
    const store = storeAt(clock);
    store.adopt({ ...GRANT, expiresInSec: 60 });

    clock.ms = 60_000 - DEFAULT_EXPIRY_GUARD_MS;
    expect(store.bearerToken()).toBeNull();
  });

  // Nothing else in the app watches the clock, so "expired" has to mean "dropped": a token with no
  // remaining purpose is a credential waiting to end up in a log line or a bug report.
  it('drops the expired session rather than hiding it', () => {
    const clock = { ms: 0 };
    const store = storeAt(clock);
    store.adopt({ ...GRANT, expiresInSec: 60 });

    clock.ms = 120_000;
    expect(store.session()).toBeNull();

    clock.ms = 0;
    expect(store.bearerToken()).toBeNull();
  });
});

describe('clearing', () => {
  it('leaves nothing behind — no token and no user', () => {
    const store = createSessionStore();
    store.adopt(GRANT);
    store.clear();

    expect(store.bearerToken()).toBeNull();
    expect(store.session()).toBeNull();
  });

  it('is safe to call when there was nothing to clear', () => {
    const store = createSessionStore();
    expect(() => {
      store.clear();
    }).not.toThrow();
    expect(store.bearerToken()).toBeNull();
  });

  it('accepts a fresh session afterwards', () => {
    const store = createSessionStore();
    store.adopt(GRANT);
    store.clear();
    store.adopt({ ...GRANT, accessToken: 'third-token' });

    expect(store.bearerToken()).toBe('third-token');
  });
});
