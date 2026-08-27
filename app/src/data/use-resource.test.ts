import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure } from './failure';
import { useResource } from './use-resource';
import type { ApiFailure } from './failure';

type Load = () => Promise<Result<string, ApiFailure>>;

describe('a single read', () => {
  it('starts loading and then holds the value', async () => {
    const { result } = renderHook(() =>
      useResource<string>(() => Promise.resolve(ok('drama')), 'drm_1'),
    );

    expect(result.current.resource.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.resource).toEqual({ status: 'ready', data: 'drama' });
    });
  });

  it('classifies a failure rather than exposing the raw one', async () => {
    const { result } = renderHook(() =>
      useResource<string>(
        () => Promise.resolve(err(apiFailure({ kind: 'HTTP', status: 404, message: 'missing' }))),
        'drm_1',
      ),
    );

    await waitFor(() => {
      expect(result.current.resource.status).toBe('failed');
    });
    expect(result.current.resource).toMatchObject({
      status: 'failed',
      error: { kind: 'TERMINAL', reason: 'NOT_FOUND' },
    });
  });

  it('returns to loading and then to the value on reload', async () => {
    let attempt = 0;
    const load: Load = () => {
      attempt += 1;
      return attempt === 1
        ? Promise.resolve(err(apiFailure({ kind: 'OFFLINE', message: 'no network' })))
        : Promise.resolve(ok('drama'));
    };
    const { result } = renderHook(() => useResource(load, 'drm_1'));

    await waitFor(() => {
      expect(result.current.resource.status).toBe('failed');
    });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.resource).toEqual({ status: 'ready', data: 'drama' });
    });
  });

  it('refetches when the key changes, which is how navigating to another drama reloads', async () => {
    const load = vi.fn<(key: string) => Promise<Result<string, ApiFailure>>>((key) =>
      Promise.resolve(ok(key)),
    );
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useResource(() => load(key), key),
      { initialProps: { key: 'drm_1' } },
    );

    await waitFor(() => {
      expect(result.current.resource).toEqual({ status: 'ready', data: 'drm_1' });
    });
    rerender({ key: 'drm_2' });
    await waitFor(() => {
      expect(result.current.resource).toEqual({ status: 'ready', data: 'drm_2' });
    });
  });

  /**
   * The reason the read is keyed rather than identified by its closure. An inline arrow is a new
   * function on every render, so keying on it would make every completed read schedule another one
   * — a render loop that surfaces as an out-of-memory crash a long way from its cause.
   */
  it('does not refetch when only the loader identity changes', async () => {
    const load = vi.fn<Load>(() => Promise.resolve(ok('drama')));
    const { result, rerender } = renderHook(() => useResource(() => load(), 'drm_1'));

    await waitFor(() => {
      expect(result.current.resource.status).toBe('ready');
    });
    const callsAfterLoad = load.mock.calls.length;

    rerender();
    rerender();
    rerender();

    expect(load.mock.calls.length).toBe(callsAfterLoad);
  });

  /**
   * A slow first request that lands after a fast retry would overwrite the retry's result, which
   * reads to the user as a retry button that reinstates the error it had just cleared.
   */
  it('ignores a result that arrives after the read was superseded', async () => {
    let release: ((result: Result<string, ApiFailure>) => void) | null = null;
    let attempt = 0;
    const load: Load = () => {
      attempt += 1;
      if (attempt === 1) {
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return Promise.resolve(ok('fresh'));
    };
    const { result } = renderHook(() => useResource(load, 'drm_1'));

    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.resource).toEqual({ status: 'ready', data: 'fresh' });
    });

    await act(async () => {
      release?.(ok('stale'));
      await Promise.resolve();
    });

    expect(result.current.resource).toEqual({ status: 'ready', data: 'fresh' });
  });

  it('uses the newest loader for the next request, not the one captured first', async () => {
    const first = vi.fn<Load>(() => Promise.resolve(ok('one')));
    const second = vi.fn<Load>(() => Promise.resolve(ok('two')));

    const { result, rerender } = renderHook(
      ({ loader }: { loader: Load }) => useResource(loader, 'drm_1'),
      { initialProps: { loader: first } },
    );

    await waitFor(() => {
      expect(result.current.resource).toEqual({ status: 'ready', data: 'one' });
    });
    rerender({ loader: second });
    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.resource).toEqual({ status: 'ready', data: 'two' });
    });
  });
});
