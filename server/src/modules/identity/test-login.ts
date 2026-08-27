import { err, ok } from '@minidrama/shared';

import type { PlatformIdentityPort } from '../platform-tiktok/identity-port.js';

/**
 * The mock login path, and the gate that keeps it out of production.
 *
 * Everything downstream of a session — progress, favorites, unlocks, the wallet — needs a viewer,
 * and the real code exchange against `open.tiktokapis.com` does not exist yet
 * (`createTiktokIdentityPort` refuses every code, deliberately: S17). Without some way to obtain a
 * session, none of those endpoints can be tested against anything but a hand-built resolver.
 *
 * The dangerous way to fix that is a stub inside the real identity port. Then the authentication
 * bypass ships, and the only thing standing between it and production is that nobody set the wrong
 * environment variable. So this is a **separate port** that the real one can never delegate to, and
 * it is selected in exactly one place, `buildApp`, under a gate with two independent conditions:
 *
 *   1. `MINIDRAMA_TEST_LOGIN` equals `TEST_LOGIN_ENABLE_VALUE` — a sentence, not a boolean, so no
 *      `true`, `1`, `yes` or empty-but-present value can enable it, and it cannot be enabled by
 *      copying a habit from another flag;
 *   2. `NODE_ENV` is one of `test` or `development` — an allowlist. An unset `NODE_ENV`, a
 *      `staging`, a typo, and of course `production` all refuse. A blocklist (`!== 'production'`)
 *      would make "forgot to set NODE_ENV" the enabling condition, which is precisely backwards.
 *
 * Both must hold. Neither is satisfiable by accident, and `buildApp` logs a warning at every start
 * where the path is live, because a deployment that has mock login enabled and does not know it is
 * the failure this module exists to prevent.
 *
 * Even when it is enabled, the port is not an open door: it accepts only codes of the form
 * `mock:<userId>`, so a real TikTok authorization code arriving here is still rejected, and a test
 * has to say which user it is logging in as.
 */

/**
 * Deliberately a sentence and deliberately alarming. It is what an operator sees in a `.env` when
 * they wonder why login works without credentials.
 */
export const TEST_LOGIN_ENABLE_VALUE = 'yes-i-am-a-non-production-test-deployment';

const NON_PRODUCTION_ENVIRONMENTS: readonly string[] = ['test', 'development'];

/** The prefix a mock authorization code must carry. */
export const MOCK_AUTH_CODE_PREFIX = 'mock:';

/**
 * A conservative shape for the user id a mock code may name: the ids this system mints are
 * `usr_`-prefixed opaque strings, and nothing about a login is improved by accepting a code that
 * carries a colon, a slash or 4 KB of anything.
 */
const MOCK_USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isTestLoginEnabled(env: NodeJS.ProcessEnv): boolean {
  return (
    env['MINIDRAMA_TEST_LOGIN'] === TEST_LOGIN_ENABLE_VALUE &&
    NON_PRODUCTION_ENVIRONMENTS.includes(env['NODE_ENV'] ?? '')
  );
}

/** The authorization code a test presents to log in as `userId`. */
export function mockAuthCode(userId: string): string {
  return `${MOCK_AUTH_CODE_PREFIX}${userId}`;
}

/**
 * The mock exchange: `mock:<userId>` in, `<userId>` out as the `open_id`.
 *
 * It is a `PlatformIdentityPort` and nothing more, so the login route it feeds is the same route
 * with the same validation, the same failure mapping and the same session issuance as production —
 * which is the point. A second login route for tests would be a second thing to keep correct, and
 * the one that is not exercised in production is the one that rots.
 */
export function createMockIdentityPort(): PlatformIdentityPort {
  return {
    exchangeAuthCode: async (authCode) => {
      if (!authCode.startsWith(MOCK_AUTH_CODE_PREFIX)) return err('AUTH_CODE_REJECTED');

      const userId = authCode.slice(MOCK_AUTH_CODE_PREFIX.length);

      return MOCK_USER_ID.test(userId) ? ok({ openId: userId }) : err('AUTH_CODE_REJECTED');
    },
  };
}
