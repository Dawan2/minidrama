import type { DramaRecord, EpisodeRecord, PublicationStatus, SeasonRecord } from './types.js';
import type { UnlockPolicy } from '@minidrama/shared';

/**
 * The seed catalogue.
 *
 * There is no content datastore yet, so this fixture *is* the catalogue for Wave 2. It is written
 * as a fixture rather than a demo: every record exists to make a rule observable, and the tests
 * assert against these ids by name. Treat it as a table of cases —
 *
 * | Record | What it pins |
 * |---|---|
 * | `drm_dynasty_0002` seasons 1–2 | The free window is a *drama-wide* window: season 2 episode 1 is the fourth episode and is not free |
 * | `drm_dynasty_0002` season 3 (offline) | An offline season hides its episodes but keeps their numbers |
 * | `ep_revenge_e05` | An episode marked `FREE` outranks the window it sits outside |
 * | `ep_revenge_e06` | `VIP_ONLY` denies with `NEED_VIP`, which is not an unlock offer |
 * | `ep_revenge_e07` | An offline episode stays listed, reported `UNAVAILABLE` |
 * | `ep_revenge_e08` | A draft episode is neither listed nor numbered |
 * | `ep_suspense_e03` | `COIN` ignores VIP: a subscriber still has to buy it |
 * | `drm_offline_0007` | A delisted drama is the most-played record here, and appears in no list |
 * | `drm_draft_0008` | An unpublished drama is the newest record here, and appears in no list |
 *
 * Cover hosts use `.invalid` per the repository convention: a fixture that leaked into a build
 * fails loudly instead of fetching somebody else's image. The real image origin also has to be
 * registered as a trusted domain before any of these load on device.
 */

function cover(slug: string): string {
  return `https://cdn.example.invalid/covers/${slug}.jpg`;
}

interface EpisodeSpec {
  readonly episodeNumber: number;
  readonly unlockPolicy: UnlockPolicy;
  readonly priceCoins?: number;
  readonly status?: PublicationStatus;
  readonly durationSec?: number;
  readonly title?: string;
}

function episodesOf(
  dramaId: string,
  seasonId: string,
  idPrefix: string,
  specs: readonly EpisodeSpec[],
): readonly EpisodeRecord[] {
  return specs.map((spec) => ({
    id: `${idPrefix}${String(spec.episodeNumber).padStart(2, '0')}`,
    dramaId,
    seasonId,
    episodeNumber: spec.episodeNumber,
    title: spec.title ?? null,
    durationSec: spec.durationSec ?? 96,
    unlockPolicy: spec.unlockPolicy,
    priceCoins: spec.priceCoins ?? null,
    status: spec.status ?? 'PUBLISHED',
  }));
}

function paidRun(from: number, to: number, priceCoins: number): readonly EpisodeSpec[] {
  return Array.from({ length: to - from + 1 }, (_, index) => ({
    episodeNumber: from + index,
    unlockPolicy: 'COIN_OR_VIP' as const,
    priceCoins,
  }));
}

export const SEED_DRAMAS: readonly DramaRecord[] = [
  {
    id: 'drm_revenge_0001',
    title: 'Reborn at the Banquet',
    description:
      'Humiliated at her own engagement party, she wakes up three years earlier with every name ' +
      'she needs and nothing left to lose.',
    coverUrl: cover('reborn-at-the-banquet'),
    horizontalCoverUrl: cover('reborn-at-the-banquet-wide'),
    category: 'REVENGE',
    tags: ['revenge', 'wealthy-family'],
    status: 'PUBLISHED',
    totalSeasons: 1,
    totalEpisodes: 7,
    freeEpisodes: 3,
    isCompleted: true,
    releaseAt: '2026-05-04T08:00:00.000Z',
    stat: { playCount: 1_200_000, favoriteCount: 34_000, score: 9.1 },
  },
  {
    id: 'drm_dynasty_0002',
    title: 'Twin Moons Dynasty',
    description:
      'A palace physician wakes in the body of the empress she was executed for failing.',
    coverUrl: cover('twin-moons-dynasty'),
    horizontalCoverUrl: null,
    category: 'FANTASY',
    tags: ['revenge', 'time-travel'],
    status: 'PUBLISHED',
    totalSeasons: 2,
    totalEpisodes: 6,
    freeEpisodes: 3,
    isCompleted: false,
    releaseAt: '2026-06-18T08:00:00.000Z',
    stat: { playCount: 860_000, favoriteCount: 21_500, score: 8.7 },
  },
  {
    id: 'drm_sweet_0003',
    title: 'Sweet Trap',
    description: 'The intern she keeps firing owns the building.',
    coverUrl: cover('sweet-trap'),
    horizontalCoverUrl: null,
    category: 'ROMANCE',
    tags: ['sweet', 'office'],
    status: 'PUBLISHED',
    totalSeasons: 1,
    totalEpisodes: 4,
    freeEpisodes: 5,
    isCompleted: false,
    releaseAt: '2026-07-30T08:00:00.000Z',
    stat: { playCount: 410_000, favoriteCount: 18_200, score: 8.4 },
  },
  {
    id: 'drm_suspense_0004',
    title: 'The Ninth Tenant',
    description: 'Eight flats are occupied. Nine sets of footsteps come home every night.',
    coverUrl: cover('the-ninth-tenant'),
    horizontalCoverUrl: null,
    category: 'SUSPENSE',
    tags: ['mystery'],
    status: 'PUBLISHED',
    totalSeasons: 1,
    totalEpisodes: 3,
    freeEpisodes: 2,
    isCompleted: true,
    releaseAt: '2026-03-11T08:00:00.000Z',
    stat: { playCount: 260_000, favoriteCount: 9_800, score: 8.9 },
  },
  {
    id: 'drm_comedy_0005',
    title: 'Boss of Noodles',
    description: 'A billionaire hides in his own noodle shop and is immediately put on dish duty.',
    coverUrl: cover('boss-of-noodles'),
    horizontalCoverUrl: null,
    category: 'COMEDY',
    tags: ['comedy', 'food'],
    status: 'PUBLISHED',
    totalSeasons: 1,
    totalEpisodes: 2,
    freeEpisodes: 5,
    isCompleted: true,
    releaseAt: '2026-02-02T08:00:00.000Z',
    stat: { playCount: 95_000, favoriteCount: 4_100, score: 8.1 },
  },
  {
    id: 'drm_family_0006',
    title: "Mother's Debt",
    description:
      'Thirty years of unpaid overtime, itemised, and delivered to the family that owes it.',
    coverUrl: cover('mothers-debt'),
    horizontalCoverUrl: null,
    category: 'FAMILY',
    tags: ['family'],
    status: 'PUBLISHED',
    totalSeasons: 1,
    totalEpisodes: 3,
    freeEpisodes: 1,
    isCompleted: false,
    releaseAt: '2026-07-02T08:00:00.000Z',
    stat: { playCount: 12_000, favoriteCount: 600, score: 7.9 },
  },
  {
    id: 'drm_offline_0007',
    title: 'Withdrawn Serial',
    description: 'Delisted while an appeal is pending.',
    coverUrl: cover('withdrawn-serial'),
    horizontalCoverUrl: null,
    category: 'SUSPENSE',
    tags: ['mystery'],
    status: 'OFFLINE',
    totalSeasons: 1,
    totalEpisodes: 2,
    freeEpisodes: 3,
    isCompleted: true,
    releaseAt: '2026-08-01T08:00:00.000Z',
    stat: { playCount: 500_000, favoriteCount: 15_000, score: 8.5 },
  },
  {
    id: 'drm_draft_0008',
    title: 'Unannounced',
    description: 'Scheduled, not published.',
    coverUrl: cover('unannounced'),
    horizontalCoverUrl: null,
    category: 'OTHER',
    tags: [],
    status: 'DRAFT',
    totalSeasons: 0,
    totalEpisodes: 0,
    freeEpisodes: 3,
    isCompleted: false,
    releaseAt: '2026-09-01T08:00:00.000Z',
    stat: { playCount: 0, favoriteCount: 0, score: 0 },
  },
];

export const SEED_SEASONS: readonly SeasonRecord[] = [
  {
    id: 'ssn_revenge_s1',
    dramaId: 'drm_revenge_0001',
    seasonNumber: 1,
    title: null,
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_dynasty_s1',
    dramaId: 'drm_dynasty_0002',
    seasonNumber: 1,
    title: 'The Physician',
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_dynasty_s2',
    dramaId: 'drm_dynasty_0002',
    seasonNumber: 2,
    title: 'The Empress',
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_dynasty_s3',
    dramaId: 'drm_dynasty_0002',
    seasonNumber: 3,
    title: 'The Regent',
    status: 'OFFLINE',
  },
  {
    id: 'ssn_sweet_s1',
    dramaId: 'drm_sweet_0003',
    seasonNumber: 1,
    title: null,
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_suspense_s1',
    dramaId: 'drm_suspense_0004',
    seasonNumber: 1,
    title: null,
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_comedy_s1',
    dramaId: 'drm_comedy_0005',
    seasonNumber: 1,
    title: null,
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_family_s1',
    dramaId: 'drm_family_0006',
    seasonNumber: 1,
    title: null,
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_offline_s1',
    dramaId: 'drm_offline_0007',
    seasonNumber: 1,
    title: null,
    status: 'PUBLISHED',
  },
  {
    id: 'ssn_draft_s1',
    dramaId: 'drm_draft_0008',
    seasonNumber: 1,
    title: null,
    status: 'DRAFT',
  },
];

export const SEED_EPISODES: readonly EpisodeRecord[] = [
  ...episodesOf('drm_revenge_0001', 'ssn_revenge_s1', 'ep_revenge_e', [
    ...paidRun(1, 4, 60),
    // Marked free by content operations even though it sits past the free window.
    { episodeNumber: 5, unlockPolicy: 'FREE' },
    { episodeNumber: 6, unlockPolicy: 'VIP_ONLY' },
    { episodeNumber: 7, unlockPolicy: 'COIN', priceCoins: 60, status: 'OFFLINE' },
    { episodeNumber: 8, unlockPolicy: 'COIN_OR_VIP', priceCoins: 60, status: 'DRAFT' },
  ]),
  ...episodesOf('drm_dynasty_0002', 'ssn_dynasty_s1', 'ep_dynasty_s1e', paidRun(1, 3, 80)),
  ...episodesOf('drm_dynasty_0002', 'ssn_dynasty_s2', 'ep_dynasty_s2e', paidRun(1, 3, 80)),
  ...episodesOf('drm_dynasty_0002', 'ssn_dynasty_s3', 'ep_dynasty_s3e', paidRun(1, 2, 80)),
  ...episodesOf('drm_sweet_0003', 'ssn_sweet_s1', 'ep_sweet_e', paidRun(1, 4, 50)),
  ...episodesOf('drm_suspense_0004', 'ssn_suspense_s1', 'ep_suspense_e', [
    { episodeNumber: 1, unlockPolicy: 'COIN', priceCoins: 40 },
    { episodeNumber: 2, unlockPolicy: 'COIN', priceCoins: 40 },
    { episodeNumber: 3, unlockPolicy: 'COIN', priceCoins: 40 },
  ]),
  ...episodesOf('drm_comedy_0005', 'ssn_comedy_s1', 'ep_comedy_e', paidRun(1, 2, 40)),
  ...episodesOf('drm_family_0006', 'ssn_family_s1', 'ep_family_e', [
    { episodeNumber: 1, unlockPolicy: 'COIN_OR_VIP', priceCoins: 70 },
    { episodeNumber: 2, unlockPolicy: 'COIN_OR_VIP', priceCoins: 70 },
    { episodeNumber: 3, unlockPolicy: 'COIN_OR_VIP', priceCoins: 70 },
  ]),
  ...episodesOf('drm_offline_0007', 'ssn_offline_s1', 'ep_offline_e', paidRun(1, 2, 60)),
  ...episodesOf('drm_draft_0008', 'ssn_draft_s1', 'ep_draft_e', paidRun(1, 1, 60)),
];
