import { createContext, useContext } from 'react';

import type { PlatformBridge } from './types';

/**
 * How a surface reaches the platform bridge.
 *
 * Context rather than a module singleton, and with no default value, for the same two reasons as
 * the API providers: a singleton cannot be swapped in a test without module mocking, and a screen
 * rendered with no provider above it is a wiring bug. Defaulting to `MockBridge` would let a
 * product call site pass in tests and crash on device; throwing is cheaper.
 *
 * `app/src` still must not mention `window.TTMinis`. The bridge is the only way a screen asks
 * for a capability (`docs/plan/cycle-3-backlog.md` C3-05).
 */
const BridgeContext = createContext<PlatformBridge | null>(null);

export interface BridgeProviderProps {
  readonly bridge: PlatformBridge;
  readonly children: React.ReactNode;
}

export function BridgeProvider({ bridge, children }: BridgeProviderProps): React.JSX.Element {
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

export function useBridge(): PlatformBridge {
  const bridge = useContext(BridgeContext);
  if (bridge === null) {
    throw new Error('useBridge requires a <BridgeProvider> above it');
  }
  return bridge;
}
