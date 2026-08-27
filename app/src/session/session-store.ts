import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * The one place a bearer token lives, and the gate everything has to pass to become one.
 *
 * Two properties define it, and both are refusals rather than features:
 *
 * 1. **Nothing but the server can put a session in here.** `adopt` takes what
 *    `POST /v1/auth/login` issued and validates it; there is no constructor for a session, no
 *    device id, no guest mode and no way to say "assume signed in". The client cannot mint a
 *    credential, so an unauthenticated viewer reaches the server as an unauthenticated viewer and
 *    is answered `401 AUTH_REQUIRED` — which the unlock panel already renders as
 *    `SIGN_IN_REQUIRED`. That answer is honest; a fabricated identity would be a client-side
 *    entitlement decision, which is the mistake this codebase keeps refusing to make (H4, S28, U1).
 * 2. **It is memory only.** Minis holds the access token in memory and re-runs silent login when it
 *    expires (`contracts/openapi.yaml`, `LoginResponse`). Persisting it would leave a credential in
 *    a WebView's storage, outliving the session it belongs to, for a refresh this app does not need
 *    — the platform can always issue a fresh `authCode` without asking the viewer anything.
 *
 * `openId` is kept because it is the account the session belongs to, and it is kept *next to* the
 * token so it cannot exist without one. A viewer identifier that survives a missing token is the
 * "fake user" this module exists to make unrepresentable.
 */

/** The wire body of a successful login, before anything has decided it is usable. */
export interface SessionGrant {
  readonly accessToken: string;
  readonly expiresInSec: number;
  readonly openId: string;
}

export interface Session {
  /** The account this session belongs to. Never used to decide access — the server does that. */
  readonly openId: string;
  /** Absolute, so a store consulted an hour later gets the right answer. */
  readonly expiresAtMs: number;
}

/**
 * Why a grant did not become a session. Each one is a bug somewhere else — a server that issued
 * something unusable, or a gateway that rewrote the body — and none of them is recoverable by
 * pretending.
 */
export const SESSION_REJECTIONS = [
  /** Empty, or carrying characters that cannot go in a header. */
  'UNUSABLE_TOKEN',
  /** No `openId`. A session that does not say whose it is cannot be one. */
  'UNIDENTIFIED',
  /** A lifetime too short to survive the request it would be attached to. */
  'EXPIRED_ON_ARRIVAL',
] as const;

export type SessionRejection = (typeof SESSION_REJECTIONS)[number];

export interface SessionStore {
  /**
   * The token to put in `Authorization`, or `null` when there is no usable session. The transport
   * asks this once per attempt.
   */
  bearerToken(): string | null;
  /** The current session, or `null`. Expiry is applied here too, so the two can never disagree. */
  session(): Session | null;
  adopt(grant: SessionGrant): Result<Session, SessionRejection>;
  /** Called when the server refuses the token, and on sign-out. Never leaves a partial session. */
  clear(): void;
}

export interface SessionStoreOptions {
  /** Injected so expiry is a value a test can advance rather than a clock it has to fake. */
  readonly now?: () => number;
  readonly expiryGuardMs?: number;
}

/**
 * How long before the server's expiry the client stops using a token.
 *
 * A token that dies mid-flight is a `401` on a request the viewer already committed to — and if
 * that request is the coin order, they are told to sign in after tapping "Unlock". Half a request
 * budget (`DEFAULT_REQUEST_TIMEOUT_MS` is 10s) is the margin: comfortably under any plausible
 * session lifetime, comfortably over the round trip it protects.
 */
export const DEFAULT_EXPIRY_GUARD_MS = 5_000;

/**
 * A header value may not contain a space, a control character or anything outside printable ASCII.
 * The server issues `base64url`, so this passes everything real and rejects the shapes that would
 * either be silently mangled by `fetch` or, in a header assembled by hand, split the request.
 */
const HEADER_SAFE_TOKEN = /^[\x21-\x7e]+$/;

export function createSessionStore(options: SessionStoreOptions = {}): SessionStore {
  const now = options.now ?? (() => Date.now());
  const expiryGuardMs = options.expiryGuardMs ?? DEFAULT_EXPIRY_GUARD_MS;

  // The token and the session it belongs to are one variable, assigned once per login. There is no
  // state in which a token exists without an `openId` or an expiry, because there is nowhere to
  // put one.
  let held: { readonly token: string; readonly session: Session } | null = null;

  const live = (): { readonly token: string; readonly session: Session } | null => {
    if (held === null) {
      return null;
    }
    if (now() + expiryGuardMs >= held.session.expiresAtMs) {
      // Dropped rather than merely hidden: a token past its usefulness is a credential with no
      // remaining purpose, and keeping one around is how it ends up in a log or a bug report.
      held = null;
      return null;
    }
    return held;
  };

  return {
    bearerToken: () => live()?.token ?? null,

    session: () => live()?.session ?? null,

    adopt: (grant) => {
      if (!HEADER_SAFE_TOKEN.test(grant.accessToken)) {
        return err('UNUSABLE_TOKEN');
      }
      if (grant.openId === '') {
        return err('UNIDENTIFIED');
      }
      if (!Number.isFinite(grant.expiresInSec) || grant.expiresInSec * 1_000 <= expiryGuardMs) {
        return err('EXPIRED_ON_ARRIVAL');
      }

      const session: Session = {
        openId: grant.openId,
        expiresAtMs: now() + grant.expiresInSec * 1_000,
      };
      held = { token: grant.accessToken, session };
      return ok(session);
    },

    clear: () => {
      held = null;
    },
  };
}
