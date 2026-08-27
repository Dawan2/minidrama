import { useCallback, useEffect, useRef, useState } from 'react';
import type { Result } from '@minidrama/shared';

import { classifyFailure } from './failure';
import type { ApiFailure, SurfaceError } from './failure';

/**
 * A single read, as a state machine the UI can exhaust.
 *
 * Three statuses, not four: "empty" is not a status here, because emptiness is a property of the
 * loaded value and only the surface knows what counts as empty. Deciding it in the hook would mean
 * a screen with two collections needs two hooks and a screen with an optional section cannot say
 * so. The IA's five states (`docs/02-information-architecture.md` §8.1) come out as
 * `loading` / `ready` + non-empty / `ready` + empty / `failed` + retryable / `failed` + terminal.
 */
export type Resource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'failed'; readonly error: SurfaceError };

export interface ResourceHandle<T> {
  readonly resource: Resource<T>;
  /** Discards the current state and reruns the load. Wired to the retry button. */
  readonly reload: () => void;
}

/**
 * The read is keyed, not closure-identified.
 *
 * `requestKey` is what says "this is a different request" — the drama id, the scene, whatever the
 * URL the read produces depends on. The obvious alternative is to rerun whenever `load` changes,
 * and it is a trap: an inline arrow is a new function on every render, so a caller who forgets
 * `useCallback` gets a render loop rather than an error, and the failure shows up as an out-of-memory
 * crash a long way from its cause. A key cannot fail that way, and it also makes the dependency
 * legible at the call site instead of hidden in a dependency array.
 */
export function useResource<T>(
  load: () => Promise<Result<T, ApiFailure>>,
  requestKey: string,
): ResourceHandle<T> {
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState<Resource<T>>({ status: 'loading' });

  // Always the newest loader, so a re-render with fresh props does not refetch but also does not
  // leave a stale closure behind for the next real request. Declared before the load effect so the
  // ref is current by the time that effect runs.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    setResource({ status: 'loading' });

    void loadRef.current().then((result) => {
      // Without this guard a slow first request can land after a fast retry and overwrite it,
      // which reads to the user as a retry button that reinstates the error it just cleared.
      if (cancelled) {
        return;
      }
      setResource(
        result.ok
          ? { status: 'ready', data: result.value }
          : { status: 'failed', error: classifyFailure(result.error) },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [requestKey, attempt]);

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  return { resource, reload };
}
