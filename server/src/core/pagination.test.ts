import { describe, expect, it } from 'vitest';

import {
  ascendingKey,
  decodeCursor,
  descendingKey,
  encodeCursor,
  paginate,
  parseLimit,
  queryFingerprint,
} from './pagination.js';

interface Row {
  readonly id: string;
  readonly rank: number;
}

const rows: readonly Row[] = Array.from({ length: 7 }, (_, index) => ({
  id: `row_${String(index + 1)}`,
  rank: index + 1,
}));

const keyOf = (row: Row): string => ascendingKey(row.rank);
const FINGERPRINT = queryFingerprint({ sort: 'HOT' });

function pageOf(cursor: string | undefined, limit = 3): ReturnType<typeof paginate<Row>> {
  return paginate(rows, { keyOf, limit, cursor, fingerprint: FINGERPRINT });
}

describe('paginate', () => {
  it('walks the whole collection exactly once across pages', () => {
    const seen: string[] = [];
    let cursor: string | undefined;

    for (let guard = 0; guard < 10; guard += 1) {
      const page = pageOf(cursor);
      if (!page.ok) throw new Error('pagination rejected its own cursor');

      seen.push(...page.value.items.map((row) => row.id));
      if (!page.value.pageInfo.hasMore) break;
      cursor = page.value.pageInfo.nextCursor ?? undefined;
    }

    expect(seen).toEqual(rows.map((row) => row.id));
    expect(new Set(seen).size).toBe(rows.length);
  });

  it('reports nextCursor as non-null exactly when there is more', () => {
    const first = pageOf(undefined);
    const last = pageOf(undefined, 100);
    if (!first.ok || !last.ok) throw new Error('unexpected rejection');

    expect(first.value.pageInfo.hasMore).toBe(true);
    expect(first.value.pageInfo.nextCursor).not.toBeNull();
    expect(last.value.pageInfo.hasMore).toBe(false);
    expect(last.value.pageInfo.nextCursor).toBeNull();
  });

  it('returns an empty final page rather than repeating the last item', () => {
    const page = pageOf(encodeCursor(FINGERPRINT, ascendingKey(7)));
    if (!page.ok) throw new Error('unexpected rejection');

    expect(page.value.items).toEqual([]);
    expect(page.value.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  // The reason this is keyset and not offset pagination.
  it('does not skip an item when the cursor item is removed between pages', () => {
    const first = paginate(rows, { keyOf, limit: 3, cursor: undefined, fingerprint: FINGERPRINT });
    if (!first.ok) throw new Error('unexpected rejection');

    const withoutCursorItem = rows.filter((row) => row.id !== 'row_3');
    const second = paginate(withoutCursorItem, {
      keyOf,
      limit: 3,
      cursor: first.value.pageInfo.nextCursor ?? undefined,
      fingerprint: FINGERPRINT,
    });
    if (!second.ok) throw new Error('unexpected rejection');

    expect(second.value.items.map((row) => row.id)).toEqual(['row_4', 'row_5', 'row_6']);
  });

  it('does not show an item twice when one is inserted ahead of the cursor', () => {
    const first = pageOf(undefined);
    if (!first.ok) throw new Error('unexpected rejection');

    const withInsertion = [...rows, { id: 'row_0', rank: 0 }].sort((a, b) => a.rank - b.rank);
    const second = paginate(withInsertion, {
      keyOf,
      limit: 3,
      cursor: first.value.pageInfo.nextCursor ?? undefined,
      fingerprint: FINGERPRINT,
    });
    if (!second.ok) throw new Error('unexpected rejection');

    const secondIds = second.value.items.map((row) => row.id);
    expect(secondIds).toEqual(['row_4', 'row_5', 'row_6']);
    expect(secondIds.some((id) => first.value.items.some((row) => row.id === id))).toBe(false);
  });

  it('rejects a cursor minted by a different query', () => {
    const otherQuery = paginate(rows, {
      keyOf,
      limit: 3,
      cursor: encodeCursor(queryFingerprint({ sort: 'NEW' }), ascendingKey(3)),
      fingerprint: FINGERPRINT,
    });

    expect(otherQuery).toEqual({ ok: false, error: 'INVALID_CURSOR' });
  });

  it.each([
    ['not base64', '!!!!'],
    ['base64 of something that is not JSON', Buffer.from('nope').toString('base64url')],
    ['JSON without the expected fields', Buffer.from('{"a":1}').toString('base64url')],
    ['an empty string', ''],
    ['an oversized string', 'a'.repeat(513)],
  ])('rejects a cursor that is %s', (_label, cursor) => {
    expect(pageOf(cursor)).toEqual({ ok: false, error: 'INVALID_CURSOR' });
  });
});

describe('cursor encoding', () => {
  it('round-trips the fingerprint and the key', () => {
    const decoded = decodeCursor(encodeCursor('abc123', ascendingKey(42)));
    expect(decoded).toEqual({ ok: true, value: { f: 'abc123', k: ascendingKey(42) } });
  });

  it('is URL-safe so it survives a query string unescaped', () => {
    const cursor = encodeCursor(queryFingerprint({ sort: 'HOT', tag: '逆袭' }), 'k'.repeat(40));
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(cursor)).toBe(cursor);
  });

  // A cursor is echoed by the client, logged, and may be pasted into a bug report.
  it('carries nothing beyond the query fingerprint and the sort key', () => {
    const decoded = decodeCursor(encodeCursor('abc123', 'k'));
    if (!decoded.ok) throw new Error('unexpected rejection');
    expect(Object.keys(decoded.value).sort()).toEqual(['f', 'k']);
  });
});

describe('queryFingerprint', () => {
  it('ignores key order but not values', () => {
    expect(queryFingerprint({ sort: 'HOT', tag: 'a' })).toBe(
      queryFingerprint({ tag: 'a', sort: 'HOT' }),
    );
    expect(queryFingerprint({ sort: 'HOT', tag: 'a' })).not.toBe(
      queryFingerprint({ sort: 'NEW', tag: 'a' }),
    );
  });

  it('treats an absent filter as distinct from a present one', () => {
    expect(queryFingerprint({ category: null })).not.toBe(
      queryFingerprint({ category: 'ROMANCE' }),
    );
  });
});

describe('parseLimit', () => {
  const options = { fallback: 20, max: 100 };

  it('falls back when the parameter is absent', () => {
    expect(parseLimit(undefined, options)).toEqual({ ok: true, value: 20 });
  });

  it('accepts the documented bounds', () => {
    expect(parseLimit('1', options)).toEqual({ ok: true, value: 1 });
    expect(parseLimit('100', options)).toEqual({ ok: true, value: 100 });
  });

  it.each(['0', '101', '-1', '1.5', 'twenty', '', ' 20', '20 ', '0x10', '1e2'])(
    'rejects %j rather than clamping it',
    (raw) => {
      expect(parseLimit(raw, options)).toEqual({ ok: false, error: 'INVALID_LIMIT' });
    },
  );

  it('rejects a repeated parameter, which arrives as an array', () => {
    expect(parseLimit(['10', '20'], options)).toEqual({ ok: false, error: 'INVALID_LIMIT' });
  });
});

describe('sort keys', () => {
  it('orders numbers lexicographically, which plain stringification does not', () => {
    expect(ascendingKey(9) < ascendingKey(10)).toBe(true);
    expect(String(9) < String(10)).toBe(false);
  });

  it('inverts order for descending sorts', () => {
    expect(descendingKey(1_200_000) < descendingKey(9_000)).toBe(true);
  });

  it('keeps keys the same width so comparisons never depend on length', () => {
    expect(ascendingKey(0)).toHaveLength(12);
    expect(ascendingKey(1_200_000)).toHaveLength(12);
    expect(descendingKey(0)).toHaveLength(12);
  });

  it('clamps rather than producing a wider key that would sort out of place', () => {
    expect(ascendingKey(-5)).toBe(ascendingKey(0));
    expect(ascendingKey(10 ** 13)).toHaveLength(12);
  });
});
