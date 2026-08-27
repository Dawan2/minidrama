/**
 * Fail-closed native-`<video>` replacement.
 *
 * TikTok replaces a disallowed `<video>` with a blocked UI. The documented escape hatch —
 * `TTMinis.setValidateVideoReplaceElement`, or the same method on the constructor
 * `TTMinis.getPlayer()` returns — lets an app supply a *custom* replacement element. That is the
 * migration mitigation `docs/plan/media-plane-decision.md` SR-5 forbids: a custom element is how
 * a native player stays on screen, or how a blocked UI is dressed up to look like one.
 *
 * The only legal callback is "do not customize". Returning `null` leaves the platform's default
 * blocked UI in place. Returning the original element would keep native video. Returning any
 * other `HTMLElement` would paint our own replacement, which is the same mitigation under a
 * different spelling.
 *
 * This module is the only production file allowed to name the SDK method
 * (`tools/source-rules.ts`). Everything else goes through `installFailClosedVideoReplace`.
 */

/**
 * The documented callback. `null` is the fail-closed result; an `HTMLElement` would be a custom
 * replacement, which this module never produces.
 */
export type VideoReplaceCallback = (
  videoEl: HTMLVideoElement,
  replaceReason: string,
) => HTMLElement | null;

export type VideoReplaceInstallResult = 'installed' | 'absent' | 'threw';

const SET_VALIDATE_VIDEO_REPLACE_ELEMENT = 'setValidateVideoReplaceElement';

/**
 * Refuse every replacement customisation, for every reason the platform might offer.
 *
 * The return type is `null`, not `HTMLElement | null`, so a callback that started returning an
 * element would fail the typecheck rather than only a runtime assertion.
 */
export function refuseVideoReplace(_videoEl: HTMLVideoElement, _replaceReason: string): null {
  return null;
}

/**
 * Install {@link refuseVideoReplace} on whatever object currently owns the API.
 *
 * Two documented homes exist: the `TTMinis` namespace, and the constructor `getPlayer()`
 * returns. Both are objects with an optional method of this name. Missing is not a failure —
 * the platform default blocked UI is already fail-closed, and a client too old to carry the
 * method must still boot (`docs/plan/media-plane-decision.md` §5.5). A throw is the same:
 * customising replacement must not take the rest of the app down with it.
 */
export function installFailClosedVideoReplace(target: unknown): VideoReplaceInstallResult {
  // The documented homes are an object (`TTMinis`) and a constructor (`getPlayer()`'s return).
  // `typeof` a constructor is `'function'`, so treating only `'object'` as a target would skip
  // the one path the player actually exposes.
  if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
    return 'absent';
  }
  const record = target as Record<string, unknown>;
  const install = record[SET_VALIDATE_VIDEO_REPLACE_ELEMENT];
  if (typeof install !== 'function') {
    return 'absent';
  }
  try {
    (install as (callback: VideoReplaceCallback) => unknown).call(target, refuseVideoReplace);
    return 'installed';
  } catch {
    return 'threw';
  }
}
