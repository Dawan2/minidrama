import type { FastifyRequest } from 'fastify';
import type { UnlockMethod } from '@minidrama/shared';

/**
 * Who is asking.
 *
 * Catalogue reads are anonymous-capable by contract (`docs/12-api-contracts.md` §2.2): browsing and
 * free episodes must work before login, and the Minis client's silent login can fail. A viewer is
 * therefore always resolvable — the anonymous one is a real viewer with no entitlements, not an
 * error state.
 */
export interface Viewer {
  readonly userId: string | null;
  readonly vip: boolean;
  /** Episodes this viewer owns, and how each was obtained. */
  readonly unlocks: ReadonlyMap<string, UnlockMethod>;
}

export const ANONYMOUS_VIEWER: Viewer = {
  userId: null,
  vip: false,
  unlocks: new Map(),
};

export interface ViewerResolver {
  resolve(request: FastifyRequest): Promise<Viewer>;
}

/**
 * The Wave-2 resolver: every request is anonymous.
 *
 * This is the fail-closed placeholder, not an oversight. Sessions are opaque random tokens with no
 * verification path yet (`docs/handoff/w2-work-c.md` S18) and there is no entitlement store, so the
 * only way to honour an `Authorization` header today would be to trust it — which is an
 * authorization bypass that reads as a feature. Anonymous means "no unlocks, no VIP", so every
 * paid episode reports `NEED_UNLOCK` and nothing is given away.
 *
 * The entitlement slot replaces this one function: verify the session, load the viewer's unlocks
 * and VIP state, and every `viewerAccess` in the catalogue becomes personalised without a route
 * changing.
 */
export function createAnonymousViewerResolver(): ViewerResolver {
  return {
    resolve: (): Promise<Viewer> => Promise.resolve(ANONYMOUS_VIEWER),
  };
}
