import { describe, expect, it } from 'vitest';

import { SEED_SEARCHABLE_DRAMAS, createSeedDramaDirectory } from './dramas.js';
import { findMatches, foldForSearch } from './search.js';
import type { SearchableDrama } from './dramas.js';

/**
 * The matching rules, away from HTTP.
 *
 * The ranking is a judgement, and a judgement asserted only through a route is one nobody can
 * change with confidence — so the cases live here, against fixtures small enough that the expected
 * order is obvious by inspection.
 */

function drama(id: string, title: string, tags: readonly string[], playCount = 0): SearchableDrama {
  return { id, title, tags, status: 'PUBLISHED', stat: { playCount } };
}

function idsFor(query: string, dramas: readonly SearchableDrama[]): readonly string[] {
  return findMatches(dramas, query).map((match) => match.drama.id);
}

describe('foldForSearch', () => {
  it('folds case without depending on the server locale', () => {
    expect(foldForSearch('Twin MOONS Dynasty')).toBe('twin moons dynasty');
  });

  // An IME emits fullwidth forms routinely, and a viewer cannot see the difference on screen.
  it.each([
    ['Ｎｉｎｔｈ', 'ninth'],
    ['ＴＲＡＰ', 'trap'],
    ['ﬁre', 'fire'],
  ])('normalises the compatibility form %j to %j', (input, expected) => {
    expect(foldForSearch(input)).toBe(expected);
  });

  // A phone keyboard usually cannot produce the accent, and refusing the row is not a defensible
  // reading of the viewer's intent.
  it.each([
    ['Café', 'cafe'],
    ['CAFÉ', 'cafe'],
    ['cafe\u0301', 'cafe'],
    ['Bí Mật', 'bi mat'],
  ])('strips Latin diacritics from %j', (input, expected) => {
    expect(foldForSearch(input)).toBe(expected);
  });

  // The dakuten is not a diacritic to be discarded: `ジ` and `シ` are different syllables, and a
  // fold that took every combining mark off would quietly merge them.
  it.each([
    ['ジ', 'ジ'],
    ['ﾆﾝｼﾞｬ', 'ニンジャ'],
    ['パン', 'パン'],
  ])('keeps the kana voiced mark in %j', (input, expected) => {
    expect(foldForSearch(input)).toBe(expected);
  });

  it('collapses whitespace and trims', () => {
    expect(foldForSearch('  The   Ninth\tTenant ')).toBe('the ninth tenant');
  });

  // The majority of this catalogue is CJK and none of the rules above may disturb it.
  it('leaves CJK text alone', () => {
    expect(foldForSearch('重生之豪門夜宴')).toBe('重生之豪門夜宴');
  });
});

describe('findMatches — what counts as a match', () => {
  const dramas = [drama('drm_a', 'Sweet Trap', ['sweet', 'office'])];

  it.each([['Sweet'], ['sweet'], ['SWEET TRAP'], ['  sweet   trap  '], ['eet Tr']])(
    'matches the title through %j',
    (query) => {
      expect(idsFor(query, dramas)).toEqual(['drm_a']);
    },
  );

  it('matches a tag', () => {
    expect(idsFor('office', dramas)).toEqual(['drm_a']);
  });

  it('matches nothing when nothing matches', () => {
    expect(findMatches(dramas, 'wuxia')).toEqual([]);
  });

  it('matches CJK by substring', () => {
    const cjk = [drama('drm_cjk', '重生之豪門夜宴', ['逆襲'])];

    expect(idsFor('豪門', cjk)).toEqual(['drm_cjk']);
    expect(idsFor('逆襲', cjk)).toEqual(['drm_cjk']);
  });

  // `''` is a prefix of every string. The route cannot send one — `validateSearchQuery` refuses it
  // — and this branch is the difference between that being a bug and being a catalogue dump.
  it.each([[''], ['   ']])('returns nothing for %j rather than everything', (query) => {
    expect(findMatches(SEED_SEARCHABLE_DRAMAS, query)).toEqual([]);
  });

  it('reports which field matched', () => {
    expect(findMatches(dramas, 'Sweet Trap')[0]?.matchedOn).toBe('TITLE');
    expect(findMatches(dramas, 'office')[0]?.matchedOn).toBe('TAG');
  });

  // A title match and a tag match on the same drama is one hit, reported as the stronger one.
  it('reports a title match when both a title and a tag match', () => {
    const both = [drama('drm_a', 'Sweet Trap', ['sweet'])];

    expect(findMatches(both, 'sweet')).toEqual([{ drama: both[0], matchedOn: 'TITLE' }]);
  });
});

describe('findMatches — the order', () => {
  // A viewer typing a title is naming one drama; a tag is a genre. Answering the genre first is the
  // classic failure of a naive search box.
  it('puts a title prefix before a title substring before a tag', () => {
    const dramas = [
      drama('drm_tag', 'Unrelated', ['sweet'], 900),
      drama('drm_substring', 'Bittersweet Revenge', [], 900),
      drama('drm_prefix', 'Sweet Trap', [], 1),
    ];

    expect(idsFor('sweet', dramas)).toEqual(['drm_prefix', 'drm_substring', 'drm_tag']);
  });

  it('puts an exact tag before a tag that merely contains the query', () => {
    const dramas = [
      drama('drm_partial', 'A', ['revenge-comedy'], 900),
      drama('drm_exact', 'B', ['revenge'], 1),
    ];

    expect(idsFor('revenge', dramas)).toEqual(['drm_exact', 'drm_partial']);
  });

  it('orders equal tiers by play count, most played first', () => {
    const dramas = [
      drama('drm_quiet', 'Sweet Trap', [], 10),
      drama('drm_popular', 'Sweet Revenge', [], 1_000),
    ];

    expect(idsFor('sweet', dramas)).toEqual(['drm_popular', 'drm_quiet']);
  });

  // An unstable comparator makes one query return one set of rows in two orders across two
  // requests, and a viewer reads that as the catalogue changing under them.
  it('breaks a full tie on the identifier, deterministically', () => {
    const dramas = [drama('drm_b', 'Sweet Trap', [], 500), drama('drm_a', 'Sweet Trap', [], 500)];

    expect(idsFor('sweet', dramas)).toEqual(['drm_a', 'drm_b']);
    expect(idsFor('sweet', [...dramas].reverse())).toEqual(['drm_a', 'drm_b']);
  });

  it('does not mutate the array it was given', () => {
    const dramas = [drama('drm_b', 'Sweet Trap', [], 1), drama('drm_a', 'Sweet Trap', [], 2)];
    const before = [...dramas];

    findMatches(dramas, 'sweet');

    expect(dramas).toEqual(before);
  });
});

describe('findMatches — against the seed', () => {
  it('ranks a shared tag by popularity', async () => {
    const dramas = await createSeedDramaDirectory().listSearchable();

    expect(idsFor('revenge', dramas)).toEqual(['drm_revenge_0001', 'drm_dynasty_0002']);
  });

  // "The Ninth Tenant" is the least played of the three and still comes first: the tier decides
  // before popularity does.
  it('ranks a title prefix ahead of two more popular substring matches', async () => {
    const dramas = await createSeedDramaDirectory().listSearchable();

    expect(idsFor('the', dramas)).toEqual([
      'drm_suspense_0004',
      'drm_revenge_0001',
      'drm_family_0006',
    ]);
  });

  // `E-13` in `docs/14-test-plan.md` §5.2: content that is not published must not be discoverable.
  // The delisted record out-ranks most of the seed, so a missing filter would be loud.
  it.each([['withdrawn'], ['unannounced'], ['serial']])(
    'never returns an unpublished drama for %j',
    async (query) => {
      const dramas = await createSeedDramaDirectory().listSearchable();

      expect(idsFor(query, dramas)).toEqual([]);
    },
  );
});
