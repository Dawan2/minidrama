/**
 * Vertical swipe → 切集 (`docs/01-product-scope.md` §4.3).
 *
 * Finger up (startY − endY ≥ threshold) is next; finger down is previous. Origin is the player
 * surface, not the chrome (buttons, picker, unlock). Magnitude below the threshold is a tap,
 * which VePlayer already owns (AC-PL-6: no competing play/pause).
 *
 * A predominantly horizontal drag is the kept progress plugin (scrub), not 切集. We do not
 * `preventDefault` it — the plugin has to see the gesture.
 */

export const EPISODE_SWIPE_THRESHOLD_PX = 56;

export type VerticalSwipe = 'up' | 'down';

export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

export function verticalSwipe(
  startY: number,
  endY: number,
  thresholdPx: number = EPISODE_SWIPE_THRESHOLD_PX,
): VerticalSwipe | null {
  const delta = startY - endY;
  if (delta >= thresholdPx) {
    return 'up';
  }
  if (delta <= -thresholdPx) {
    return 'down';
  }
  return null;
}

/**
 * Progress-bar drag: |Δx| ≥ |Δy| and some horizontal travel. A purely vertical flick (Δx = 0)
 * stays 切集 even when both coordinates are present.
 */
export function isHorizontalScrub(start: PointerPoint, end: PointerPoint): boolean {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx > 0 && dx >= dy;
}
