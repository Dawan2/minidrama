import { describe, expect, it } from 'vitest';

import { DEFAULT_CAPSULE_INSET_PX, capsuleInsetFromRect } from './capsule-inset';
import type { MenuButtonRect } from '../platform/types';

const VIEWPORT = 375;

function rect(overrides: Partial<MenuButtonRect> = {}): MenuButtonRect {
  return {
    top: 8,
    right: 367,
    bottom: 40,
    left: 279,
    width: 88,
    height: 32,
    ...overrides,
  };
}

describe('capsuleInsetFromRect', () => {
  it('reserves from the capsule left edge to the viewport right edge', () => {
    expect(capsuleInsetFromRect(rect(), VIEWPORT)).toEqual({
      source: 'measured',
      px: VIEWPORT - 279,
    });
  });

  it('keeps the conservative default when the platform sent no usable rectangle', () => {
    const fallback = { source: 'fallback', px: DEFAULT_CAPSULE_INSET_PX };
    expect(capsuleInsetFromRect(rect({ width: 0, left: 279, right: 279 }), VIEWPORT)).toEqual(
      fallback,
    );
    expect(capsuleInsetFromRect(rect({ height: 0, top: 8, bottom: 8 }), VIEWPORT)).toEqual(fallback);
    expect(
      capsuleInsetFromRect(rect({ left: VIEWPORT, right: VIEWPORT + 88 }), VIEWPORT),
    ).toEqual(fallback);
    expect(capsuleInsetFromRect(rect({ left: Number.NaN }), VIEWPORT)).toEqual(fallback);
  });

  it('does not treat a missing rectangle as zero, which would sit under the capsule', () => {
    const missing = capsuleInsetFromRect(rect({ width: 0, height: 0, left: 0, right: 0 }), VIEWPORT);
    expect(missing.source).toBe('fallback');
    expect(missing.px).toBe(DEFAULT_CAPSULE_INSET_PX);
    expect(missing.px).not.toBe(0);
  });

  it('does not eat the whole viewport when the rect claims to span it', () => {
    expect(
      capsuleInsetFromRect(rect({ left: 0, right: VIEWPORT, width: VIEWPORT }), VIEWPORT),
    ).toEqual({ source: 'fallback', px: DEFAULT_CAPSULE_INSET_PX });
  });

  it('keeps the default when the viewport itself is unreadable', () => {
    const fallback = { source: 'fallback', px: DEFAULT_CAPSULE_INSET_PX };
    expect(capsuleInsetFromRect(rect(), 0)).toEqual(fallback);
    expect(capsuleInsetFromRect(rect(), Number.NaN)).toEqual(fallback);
  });
});
