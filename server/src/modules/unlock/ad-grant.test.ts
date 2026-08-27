import { describe, expect, it } from 'vitest';
import { err } from '@minidrama/shared';

import { createInMemoryAdRewardLogStore } from './ad-reward-log.js';
import { createInMemoryAdUnlockSessionStore } from './ad-session-store.js';
import { createReportedCompletionVerifier } from './ad-completion.js';
import { createAdUnlockSession } from './ad-sessions.js';
import { createInMemoryUnlockStore } from './unlock-store.js';
import { defaultAdUnlockPolicy, startOfUtcDayMs } from './ad-unlock-policy.js';
import { redeemAdUnlock } from './ad-grant.js';
import type { AdRewardLogStore } from './ad-reward-log.js';
import type { EpisodeAccess } from '../entitlement/access.js';
import type { UnlockStore } from './unlock-store.js';

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

const NEED_UNLOCK: EpisodeAccess = {
  playable: false,
  reason: 'NEED_UNLOCK',
  unlockedBy: null,
  unlockOptions: ['COINS'],
  priceCoins: 30,
  unavailableCause: null,
};

const ALREADY_UNLOCKED: EpisodeAccess = {
  playable: true,
  reason: 'UNLOCKED',
  unlockedBy: 'COIN',
  unlockOptions: [],
  priceCoins: null,
  unavailableCause: null,
};

const FREE: EpisodeAccess = {
  playable: true,
  reason: 'FREE',
  unlockedBy: null,
  unlockOptions: [],
  priceCoins: null,
  unavailableCause: null,
};

function session(overrides: { readonly userId?: string } = {}) {
  return createAdUnlockSession({
    id: 'ads_1',
    userId: overrides.userId ?? 'usr_1',
    episodeId: 'ep_1',
    dramaId: 'drm_1',
    idempotencyKey: 'k',
    createdAtMs: NOW,
  });
}

async function redeem(
  options: {
    readonly access?: EpisodeAccess;
    readonly isEnded?: unknown;
    readonly unlockStore?: UnlockStore;
    readonly logStore?: AdRewardLogStore;
    readonly userId?: string;
  } = {},
) {
  const sessionStore = createInMemoryAdUnlockSessionStore();
  const held = session(options.userId === undefined ? {} : { userId: options.userId });
  await sessionStore.create(held);
  return redeemAdUnlock({
    sessionStore,
    logStore: options.logStore ?? createInMemoryAdRewardLogStore(),
    unlockStore: options.unlockStore ?? createInMemoryUnlockStore(),
    verifier: createReportedCompletionVerifier(),
    policy: defaultAdUnlockPolicy(),
    session: held,
    access: options.access ?? NEED_UNLOCK,
    isEnded: options.isEnded ?? true,
    atMs: NOW,
  });
}

describe('redeemAdUnlock', () => {
  it('counts quota from the start of the UTC day', () => {
    expect(startOfUtcDayMs(NOW)).toBe(Date.parse('2026-08-27T00:00:00.000Z'));
  });
  it('does not treat an empty viewer as a grant', async () => {
    expect(await redeem({ userId: '' })).toEqual({ status: 'SESSION_NOT_FOUND' });
  });

  it('does not grant an episode the viewer already owns', async () => {
    expect(await redeem({ access: ALREADY_UNLOCKED })).toEqual({ status: 'ALREADY_UNLOCKED' });
  });

  it('does not grant a playable episode that is not a coin sale', async () => {
    expect(await redeem({ access: FREE })).toEqual({ status: 'NOT_FOR_SALE' });
  });

  it('is INCOMPLETE when the unlock row cannot be written', async () => {
    const unlockStore: UnlockStore = {
      record: async () => err('UNLOCK_NOT_RECORDED'),
      findForEpisode: async () => undefined,
      list: async () => [],
    };
    expect(await redeem({ unlockStore })).toEqual({ status: 'INCOMPLETE' });
  });

  it('is INCOMPLETE when the reward log cannot be written after a grant', async () => {
    const logStore: AdRewardLogStore = {
      append: async () => err('LOG_NOT_RECORDED'),
      countGrantedSince: async () => 0,
      list: async () => [],
    };
    expect(await redeem({ logStore })).toEqual({ status: 'INCOMPLETE' });
  });

  it('grants when the verifier completes and the stores accept the write', async () => {
    const granted = await redeem();
    expect(granted.status).toBe('GRANTED');
    if (granted.status !== 'GRANTED') return;
    expect(granted.unlock).toMatchObject({ method: 'AD', costCoins: 0, orderId: 'ads_1' });
    expect(granted.quota).toEqual({ usedToday: 1, dailyLimit: 5 });
  });
});
