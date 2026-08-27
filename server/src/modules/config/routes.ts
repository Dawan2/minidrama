import type { ConfigView } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { LIVE_CLIENT_CONFIG } from './live.js';
import { toConfigView } from './view.js';

/**
 * The boot configuration read.
 *
 * ```
 * GET /v1/config  -> 200 ConfigView
 * ```
 *
 * Anonymous: browsing and a failed silent login still need a config, and an anonymous `401`
 * would look like "sign in to learn whether comments exist". The body is the conservative
 * product state — comments off, ad-unlock off, heartbeat 10 s — not the design-doc example
 * that showed `comments: true` (`docs/12-api-contracts.md` §4.10).
 *
 * `public, max-age=60, stale-while-revalidate=300`: the answer is not per viewer
 * (`docs/design/api-contracts.md` §3). A shared cache holding it is the intended behaviour.
 *
 * Legal URLs, ad-unit ids, Beans and a coin name never leave this handler. C4/C5 URLs are
 * unpublished (SCR-12 already says so). GATE-4 has not named a unit id. Q-G-7 has not named a
 * rate. Inventing any of them here would be those decisions, made in a route.
 */

export const CONFIG_PATH = '/v1/config';

export const CONFIG_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get(CONFIG_PATH, async (_request, reply) => {
    const body: ConfigView = toConfigView(LIVE_CLIENT_CONFIG);
    return reply.header('cache-control', CONFIG_CACHE_CONTROL).status(200).send(body);
  });
}
