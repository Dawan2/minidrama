import { useCallback, useEffect, useRef, useState } from 'react';

import { runAdUnlock } from './ad-unlock';
import type { AdUnlockFailure, AdUnlockOutcome, AdUnlockStage } from './ad-unlock';
import type { PlatformBridge } from '../platform/types';
import type { UnlockApi } from '../data/unlock-api';

export type AdUnlockSettlement = Exclude<AdUnlockOutcome, { kind: 'ABANDONED' }>;

export type AdUnlockState =
  | { readonly status: 'OFFERED' }
  | { readonly status: 'RUNNING'; readonly stage: AdUnlockStage }
  | { readonly status: 'SETTLED'; readonly outcome: AdUnlockSettlement };

export interface AdUnlockOptions {
  readonly api: UnlockApi;
  readonly bridge: PlatformBridge;
  readonly episodeId: string;
  readonly adUnitId: string | null;
  readonly onEntitlementChanged: () => void;
}

export interface AdUnlockHandle {
  readonly state: AdUnlockState;
  readonly start: () => void;
}

export function useAdUnlock(options: AdUnlockOptions): AdUnlockHandle {
  const { api, bridge, episodeId, adUnitId, onEntitlementChanged } = options;
  const [state, setState] = useState<AdUnlockState>({ status: 'OFFERED' });
  const running = useRef(false);
  const abandoned = useRef(false);

  useEffect(() => {
    abandoned.current = false;
    return () => {
      abandoned.current = true;
    };
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setState({ status: 'RUNNING', stage: 'SESSION' });

    void (async () => {
      const outcome = await runAdUnlock({
        api,
        bridge,
        episodeId,
        adUnitId,
        onStage: (stage) => {
          if (!abandoned.current) setState({ status: 'RUNNING', stage });
        },
      });

      running.current = false;
      if (abandoned.current) return;

      if (outcome.kind === 'UNLOCKED' || outcome.kind === 'ALREADY_UNLOCKED') {
        onEntitlementChanged();
      }
      setState({ status: 'SETTLED', outcome });
    })();
  }, [api, bridge, episodeId, adUnitId, onEntitlementChanged]);

  return { state, start };
}

export type { AdUnlockFailure, AdUnlockStage };
