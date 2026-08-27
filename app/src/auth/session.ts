/**
 * Whether the client believes it has a session, and how it asks for one.
 *
 * This product has **no login screen**. Identity is silent login — `TTMinis.login()` for a code,
 * `POST /v1/auth/login` to exchange it — and the only user-visible affordance is an in-place retry
 * at the point of use (`docs/02-information-architecture.md` §9, `docs/02-user-journeys.md` J10-B).
 * So there is nothing here that resembles a credential form, and there never should be.
 *
 * The exchange itself is not implemented on either side yet: the server's identity port refuses
 * every code until the real platform call lands (`server/src/modules/identity/routes.ts`), and the
 * client has no token store and attaches no `Authorization` header. This module is therefore a
 * **seam and a state, not an implementation**. It exists so that the two screens that have to talk
 * about being signed in can do so today without either of them inventing an identity model, and so
 * that the identity slot has exactly one place to fill in.
 *
 * The rule it enforces is the one worth writing down: **the session state decides copy, and the
 * server decides access.** A screen may use `state` to choose what to say to the viewer; it may
 * never use it to decide whether a request is worth making or whether a viewer is entitled to
 * something. Those answers come back as `401` and as `viewerAccess`, from the only party that can
 * compute them.
 */
export type SessionState =
  { readonly status: 'ANONYMOUS' } | { readonly status: 'AUTHENTICATED'; readonly openId: string };

export const ANONYMOUS: SessionState = { status: 'ANONYMOUS' };

export interface Session {
  readonly state: SessionState;
  /**
   * Runs silent login once and reports whether a session now exists.
   *
   * It resolves rather than rejecting, and it resolves `false` rather than throwing when login is
   * impossible, because every caller is a button on a screen the viewer is currently using: an
   * unavailable identity provider is a hint under a button, not an exception that takes the screen
   * down (`docs/02-user-journeys.md` J10-B).
   */
  readonly signIn: () => Promise<boolean>;
}

export function isSignedIn(state: SessionState): boolean {
  return state.status === 'AUTHENTICATED';
}

/**
 * The session the app boots with, and — until the identity slot lands — the only one there is.
 *
 * `signIn` resolves `false` instead of pretending: reporting success without a token would put the
 * profile screen into a signed-in state with no session behind it, which is the "假数据" the IA
 * explicitly forbids in the assets area (J10-B). A viewer who is told they are signed in and then
 * sees an empty history has been lied to twice.
 */
export function anonymousSession(): Session {
  return {
    state: ANONYMOUS,
    signIn: () => Promise.resolve(false),
  };
}
