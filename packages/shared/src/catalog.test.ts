import { describe, expect, it } from 'vitest';

import {
  DRAMA_CATEGORIES,
  FEED_CARD_TYPES,
  FEED_SCENES,
  UNLOCK_METHODS,
  UNLOCK_POLICIES,
  VIEWER_ACCESS_REASONS,
} from './catalog.js';
import type { DramaSummary, EpisodeItem, FeedCard } from './catalog.js';

/**
 * A catalogue listing must never carry a playback handle. If `EpisodeItem` gained `vid`, an asset
 * key or any URL, an episode could be played without the entitlement check that
 * `POST /v1/playback/sessions` exists to perform — the free-of-charge path back to the self-hosted
 * delivery model correction A4 removed.
 *
 * This is a compile-time assertion: it fails `pnpm typecheck`, not just `pnpm test`, so the field
 * cannot be added and the test deleted separately.
 */
type MediaHandleKey =
  | `${string}Url`
  | `${string}Uri`
  | `${string}url`
  | 'vid'
  | 'src'
  | `${string}AssetKey`
  | `${string}Token`;

type CarriesNoMediaHandle<T> = Extract<keyof T, MediaHandleKey> extends never ? true : false;

const _episodeItemCarriesNoMediaHandle: CarriesNoMediaHandle<EpisodeItem> = true;

/** A drama summary carries `coverUrl` — a poster image, not a media handle — and nothing more. */
const _dramaSummaryUrlKeys: Extract<keyof DramaSummary, MediaHandleKey> = 'coverUrl';

/** A feed card is a summary plus impression metadata, so the same rule reaches it transitively. */
const _feedCardCarriesNoMediaHandle: CarriesNoMediaHandle<Omit<FeedCard, 'drama'>> = true;

describe('catalogue enumerations', () => {
  it('matches the enums the API contract publishes', () => {
    // Frozen by docs/12-api-contracts.md §3 and docs/12-domain-model.md §3. A value added here
    // without a client release is a value the client's exhaustive switches cannot handle.
    expect([...DRAMA_CATEGORIES]).toEqual([
      'ROMANCE',
      'REVENGE',
      'FAMILY',
      'SUSPENSE',
      'COMEDY',
      'FANTASY',
      'OTHER',
    ]);
    expect([...UNLOCK_POLICIES]).toEqual(['FREE', 'COIN', 'VIP_ONLY', 'COIN_OR_VIP']);
    expect([...UNLOCK_METHODS]).toEqual(['COIN', 'VIP', 'AD', 'GRANT']);
    expect([...VIEWER_ACCESS_REASONS]).toEqual([
      'FREE',
      'UNLOCKED',
      'VIP',
      'NEED_UNLOCK',
      'NEED_VIP',
      'UNAVAILABLE',
    ]);
    expect([...FEED_SCENES]).toEqual(['HOME', 'PLAYER']);
    expect([...FEED_CARD_TYPES]).toEqual(['CONTINUE_WATCHING', 'DRAMA']);
  });

  it('declares every enumeration member exactly once', () => {
    for (const values of [
      DRAMA_CATEGORIES,
      UNLOCK_POLICIES,
      UNLOCK_METHODS,
      VIEWER_ACCESS_REASONS,
      FEED_SCENES,
      FEED_CARD_TYPES,
    ]) {
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('holds the compile-time assertions that no listing carries a playback handle', () => {
    expect(_episodeItemCarriesNoMediaHandle).toBe(true);
    expect(_feedCardCarriesNoMediaHandle).toBe(true);
    expect(_dramaSummaryUrlKeys).toBe('coverUrl');
  });
});
