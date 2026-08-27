/**
 * Vertical swipe → 切集 (`docs/01-product-scope.md` §4.3).
 *
 * Finger up (startY − endY ≥ threshold) is next; finger down is previous. Origin is the player
 * surface, not the chrome (buttons, picker, unlock). Magnitude below the threshold is a tap,
 * which VePlayer already owns (AC-PL-6: no competing play/pause).
 */

export const EPISODE_SWIPE_THRESHOLD_PX = 56;

export type VerticalSwipe = 'up' | 'down';

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
