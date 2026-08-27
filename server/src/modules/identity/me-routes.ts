import type { MeView } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { errorBody } from '../../core/errors.js';
import { requireViewer, sendViewerRefusal } from '../progress/viewer.js';
import { toMeView } from './me-view.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * The current-user identity read.
 *
 * ```
 * GET /v1/users/me  -> 200 MeView
 * ```
 *
 * Auth is required: a me without a session is not a viewer, and an anonymous `200` with an
 * omitted id would look like "this viewer has no account" to a client that then has to guess
 * whether to sign in. The client's move for `401` is silent login, then one retry.
 *
 * The body is fail-closed. It returns identity the session already holds — today the user id
 * the login route bound, which is the platform `open_id` until a users table lands. Nickname
 * and avatar are omitted: they are not on the session, and inventing them from the id is the
 * same class of lie as inventing `0 coins`.
 *
 * VIP, expiry and Beans never leave this handler. There is no subscription contract (`C4-07`)
 * and no coin→Beans rate (`C3-09`); quoting either would be a commercial decision made in a
 * route. The profile VIP card stays a statement until a subscription surface exists.
 *
 * `PATCH /v1/users/me`, `POST /v1/users/me/bind-phone` and a `vip` object are deliberately not
 * here. Those need a users table, a phone binding, and a subscription. An empty VIP object
 * would claim the viewer is not subscribed, and we do not know that.
 */

export interface MeRouteOptions {
  readonly viewerResolver: ViewerResolver;
}

export const ME_PATH = '/v1/users/me';

export async function meRoutes(app: FastifyInstance, options: MeRouteOptions): Promise<void> {
  const { viewerResolver } = options;

  app.get(ME_PATH, async (request, reply) => {
    // Per-viewer identity, and a shared cache holding it is a cross-user leak waiting for a
    // misconfigured proxy. Set before the answer is known, so the refusals carry it too
    // (`docs/design/api-contracts.md` CA-3).
    const answer = reply.header('cache-control', 'private, no-store');

    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) {
      return sendViewerRefusal(request, answer, viewer.error, 'me read');
    }

    // A session bound to nobody would be a shared phantom account. The store refuses to issue
    // one; if a resolver still handed us an empty id, that is ours to fix, not a guest profile.
    if (viewer.value.length === 0) {
      request.log.error('me read: session resolved to an empty user id');
      return answer
        .status(503)
        .send(errorBody('COMMON_SERVICE_UNAVAILABLE', 'Profile cannot be read', request.id));
    }

    const body: MeView = toMeView({ id: viewer.value });
    return answer.status(200).send(body);
  });
}
