import { createHttpClient } from './http';
import type { FetchLike, HttpClient } from './http';
import type { SessionRecovery } from '../session/session-recovery';
import type { SessionStore } from '../session/session-store';

/**
 * How many transports this client has, why it is two rather than one, and why they are two calls
 * rather than one.
 *
 * Everything business-facing shares the **session** transport: the timeout, the failure
 * classification, the single `GET` retry and the `Authorization` header all belong in one place, and
 * the catalogue reads pass through it too — they are anonymous-*capable*, which is not the same as
 * anonymous-only, and a signed-in viewer's reads should say who they are.
 *
 * The **login** transport is the exception, and it is expressed as a client built without a token
 * source rather than as a flag on the shared one. **A session cannot be created by presenting a
 * session.** A per-request "skip the header" option would say the same thing while handing every
 * other call site an opt-out; a separate construction cannot be reached by accident from anywhere
 * else.
 *
 * They are built one at a time because the dependency runs in that direction and pretending
 * otherwise needs a mutable slot. The session transport has to know what to do when its credential
 * is refused; the answer is a silent login; a silent login is a `POST` on the login transport. So
 * the order is login transport → silent login → recovery → session transport, and each of these
 * functions takes what the one before it produced. One factory building both would have to be
 * handed a callback that closes over a variable it also fills in, which is the arrangement the two
 * signatures below make unnecessary.
 *
 * This lives outside `main.tsx` so the arrangement is assertable. The rule it encodes is exactly
 * the kind that survives review and then quietly breaks when someone passes the wrong client to
 * `createSessionApi`.
 */

export interface LoginTransportOptions {
  /** Origin only, no trailing slash. In production this is `VITE_API_BASE_URL`. */
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  /**
   * The login exchange's own budget. Shorter than a read's, because boot waits for it and a
   * misconfigured base URL must not hold the first paint for a full request timeout.
   */
  readonly timeoutMs?: number;
}

/**
 * Anonymous by construction: no token source, so no header, so nothing to refuse. That is also why
 * it has no `401` handling — a `401` here is a rejected `authCode`, not a rejected session, and
 * signing the viewer out over it would end a perfectly good session because a *different*
 * credential was refused.
 */
export function createLoginTransport(options: LoginTransportOptions): HttpClient {
  return createHttpClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
}

export interface SessionTransportOptions {
  /** Origin only, no trailing slash. In production this is `VITE_API_BASE_URL`. */
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  readonly session: SessionStore;
  /**
   * Required rather than optional: a transport that presents a credential has to say what happens
   * when the server refuses it. An optional hook would make "drop the token and never get another
   * one" the default, which is the state C3 shipped by accident.
   */
  readonly recovery: SessionRecovery;
}

export function createSessionTransport(options: SessionTransportOptions): HttpClient {
  return createHttpClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    authToken: () => options.session.bearerToken(),

    onCredentialRefused: () => {
      // A token the server answered `401` to is dead. Dropping it here means the next request is
      // honestly anonymous instead of replaying a refused credential for the rest of the session —
      // which is how one expiry becomes a purchase button that never works again.
      options.session.clear();
      // And then a new one is acquired, for the requests *after* this one. Not awaited, and its
      // result is not returned to the caller: the refused request stays refused, because the only
      // `POST` this client makes opens a payment (`http.ts` rule 4). `credentialRefused` never
      // rejects, which is what makes discarding the promise safe rather than merely quiet.
      void options.recovery.credentialRefused();
    },

    onCredentialAccepted: () => {
      options.recovery.credentialAccepted();
    },
  });
}
