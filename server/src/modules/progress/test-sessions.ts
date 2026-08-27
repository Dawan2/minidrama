import { err, ok } from '@minidrama/shared';

import { readBearerToken } from '../entitlement/viewer-resolver.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * A resolver with two known sessions, for the tests in this module.
 *
 * The real resolver reads the session store, whose tokens are 256 bits of CSPRNG output — correct,
 * and useless for a test that wants to say "this request is `user_a`". So the token *table* is
 * faked and nothing else is: the header is parsed by the same `readBearerToken` the real resolver
 * uses, so a test cannot pass because this double was laxer about `Authorization` than production
 * is, and an unknown token is `SESSION_REJECTED` here exactly as it is there.
 */

const SESSIONS: Readonly<Record<string, string>> = { tok_a: 'user_a', tok_b: 'user_b' };

export function createFakeSessionResolver(): ViewerResolver {
  return {
    resolve: (authorization) => {
      const token = readBearerToken(authorization);
      if (!token.ok || token.value === null) return token;

      const userId = SESSIONS[token.value];

      return userId === undefined ? err('SESSION_REJECTED') : ok(userId);
    },
  };
}
