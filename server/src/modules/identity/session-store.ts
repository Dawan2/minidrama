import { createHash, randomBytes } from 'node:crypto';
import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * Session issuance **and** resolution, in one store.
 *
 * Until now issuance and resolution lived apart: `createSessionIssuer` minted an opaque token and
 * forgot it, and every reader of a session (`createUnresolvedViewerResolver`) refused every token
 * because there was nothing to ask. An app that hands out credentials it cannot read is not a
 * half-built feature, it is a contradiction — so the two halves are the same object here, and
 * `buildApp` gives that one object to the login route and to the viewer resolver.
 *
 * What is not a placeholder and must survive the switch to signed sessions or to Redis:
 *
 *   - the token is **not derived from the user id**. A token that encodes its subject without a
 *     signature is a token an attacker can construct;
 *   - it is generated with a CSPRNG. `Math.random` would be a predictable session token, which is
 *     the same defect wearing a different hat;
 *   - the store is keyed by a **fingerprint** of the token, never by the token. A dump of this map —
 *     a heap snapshot, a debug log, a future `KEYS *` against Redis — must not yield a set of usable
 *     bearer credentials;
 *   - a session that is absent or past its expiry is a **refusal**, never an anonymous viewer, and
 *     never a silently renewed session.
 *
 * On Minis the client keeps the access token in memory only and re-runs silent login when it
 * expires, so there is no refresh token to issue here and no sliding expiry: a session's lifetime is
 * fixed at issuance, and reading it does not extend it (`docs/12-api-contracts.md` §5).
 *
 * **Process-local.** This map dies with the process and is not shared between instances, so a
 * restart or a second replica invalidates every session it did not issue. That is survivable
 * precisely because the client's answer to a rejected session is to run silent login again — and it
 * is why the store is an interface: W7 replaces the map with Redis without touching a caller.
 */

export interface Session {
  readonly accessToken: string;
  readonly expiresInSec: number;
}

/**
 * Both failures are answered the same way by the HTTP layer — a `401` the client fixes by running
 * silent login again — but they are not the same event to an operator: a flood of `SESSION_UNKNOWN`
 * is someone guessing tokens, while a flood of `SESSION_EXPIRED` is a client that is not refreshing.
 */
export type SessionLookupFailure = 'SESSION_UNKNOWN' | 'SESSION_EXPIRED';

export interface SessionStore {
  /**
   * Issues a session bound to `userId`.
   *
   * @throws If `userId` is empty. A session bound to nobody would resolve to a viewer id the rest
   * of the system would then treat as a user, and every unlock and every progress row written under
   * it would belong to a shared phantom account.
   */
  issue(userId: string): Session;

  /** Resolves a presented access token to the user id it was issued for. */
  resolve(accessToken: string): Result<string, SessionLookupFailure>;

  /** Drops a session. Idempotent, so a logout that arrives twice is not an error. */
  revoke(accessToken: string): void;

  /** Live sessions, expired entries excluded. Diagnostics only; it is not part of any response. */
  readonly liveSessions: number;

  /**
   * The keys of the live sessions.
   *
   * Exposed so that "the store holds no usable credential" is a property the suite enforces rather
   * than one a reader has to take on trust. It is safe to expose for exactly the reason it is worth
   * asserting: a fingerprint cannot be presented as a bearer token and cannot be turned back into
   * one.
   */
  fingerprints(): readonly string[];
}

export interface SessionStoreOptions {
  readonly ttlSec?: number;
  /**
   * Ceiling on stored sessions. An unbounded in-memory session table is a memory-exhaustion target
   * for anything that can drive issuance, so there is a limit and it evicts rather than refusing:
   * being logged out is recoverable in one silent login, and refusing to issue would turn a flood
   * into an outage for everyone.
   */
  readonly maxSessions?: number;
  readonly now?: () => number;
  /** Injected only by tests that need a deterministic token. */
  readonly generateToken?: () => string;
}

const DEFAULT_TTL_SEC = 3600;
const DEFAULT_MAX_SESSIONS = 10_000;
const TOKEN_BYTES = 32;

/** 256 bits of CSPRNG entropy, url-safe because the token travels in a header. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * The store's key. SHA-256 is right here for the one property that matters — it is not invertible,
 * so the keys are useless as credentials — and the usual "hash the password slowly" argument does
 * not apply: the input is 256 bits of CSPRNG output, not a guessable secret.
 */
export function sessionFingerprint(accessToken: string): string {
  return createHash('sha256').update(accessToken).digest('hex');
}

interface SessionRecord {
  readonly userId: string;
  readonly expiresAtMs: number;
}

export function createInMemorySessionStore(options: SessionStoreOptions = {}): SessionStore {
  const ttlSec = options.ttlSec ?? DEFAULT_TTL_SEC;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const now = options.now ?? Date.now;
  const generateToken = options.generateToken ?? generateSessionToken;

  const records = new Map<string, SessionRecord>();

  const isExpired = (record: SessionRecord): boolean => record.expiresAtMs <= now();

  const dropExpired = (): void => {
    for (const [fingerprint, record] of records) {
      if (isExpired(record)) records.delete(fingerprint);
    }
  };

  /** Insertion order is Map order, so the oldest session is the first key. */
  const evictOldest = (): void => {
    const oldest = records.keys().next();
    if (oldest.done !== true) records.delete(oldest.value);
  };

  return {
    issue: (userId) => {
      if (userId.length === 0) {
        throw new Error('a session must be bound to a user id');
      }

      dropExpired();
      while (records.size >= maxSessions) evictOldest();

      const accessToken = generateToken();
      records.set(sessionFingerprint(accessToken), {
        userId,
        expiresAtMs: now() + ttlSec * 1000,
      });

      return { accessToken, expiresInSec: ttlSec };
    },

    resolve: (accessToken) => {
      const fingerprint = sessionFingerprint(accessToken);
      const record = records.get(fingerprint);

      if (record === undefined) return err('SESSION_UNKNOWN');
      if (isExpired(record)) {
        records.delete(fingerprint);
        return err('SESSION_EXPIRED');
      }

      return ok(record.userId);
    },

    revoke: (accessToken) => {
      records.delete(sessionFingerprint(accessToken));
    },

    get liveSessions() {
      dropExpired();
      return records.size;
    },

    fingerprints: () => {
      dropExpired();
      return [...records.keys()];
    },
  };
}
