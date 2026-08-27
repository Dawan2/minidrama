import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import {
  createInMemorySessionStore,
  generateSessionToken,
  sessionFingerprint,
  type SessionStore,
  type SessionStoreOptions,
} from './session-store.js';
import { createSqliteSessionStore } from './sqlite-session-store.js';

/**
 * The five assertions the deleted `session.test.ts` made about issuance — opacity, non-derivation,
 * uniqueness, url-safety and the absence of a refresh token — are preserved verbatim in the first
 * block below, because they were about the token and the token has not changed. Everything after
 * them is about the half that did not exist: resolution.
 *
 * Both implementations run the same suite. The in-memory map is the default; sqlite is what
 * `DATABASE_URL=sqlite:<path>` puts behind the interface.
 */

const HOUR_MS = 60 * 60 * 1000;

/** A clock the tests move by hand. Sessions expire on time or they do not expire at all. */
function stoppedClock(startMs = Date.parse('2026-08-27T10:00:00.000Z')) {
  let nowMs = startMs;

  return {
    now: () => nowMs,
    advanceMs: (ms: number) => {
      nowMs += ms;
    },
  };
}

interface StoreHandle {
  readonly store: SessionStore;
  close(): void;
}

const backends: ReadonlyArray<readonly [string, (options?: SessionStoreOptions) => StoreHandle]> = [
  [
    'in-memory',
    (options) => ({ store: createInMemorySessionStore(options), close: () => undefined }),
  ],
  [
    'sqlite',
    (options) => {
      const db = openMigratedSqlite(':memory:');
      return { store: createSqliteSessionStore(db, options), close: () => db.close() };
    },
  ],
];

describe.each(backends)('SessionStore (%s)', (_label, open) => {
  const handles: StoreHandle[] = [];

  function store(options?: SessionStoreOptions): SessionStore {
    const handle = open(options);
    handles.push(handle);
    return handle.store;
  }

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  describe('issuing a session', () => {
    it('issues an opaque token with a lifetime', () => {
      const session = store({ ttlSec: 900 }).issue('usr_abc');

      expect(session.expiresInSec).toBe(900);
      expect(session.accessToken.length).toBeGreaterThanOrEqual(32);
    });

    // A token that carries the user identifier without a signature is a token an attacker can build.
    it('does not derive the token from the user id', () => {
      const session = store().issue('usr_abc');

      expect(session.accessToken).not.toContain('usr_abc');
      expect(Buffer.from(session.accessToken, 'base64url').toString('utf8')).not.toContain(
        'usr_abc',
      );
    });

    it('issues a different token every time, including for the same user', () => {
      const sessions = store();
      const tokens = new Set([1, 2, 3, 4, 5].map(() => sessions.issue('usr_abc').accessToken));

      expect(tokens.size).toBe(5);
    });

    it('emits a url-safe token, since it travels in headers', () => {
      expect(store().issue('usr_abc').accessToken).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    // Minis keeps the access token in memory and re-runs silent login when it expires, so there is no
    // refresh token to hand out and no long-lived credential on the client.
    it('issues no refresh token', () => {
      expect(Object.keys(store().issue('usr_abc'))).toEqual(['accessToken', 'expiresInSec']);
    });

    it('defaults to an hour, the short lifetime the contract asks for', () => {
      expect(store().issue('usr_abc').expiresInSec).toBe(3600);
    });

    // A session bound to nobody resolves to a viewer id the rest of the system would treat as a user,
    // and every unlock and progress row written under it would belong to one shared phantom account.
    it('refuses to bind a session to an empty user id', () => {
      expect(() => store().issue('')).toThrow(/bound to a user id/);
    });

    it('stores nothing when it refuses to issue', () => {
      const sessions = store();

      expect(() => sessions.issue('')).toThrow();
      expect(sessions.liveSessions).toBe(0);
    });
  });

  describe('resolving a session', () => {
    it('resolves a token it issued to the user it was issued for', () => {
      const sessions = store();
      const session = sessions.issue('usr_fx_vip_active');

      expect(sessions.resolve(session.accessToken)).toEqual({
        ok: true,
        value: 'usr_fx_vip_active',
      });
    });

    it('keeps two users apart', () => {
      const sessions = store();
      const first = sessions.issue('usr_one');
      const second = sessions.issue('usr_two');

      expect(sessions.resolve(first.accessToken)).toEqual({ ok: true, value: 'usr_one' });
      expect(sessions.resolve(second.accessToken)).toEqual({ ok: true, value: 'usr_two' });
    });

    // Two devices, two sessions, one account. Issuing again must not invalidate the first token.
    it('holds several live sessions for one user', () => {
      const sessions = store();
      const phone = sessions.issue('usr_abc');
      const tablet = sessions.issue('usr_abc');

      expect(sessions.resolve(phone.accessToken)).toEqual({ ok: true, value: 'usr_abc' });
      expect(sessions.resolve(tablet.accessToken)).toEqual({ ok: true, value: 'usr_abc' });
      expect(sessions.liveSessions).toBe(2);
    });

    it.each(['', 'not-a-token', 'fxt_usr_fx_vip_active'])(
      'refuses the token %o it never issued',
      (token) => {
        expect(store().resolve(token)).toEqual({
          ok: false,
          error: 'SESSION_UNKNOWN',
        });
      },
    );

    // The nearest miss there is: a token one character off a live one must not resolve.
    it('refuses a token that is a live token with one character changed', () => {
      const sessions = store({ generateToken: () => 'tokenAAAA' });
      sessions.issue('usr_abc');

      expect(sessions.resolve('tokenAAAB')).toEqual({ ok: false, error: 'SESSION_UNKNOWN' });
    });

    it('reports an expired session as expired rather than as unknown', () => {
      const clock = stoppedClock();
      const sessions = store({ ttlSec: 3600, now: clock.now });
      const session = sessions.issue('usr_abc');

      clock.advanceMs(HOUR_MS + 1);

      expect(sessions.resolve(session.accessToken)).toEqual({
        ok: false,
        error: 'SESSION_EXPIRED',
      });
    });

    // The boundary is the expiry instant itself: a session is live up to it and gone at it.
    it('is live one millisecond before its expiry and gone at it', () => {
      const clock = stoppedClock();
      const sessions = store({ ttlSec: 3600, now: clock.now });
      const session = sessions.issue('usr_abc');

      clock.advanceMs(HOUR_MS - 1);
      expect(sessions.resolve(session.accessToken).ok).toBe(true);

      clock.advanceMs(1);
      expect(sessions.resolve(session.accessToken)).toEqual({
        ok: false,
        error: 'SESSION_EXPIRED',
      });
    });

    // No sliding expiry. A session's lifetime is fixed at issuance, so "logged in for an hour" is a
    // statement about the session rather than about how often the client happened to call.
    it('does not extend a session by reading it', () => {
      const clock = stoppedClock();
      const sessions = store({ ttlSec: 3600, now: clock.now });
      const session = sessions.issue('usr_abc');

      const reads = [1, 2, 3, 4, 5, 6].map(() => {
        clock.advanceMs(HOUR_MS / 6);
        return sessions.resolve(session.accessToken);
      });

      expect(reads.slice(0, 5).map((read) => read.ok)).toEqual([true, true, true, true, true]);
      expect(reads.at(-1)).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
    });

    it('drops an expired session rather than keeping it around', () => {
      const clock = stoppedClock();
      const sessions = store({ ttlSec: 3600, now: clock.now });
      sessions.issue('usr_abc');

      clock.advanceMs(HOUR_MS);

      expect(sessions.liveSessions).toBe(0);
    });
  });

  describe('revoking a session', () => {
    it('makes the token unresolvable', () => {
      const sessions = store();
      const session = sessions.issue('usr_abc');

      sessions.revoke(session.accessToken);

      expect(sessions.resolve(session.accessToken)).toEqual({
        ok: false,
        error: 'SESSION_UNKNOWN',
      });
    });

    it('leaves the same user\u2019s other sessions alone, so one logout is not all of them', () => {
      const sessions = store();
      const phone = sessions.issue('usr_abc');
      const tablet = sessions.issue('usr_abc');

      sessions.revoke(phone.accessToken);

      expect(sessions.resolve(tablet.accessToken)).toEqual({ ok: true, value: 'usr_abc' });
    });

    // A logout that arrives twice, or for a token that was never valid, is not an error.
    it('is idempotent and tolerates a token it does not hold', () => {
      const sessions = store();
      const session = sessions.issue('usr_abc');

      expect(() => {
        sessions.revoke(session.accessToken);
        sessions.revoke(session.accessToken);
        sessions.revoke('never-issued');
      }).not.toThrow();
    });
  });

  describe('the store is keyed by a fingerprint, not by the token', () => {
    /**
     * A dump of this map — a heap snapshot, a debug log, a future table dump — must not yield
     * usable bearer credentials.
     */
    it('holds no key that could be presented as a token', () => {
      const sessions = store({ generateToken: () => 'tok_secret_value' });
      sessions.issue('usr_abc');

      expect(sessions.fingerprints()).toEqual([sessionFingerprint('tok_secret_value')]);
      expect(sessions.fingerprints()).not.toContain('tok_secret_value');
    });

    it('holds no key that resolves as a token, so a leaked key is not a session', () => {
      const sessions = store();
      sessions.issue('usr_abc');

      for (const fingerprint of sessions.fingerprints()) {
        expect(sessions.resolve(fingerprint)).toEqual({ ok: false, error: 'SESSION_UNKNOWN' });
      }
    });

    it('never puts a token in the error it throws', () => {
      const sessions = store({ generateToken: () => 'tok_secret_value' });
      sessions.issue('usr_abc');

      let message = '';
      try {
        sessions.issue('');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).not.toBe('');
      expect(message).not.toContain('tok_secret_value');
    });
  });

  describe('the store has a ceiling', () => {
    /**
     * An unbounded session table is a memory-exhaustion target for anything that can drive
     * issuance. The limit evicts rather than refusing: being logged out costs one silent login, while
     * refusing to issue would turn a flood into an outage for everyone.
     */
    it('never grows past its ceiling', () => {
      const sessions = store({ maxSessions: 3 });

      for (let i = 0; i < 50; i += 1) sessions.issue(`usr_${i}`);

      expect(sessions.liveSessions).toBe(3);
    });

    it('evicts the oldest session and keeps the newest', () => {
      const sessions = store({ maxSessions: 2 });
      const first = sessions.issue('usr_one');
      const second = sessions.issue('usr_two');
      const third = sessions.issue('usr_three');

      expect(sessions.resolve(first.accessToken).ok).toBe(false);
      expect(sessions.resolve(second.accessToken)).toEqual({ ok: true, value: 'usr_two' });
      expect(sessions.resolve(third.accessToken)).toEqual({ ok: true, value: 'usr_three' });
    });

    // Expiry is cheaper than eviction: a store full of dead sessions must reclaim them before it
    // starts logging live users out.
    it('reclaims expired sessions before it evicts a live one', () => {
      const clock = stoppedClock();
      const sessions = store({ maxSessions: 2, ttlSec: 3600, now: clock.now });

      sessions.issue('usr_stale_one');
      sessions.issue('usr_stale_two');
      clock.advanceMs(HOUR_MS + 1);

      const fresh = sessions.issue('usr_fresh');
      const alsoFresh = sessions.issue('usr_also_fresh');

      expect(sessions.resolve(fresh.accessToken)).toEqual({ ok: true, value: 'usr_fresh' });
      expect(sessions.resolve(alsoFresh.accessToken)).toEqual({
        ok: true,
        value: 'usr_also_fresh',
      });
    });
  });
});

describe('the fingerprint is not invertible', () => {
  it('produces a key that is not the token and cannot be read back as one', () => {
    const token = generateSessionToken();
    const fingerprint = sessionFingerprint(token);

    expect(fingerprint).not.toBe(token);
    expect(fingerprint).not.toContain(token);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, or the store could not find anything', () => {
    expect(sessionFingerprint('token-abc')).toBe(sessionFingerprint('token-abc'));
  });

  it('separates two tokens that differ by one character', () => {
    expect(sessionFingerprint('token-abc')).not.toBe(sessionFingerprint('token-abd'));
  });
});
