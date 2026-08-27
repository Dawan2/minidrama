import { describe, expect, it } from 'vitest';
import { DRAMA_CATEGORIES } from '@minidrama/shared';

import {
  BROWSE_MAX_TAG_LENGTH,
  browseHasFilters,
  browsePath,
  browseRequestKey,
  browseSearchParams,
  parseBrowseQuery,
} from './browse-query';

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('parseBrowseQuery', () => {
  it('defaults to HOT with no category and no tag', () => {
    expect(parseBrowseQuery(params(''))).toEqual({
      category: undefined,
      tag: undefined,
      sort: 'HOT',
    });
  });

  it('keeps a published category and drops one the contract does not list', () => {
    expect(parseBrowseQuery(params('category=REVENGE')).category).toBe('REVENGE');
    expect(parseBrowseQuery(params('category=BOGUS')).category).toBeUndefined();
    expect(parseBrowseQuery(params('category=revenge')).category).toBeUndefined();
  });

  it('accepts every published category, so a chip cannot name a value the parser then drops', () => {
    for (const category of DRAMA_CATEGORIES) {
      expect(parseBrowseQuery(params(`category=${category}`)).category).toBe(category);
    }
  });

  it('keeps HOT and NEW and treats any other sort as the default', () => {
    expect(parseBrowseQuery(params('sort=NEW')).sort).toBe('NEW');
    expect(parseBrowseQuery(params('sort=HOT')).sort).toBe('HOT');
    expect(parseBrowseQuery(params('sort=POPULAR')).sort).toBe('HOT');
  });

  it('keeps a tag the server would accept and drops one it would refuse', () => {
    expect(parseBrowseQuery(params('tag=revenge')).tag).toBe('revenge');
    expect(parseBrowseQuery(params('tag=')).tag).toBeUndefined();
    expect(
      parseBrowseQuery(params(`tag=${'x'.repeat(BROWSE_MAX_TAG_LENGTH + 1)}`)).tag,
    ).toBeUndefined();
  });
});

describe('browseSearchParams', () => {
  it('omits the defaults so two spellings of the same view cannot drift', () => {
    expect(browseSearchParams({ category: undefined, tag: undefined, sort: 'HOT' })).toEqual({});
    expect(browseSearchParams({ category: 'REVENGE', tag: undefined, sort: 'HOT' })).toEqual({
      category: 'REVENGE',
    });
    expect(browseSearchParams({ category: undefined, tag: 'ceo', sort: 'NEW' })).toEqual({
      tag: 'ceo',
      sort: 'NEW',
    });
  });
});

describe('browsePath', () => {
  it('is the bare path when nothing is filtered', () => {
    expect(browsePath()).toBe('/browse');
    expect(browsePath({ sort: 'HOT' })).toBe('/browse');
  });

  it('names the parameters the endpoint takes', () => {
    expect(browsePath({ category: 'REVENGE', sort: 'NEW' })).toBe(
      '/browse?category=REVENGE&sort=NEW',
    );
  });

  it('escapes a tag that would otherwise add parameters of its own', () => {
    expect(browsePath({ tag: 'a&b=c' })).toBe('/browse?tag=a%26b%3Dc');
  });
});

describe('browseHasFilters', () => {
  it('treats a non-default sort as a filter, so an empty NEW list can still be cleared', () => {
    expect(browseHasFilters({ category: undefined, tag: undefined, sort: 'HOT' })).toBe(false);
    expect(browseHasFilters({ category: undefined, tag: undefined, sort: 'NEW' })).toBe(true);
    expect(browseHasFilters({ category: 'COMEDY', tag: undefined, sort: 'HOT' })).toBe(true);
  });
});

describe('browseRequestKey', () => {
  it('changes when a filter that the server fingerprints changes', () => {
    const base = { category: undefined, tag: undefined, sort: 'HOT' as const };
    expect(browseRequestKey(base)).not.toBe(browseRequestKey({ ...base, sort: 'NEW' }));
    expect(browseRequestKey(base)).not.toBe(browseRequestKey({ ...base, category: 'REVENGE' }));
    expect(browseRequestKey(base)).not.toBe(browseRequestKey({ ...base, tag: 'ceo' }));
  });
});
