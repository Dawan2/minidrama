import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { Page, Result } from '@minidrama/shared';

import { usePagedResource } from './use-paged-resource';
import { apiFailure } from './failure';
import type { ApiFailure } from './failure';

interface Row {
  readonly id: string;
}

function identify(row: Row): string {
  return row.id;
}

function rows(...ids: readonly string[]): readonly Row[] {
  return ids.map((id) => ({ id }));
}

function pageOf(items: readonly Row[], nextCursor: string | null = null): Page<Row> {
  return { items, pageInfo: { nextCursor, hasMore: nextCursor !== null } };
}

type Loader = (cursor: string | undefined) => Promise<Result<Page<Row>, ApiFailure>>;

function renderPaged(loadPage: Loader) {
  return renderHook(() => usePagedResource(loadPage, identify, 'rows'));
}

describe('a paged resource', () => {
  it('starts loading and then holds the first page', async () => {
    const { result } = renderPaged(() => Promise.resolve(ok(pageOf(rows('a', 'b')))));

    expect(result.current.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.items).toEqual(rows('a', 'b'));
    expect(result.current.nextCursor).toBeNull();
  });

  it('requests the first page with no cursor', async () => {
    const loadPage = vi.fn<Loader>(() => Promise.resolve(ok(pageOf([]))));
    renderPaged(loadPage);

    await waitFor(() => {
      expect(loadPage).toHaveBeenCalled();
    });
    expect(loadPage.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('reports an empty first page as ready rather than as an error', async () => {
    const { result } = renderPaged(() => Promise.resolve(ok(pageOf([]))));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('classifies a first-page failure', async () => {
    const { result } = renderPaged(() =>
      Promise.resolve(err(apiFailure({ kind: 'HTTP', status: 410, message: 'gone' }))),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    expect(result.current.error).toMatchObject({ kind: 'TERMINAL', reason: 'OFFLINE' });
  });

  it('appends the next page and echoes the cursor it was given', async () => {
    const loadPage = vi.fn<Loader>((cursor) =>
      Promise.resolve(
        ok(cursor === undefined ? pageOf(rows('a'), 'cur_2') : pageOf(rows('b'), null)),
      ),
    );
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.items).toEqual(rows('a', 'b'));
    });

    expect(loadPage.mock.calls[1]?.[0]).toBe('cur_2');
    expect(result.current.nextCursor).toBeNull();
  });

  /**
   * The feed's cursor is only stable while the ranking is (`docs/handoff/w2-work-d.md` §5), so the
   * same drama can come back on the next page. A duplicate is a double impression and a duplicate
   * React key, and it must not shift the position of anything already on screen.
   */
  it('drops an item the list already holds, keeping the first position', async () => {
    const loadPage = vi.fn<Loader>((cursor) =>
      Promise.resolve(
        ok(cursor === undefined ? pageOf(rows('a', 'b'), 'cur_2') : pageOf(rows('b', 'c'), null)),
      ),
    );
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.items).toEqual(rows('a', 'b', 'c'));
    });
  });

  /**
   * Once there is content on screen, an append failure must not replace it. Throwing the list away
   * to report that page three was late costs the user their place to tell them nothing.
   */
  it('keeps the loaded items when an append fails', async () => {
    const loadPage = vi.fn<Loader>((cursor) =>
      cursor === undefined
        ? Promise.resolve(ok(pageOf(rows('a', 'b'), 'cur_2')))
        : Promise.resolve(err(apiFailure({ kind: 'OFFLINE', message: 'no network' }))),
    );
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.appendError).not.toBeNull();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.items).toEqual(rows('a', 'b'));
    expect(result.current.error).toBeNull();
    // The cursor survives, so the same page can be requested again.
    expect(result.current.nextCursor).toBe('cur_2');
  });

  it('retries the same cursor after a failed append', async () => {
    let attempt = 0;
    const loadPage = vi.fn<Loader>((cursor) => {
      if (cursor === undefined) return Promise.resolve(ok(pageOf(rows('a'), 'cur_2')));
      attempt += 1;
      return attempt === 1
        ? Promise.resolve(err(apiFailure({ kind: 'TIMEOUT', message: 'slow' })))
        : Promise.resolve(ok(pageOf(rows('b'))));
    });
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.appendError).not.toBeNull();
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.items).toEqual(rows('a', 'b'));
    });

    expect(result.current.appendError).toBeNull();
    expect(loadPage.mock.calls.filter(([cursor]) => cursor === 'cur_2')).toHaveLength(2);
  });

  it('does nothing when asked for more and there is no cursor', async () => {
    const loadPage = vi.fn<Loader>(() => Promise.resolve(ok(pageOf(rows('a')))));
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    const before = loadPage.mock.calls.length;
    act(() => {
      result.current.loadMore();
    });

    expect(loadPage.mock.calls.length).toBe(before);
  });

  it('ignores a second request for more while one is in flight', async () => {
    let release: ((result: Result<Page<Row>, ApiFailure>) => void) | null = null;
    const loadPage = vi.fn<Loader>((cursor) =>
      cursor === undefined
        ? Promise.resolve(ok(pageOf(rows('a'), 'cur_2')))
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.appending).toBe(true);
    });
    act(() => {
      result.current.loadMore();
    });

    expect(loadPage.mock.calls.filter(([cursor]) => cursor === 'cur_2')).toHaveLength(1);

    await act(async () => {
      release?.(ok(pageOf(rows('b'))));
      await Promise.resolve();
    });
    expect(result.current.appending).toBe(false);
  });

  /**
   * The reason the list is keyed rather than identified by its closure: an inline arrow is a new
   * function every render, so keying on it would make every completed page schedule another one.
   */
  it('does not reload when only the loader identity changes', async () => {
    const loadPage = vi.fn<Loader>(() => Promise.resolve(ok(pageOf(rows('a')))));
    const { result, rerender } = renderHook(() =>
      usePagedResource((cursor) => loadPage(cursor), identify, 'rows'),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    const before = loadPage.mock.calls.length;
    rerender();
    rerender();

    expect(loadPage.mock.calls.length).toBe(before);
  });

  it('reloads from the first page when the key changes', async () => {
    const loadPage = vi.fn<(key: string) => Promise<Result<Page<Row>, ApiFailure>>>((key) =>
      Promise.resolve(ok(pageOf(rows(key)))),
    );
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePagedResource(() => loadPage(key), identify, key),
      { initialProps: { key: 'a' } },
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(rows('a'));
    });
    rerender({ key: 'b' });
    await waitFor(() => {
      expect(result.current.items).toEqual(rows('b'));
    });
  });

  it('reloads from the first page and clears the previous failure', async () => {
    let attempt = 0;
    const loadPage = vi.fn<Loader>(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.resolve(err(apiFailure({ kind: 'OFFLINE', message: 'no network' })))
        : Promise.resolve(ok(pageOf(rows('a'))));
    });
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual(rows('a'));
  });

  /**
   * An append that resolves after a reload belongs to a list that no longer exists. Splicing it in
   * would join two different rankings and produce an order that came from neither.
   */
  it('discards an append that resolves after a reload', async () => {
    let release: ((result: Result<Page<Row>, ApiFailure>) => void) | null = null;
    let firstPageCalls = 0;
    const loadPage = vi.fn<Loader>((cursor) => {
      if (cursor === undefined) {
        firstPageCalls += 1;
        return Promise.resolve(
          ok(firstPageCalls === 1 ? pageOf(rows('a'), 'cur_2') : pageOf(rows('z'))),
        );
      }
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const { result } = renderPaged(loadPage);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => {
      expect(result.current.appending).toBe(true);
    });

    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.items).toEqual(rows('z'));
    });

    await act(async () => {
      release?.(ok(pageOf(rows('stale'))));
      await Promise.resolve();
    });

    expect(result.current.items).toEqual(rows('z'));
  });
});
