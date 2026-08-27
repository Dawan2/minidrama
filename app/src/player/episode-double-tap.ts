/**
 * Double-tap → 点赞 (`docs/01-product-scope.md` §4.3).
 *
 * Two taps inside the window, with slop smaller than a 切集 swipe, are a like. A single tap is
 * still VePlayer's (`AC-PL-6`: no competing play/pause). A vertical flick is `verticalSwipe`,
 * not a like. 联动收藏 is the PlayPage write; this module only names the gesture.
 */

export const DOUBLE_TAP_WINDOW_MS = 280;
export const DOUBLE_TAP_SLOP_PX = 28;

export interface TapPoint {
  readonly x: number;
  readonly y: number;
  readonly atMs: number;
}

export function isDoubleTap(
  first: TapPoint,
  second: TapPoint,
  windowMs: number = DOUBLE_TAP_WINDOW_MS,
  slopPx: number = DOUBLE_TAP_SLOP_PX,
): boolean {
  const dt = second.atMs - first.atMs;
  if (dt < 0 || dt > windowMs) {
    return false;
  }
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  return dx * dx + dy * dy <= slopPx * slopPx;
}
