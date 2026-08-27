import { createHttpClient } from './http';
import type { FetchLike, HttpClient } from './http';
import type { SessionStore } from '../session/session-store';

/**
 * How many transports this client has, and why it is two rather than one.
 *
 * Everything business-facing shares `http`: the timeout, the failure classification, the single
 * `GET` retry and the `Authorization` header all belong in one place, and the catalogue reads pass
 * through it too — they are anonymous-*capable*, which is not the same as anonymous-only, and a
 * signed-in viewer's reads should say who they are.
 *
 * `login` is the exception, and it is expressed as a client built without a token source rather
 * than as a flag on the shared one. **A session cannot be created by presenting a session.** A
 * per-request "skip the header" option would say the same thing while handing every other call site
 * an opt-out; a separate construction cannot be reached by accident from anywhere else.
 *
 * This lives outside `main.tsx` so the arrangement is assertable. The rule it encodes is exactly
 * the kind that survives review and then quietly breaks when someone passes the wrong client to
 * `createSessionApi`.
 */

export interface TransportOptions {
  /** Origin only, no trailing slash. In production this is `VITE_API_BASE_URL`. */
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  readonly session: SessionStore;
  /**
   * The login exchange's own budget. Shorter than a read's, because boot waits for it and a
   * misconfigured base URL must not hold the first paint for a full request timeout.
   */
  readonly loginTimeoutMs?: number;
}

export interface ApiTransports {
  /** Carries the session when there is one. Catalogue reads and unlock writes share it. */
  readonly http: HttpClient;
  /** Anonymous by construction. Only the login exchange uses it. */
  readonly login: HttpClient;
}

export function createTransports(options: TransportOptions): ApiTransports {
  return {
    http: createHttpClient({
      baseUrl: options.baseUrl,
      fetch: options.fetch,
      authToken: () => options.session.bearerToken(),
      // A token the server answered `401` to is dead. Dropping it here means the next request is
      // honestly anonymous instead of replaying a refused credential for the rest of the session —
      // which is how one expiry becomes a purchase button that never works again.
      onCredentialRefused: () => {
        options.session.clear();
      },
    }),

    login: createHttpClient({
      baseUrl: options.baseUrl,
      fetch: options.fetch,
      ...(options.loginTimeoutMs === undefined ? {} : { timeoutMs: options.loginTimeoutMs }),
    }),
  };
}
