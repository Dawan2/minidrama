import type { MenuButtonRect } from '../platform/types';

/**
 * Right-hand inset that keeps headings and nav clear of the TikTok capsule (IA §2 P3).
 *
 * `--capsule-safe-area: 96px` in `styles/app.css` is this same number: the conservative default
 * used when the platform has not given us a rectangle. A missing measurement is this value, never
 * `0`. Collapsing to zero would park a tappable control under the real capsule, which is the
 * finding a reviewer sees in the first ten seconds (`docs/plan/cycle-3-backlog.md` C3-05).
 */
export const DEFAULT_CAPSULE_INSET_PX = 96;

export type CapsuleInset =
  | { readonly source: 'measured'; readonly px: number }
  | { readonly source: 'fallback'; readonly px: typeof DEFAULT_CAPSULE_INSET_PX };

const FALLBACK_INSET: CapsuleInset = { source: 'fallback', px: DEFAULT_CAPSULE_INSET_PX };

/**
 * Turn a menu-button rectangle into a right-hand inset, in CSS pixels of the same viewport.
 *
 * The space to reserve is from the capsule's left edge to the viewport's right edge. A rect that
 * does not sit in this viewport — empty, inverted, off-screen, or covering the whole width — is
 * not a measurement. Keep the default rather than treating the absence as "no capsule".
 */
export function capsuleInsetFromRect(rect: MenuButtonRect, viewportWidth: number): CapsuleInset {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return FALLBACK_INSET;
  }
  if (!isUsableRect(rect, viewportWidth)) {
    return FALLBACK_INSET;
  }
  const px = viewportWidth - rect.left;
  if (!Number.isFinite(px) || px <= 0 || px >= viewportWidth) {
    return FALLBACK_INSET;
  }
  return { source: 'measured', px };
}

function isUsableRect(rect: MenuButtonRect, viewportWidth: number): boolean {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left >= 0 &&
    rect.left < viewportWidth &&
    rect.right > rect.left &&
    rect.bottom > rect.top
  );
}
