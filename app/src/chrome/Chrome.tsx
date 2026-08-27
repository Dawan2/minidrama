import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { DEFAULT_CAPSULE_INSET_PX, capsuleInsetFromRect } from './capsule-inset';
import { navigationBarForPath } from './navigation-bar';
import { useBridge } from '../platform/bridge-context';
import { createInterstitialSlotState, maybeShowInterstitial } from '../ads/interstitial';
import { isPlayPath } from '../routes/routes';

/**
 * Shell chrome for every route: capsule avoidance and the navigation-bar colour.
 *
 * This is the product call site C3-05 asked for. The methods already exist on `PlatformBridge`;
 * until this component, no screen called them, and `--capsule-safe-area` was a guess
 * (`docs/handoff/w2-work-h.md`). One shell, not one copy per page: a page that forgot the probe
 * would be the page a reviewer opens first.
 *
 * Fail-closed:
 * - `canIUse` false → do not call. Keep the CSS default. An older TikTok client must not crash.
 * - A failed or unusable rect → the same default, never `0`.
 * - A failed colour set is skipped; the page still paints `--bg`.
 *
 * Wired and exercisable against the mock. D9 stays unchecked in the onboarding list until it has
 * run on a device (`docs/plan/wave-protocol.md` §8 rule 6).
 */
export interface ChromeProps {
  readonly children: React.ReactNode;
}

export function Chrome({ children }: ChromeProps): React.JSX.Element {
  const bridge = useBridge();
  const location = useLocation();
  const palette = navigationBarForPath(location.pathname);
  const [inset, setInset] = useState(DEFAULT_CAPSULE_INSET_PX);
  const [capsule, setCapsule] = useState<'fallback' | 'measured'>('fallback');
  const [navBarApplied, setNavBarApplied] = useState(false);
  const previousPath = useRef<string | null>(null);
  const interstitialState = useRef(createInterstitialSlotState());

  useEffect(() => {
    let cancelled = false;

    async function measure(): Promise<void> {
      if (!bridge.canIUse('getMenuButtonBoundingClientRect')) {
        return;
      }
      const result = await bridge.getMenuButtonRect();
      if (cancelled || !result.ok) {
        return;
      }
      const measured = capsuleInsetFromRect(result.value, window.innerWidth);
      setInset(measured.px);
      setCapsule(measured.source);
    }

    void measure();
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    document.documentElement.style.setProperty('--capsule-safe-area', `${inset}px`);
    return () => {
      document.documentElement.style.removeProperty('--capsule-safe-area');
    };
  }, [inset]);

  useEffect(() => {
    if (!bridge.canIUse('setNavigationBarColor')) {
      setNavBarApplied(false);
      return;
    }
    let cancelled = false;
    void bridge
      .setNavigationBarColor(palette.frontColor, palette.backgroundColor)
      .then((result) => {
        if (!cancelled) {
          setNavBarApplied(result.ok);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, palette.frontColor, palette.backgroundColor]);

  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = location.pathname;
    // Boot is not a leave, and leaving play is the only sanctioned interstitial slot. The unit
    // id is null until GATE-4: maybeShowInterstitial is still the product call site, and a
    // missing id is a skip rather than a made-up Portal placement.
    if (previous === null) return;
    if (!isPlayPath(previous) || isPlayPath(location.pathname)) return;
    void maybeShowInterstitial({
      bridge,
      adUnitId: null,
      state: interstitialState.current,
    });
  }, [bridge, location.pathname]);

  return (
    <div
      data-testid="chrome"
      data-capsule={capsule}
      data-capsule-inset={String(inset)}
      data-nav-bar={palette.kind}
      data-nav-bar-applied={navBarApplied ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}
