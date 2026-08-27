import { err, ok } from '@minidrama/shared';

import { readBearerToken } from '../entitlement/viewer-resolver.js';
import type { SessionStore } from './session-store.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * The bridge slot F left open: entitlement publishes `ViewerResolver` and asks "who is this
 * request?"; `identity` owns the sessions that answer it. This is identity's implementation of that
 * interface, and it is the only place a bearer token becomes a viewer id.
 *
 * The header is parsed by entitlement's `readBearerToken` rather than re-parsed here on purpose.
 * Two parsers for one header is how `Authorization: Basic ...` ends up read as "anonymous" in one
 * code path and refused in the other — and the anonymous reading is the silent downgrade that tells
 * a paying subscriber they own nothing, with a `200` and nothing in the logs.
 *
 * Both store failures collapse to `SESSION_REJECTED`, a `401` the client answers by running silent
 * login again. Neither is `SESSION_UNRESOLVABLE`: that failure means *we* cannot answer the question
 * (no store, or a store that is down) and belongs to a `503`. A store that is up and does not hold
 * the token has answered — the token is not one of ours, or not one of ours any more.
 */
export function createSessionViewerResolver(store: SessionStore): ViewerResolver {
  return {
    resolve: (authorization) => {
      const token = readBearerToken(authorization);
      if (!token.ok || token.value === null) return token;

      const found = store.resolve(token.value);

      return found.ok ? ok(found.value) : err('SESSION_REJECTED');
    },
  };
}
