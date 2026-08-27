import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page, Result } from '@minidrama/shared';

import { classifyFailure } from './failure';
import type { ApiFailure, SurfaceError } from './failure';

/**
 * A cursor-paged collection.
 *
 * The distinction that shapes this hook: **a first page that fails is an error screen, and a
 * further page that fails is not.** Once the user is looking at content, replacing it with an
 * error component because page three timed out destroys their place in the list to tell them
 * something they can see for themselves. So `error` belongs to the first page and `appendError`
 * belongs to the rest, and the surfaces render them in different places.
 *
 * Paging is `pageInfo.nextCursor` echoed verbatim, never parsed (`docs/12-api-contracts.md` §2.3).
 * `hasMore` is not consulted: `nextCursor === null` is exactly equivalent and leaves one thing to
 * get wrong instead of two.
 */
export interface PagedResource<T> {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly items: readonly T[];
  /** The first-page failure. `null` unless `status` is `failed`. */
  readonly error: SurfaceError | null;
  readonly nextCursor: string | null;
  readonly appending: boolean;
  /** A failure while appending. The items already on screen stay exactly where they are. */
  readonly appendError: SurfaceError | null;
}

export interface PagedResourceHandle<T> extends PagedResource<T> {
  readonly reload: () => void;
  readonly loadMore: () => void;
}

export type PageLoader<T> = (cursor: string | undefined) => Promise<Result<Page<T>, ApiFailure>>;

const EMPTY: PagedResource<never> = {
  status: 'loading',
  items: [],
  error: null,
  nextCursor: null,
  appending: false,
  appendError: null,
};

/**
 * `requestKey` identifies the list, exactly as in `useResource`, and for the same reason: keying on
 * the loader's identity turns a forgotten `useCallback` into a render loop.
 *
 * `identify` exists because the feed's cursor is only stable while the ranking is
 * (`docs/handoff/w2-work-d.md` §5): the mock recomputes the ranking per request, so a catalogue
 * change mid-scroll can hand the same drama back on the next page. The server guarantees a drama
 * appears once per *response*; across responses that is the client's problem, and a duplicate key
 * in a React list is a rendering bug on top of a double impression.
 */
export function usePagedResource<T>(
  loadPage: PageLoader<T>,
  identify: (item: T) => string,
  requestKey: string,
): PagedResourceHandle<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PagedResource<T>>(EMPTY);

  const loadRef = useRef(loadPage);
  const identifyRef = useRef(identify);
  useEffect(() => {
    loadRef.current = loadPage;
    identifyRef.current = identify;
  });

  // Which first-page request is current. An append that resolves after a reload belongs to a list
  // that no longer exists, and appending it would splice two different rankings together.
  const generation = useRef(0);
  const latest = useRef<PagedResource<T>>(EMPTY);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    generation.current += 1;
    const token = generation.current;
    setState(EMPTY);

    void loadRef.current(undefined).then((result) => {
      if (generation.current !== token) {
        return;
      }
      setState(
        result.ok
          ? {
              status: 'ready',
              items: dedupe([], result.value.items, identifyRef.current),
              error: null,
              nextCursor: result.value.pageInfo.nextCursor,
              appending: false,
              appendError: null,
            }
          : { ...EMPTY, status: 'failed', error: classifyFailure(result.error) },
      );
    });
  }, [requestKey, attempt]);

  const loadMore = useCallback(() => {
    const current = latest.current;
    if (current.status !== 'ready' || current.appending || current.nextCursor === null) {
      return;
    }

    const token = generation.current;
    const cursor = current.nextCursor;
    setState({ ...current, appending: true, appendError: null });

    void loadRef.current(cursor).then((result) => {
      if (generation.current !== token) {
        return;
      }
      setState((previous) =>
        result.ok
          ? {
              ...previous,
              appending: false,
              items: dedupe(previous.items, result.value.items, identifyRef.current),
              nextCursor: result.value.pageInfo.nextCursor,
            }
          : { ...previous, appending: false, appendError: classifyFailure(result.error) },
      );
    });
  }, []);

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  return { ...state, reload, loadMore };
}

/** Appends, dropping anything already present. First occurrence wins, so positions never shift. */
function dedupe<T>(
  existing: readonly T[],
  incoming: readonly T[],
  identify: (item: T) => string,
): readonly T[] {
  const seen = new Set(existing.map(identify));
  const merged = [...existing];

  for (const item of incoming) {
    const key = identify(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged;
}
