import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { EmptyState, RetryableError, Skeleton, TerminalError } from './states';
import { CoverImage } from './CoverImage';
import { ROUTES } from '../routes/routes';
import { classifyFailure } from '../data/failure';
import { httpFailure, offlineFailure } from '../testing/catalog-fixtures';

function renderRouted(element: React.ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('the loading state', () => {
  // In the DOM immediately, revealed by CSS after 300ms. A timer instead would make the loading
  // state unobservable for its first 300ms, including to a test.
  it('is present and announced as busy from the moment it renders', () => {
    render(<Skeleton rows={3} />);

    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(skeleton.querySelectorAll('.skeleton__row')).toHaveLength(3);
  });
});

describe('the empty state', () => {
  it('can offer a navigation out', () => {
    renderRouted(
      <EmptyState
        messageKey="drama.episodesEmpty"
        action={{ kind: 'link', to: ROUTES.home, labelKey: 'fallback.backHome' }}
      />,
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe(ROUTES.home);
  });

  // Sometimes the only honest action is to try again: an empty catalogue has nowhere to send anyone.
  it('can offer an action instead of a destination', () => {
    const onAction = vi.fn();
    renderRouted(
      <EmptyState
        messageKey="home.empty"
        action={{ kind: 'button', onAction, labelKey: 'state.retry' }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders its message in English, never a raw key', () => {
    renderRouted(<EmptyState messageKey="home.empty" />);
    expect(screen.getByTestId('empty-state').textContent).not.toContain('home.empty');
  });

  // "No results for X" and "there is nothing here" are different sentences, and the difference is
  // whether the viewer suspects their query or suspects the app.
  it('can name what was looked for', () => {
    renderRouted(<EmptyState messageKey="search.noResults" messageParams={{ query: 'zebra' }} />);

    const empty = screen.getByTestId('empty-state');
    expect(empty.textContent).toContain('zebra');
    expect(empty.textContent).not.toContain('{query}');
  });

  // A placeholder left visible is a bug that gets fixed; a blank where a value should be is one
  // that ships.
  it('leaves an unfilled placeholder visible rather than blanking it', () => {
    renderRouted(<EmptyState messageKey="search.noResults" />);
    expect(screen.getByTestId('empty-state').textContent).toContain('{query}');
  });
});

describe('the retryable error state', () => {
  it('retries in place', () => {
    const onRetry = vi.fn();
    renderRouted(<RetryableError error={classifyFailure(offlineFailure())} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('surfaces the failure kind and the trace id for diagnosis without showing them', () => {
    renderRouted(
      <RetryableError error={classifyFailure(httpFailure(500, 'trace_7'))} onRetry={vi.fn()} />,
    );

    const state = screen.getByTestId('retryable-error');
    expect(state.getAttribute('data-failure-kind')).toBe('HTTP');
    expect(state.getAttribute('data-trace-id')).toBe('trace_7');
    expect(state.textContent).not.toContain('trace_7');
  });

  it('shows a wait hint only when the server asked for one', () => {
    renderRouted(
      <RetryableError
        error={classifyFailure({ ...httpFailure(429), retryAfterSec: 12 })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByTestId('retry-after').textContent).toContain('12');

    render(
      <MemoryRouter>
        <RetryableError error={classifyFailure(offlineFailure())} onRetry={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('retryable-error')).toHaveLength(2);
    expect(screen.getAllByTestId('retry-after')).toHaveLength(1);
  });

  it('is announced to assistive technology', () => {
    renderRouted(<RetryableError error={classifyFailure(offlineFailure())} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeDefined();
  });
});

describe('the terminal error state', () => {
  // No retry button. The content is gone; a button that cannot succeed is worse than no button,
  // because the user presses it until they give up on the app rather than on the page.
  it('offers a way home and no retry', () => {
    renderRouted(<TerminalError reason="OFFLINE" />);

    expect(screen.getByRole('link').getAttribute('href')).toBe(ROUTES.home);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a distinct message per reason', () => {
    const messages = new Set<string>();
    for (const reason of ['NOT_FOUND', 'OFFLINE', 'REJECTED'] as const) {
      const { unmount } = renderRouted(<TerminalError reason={reason} />);
      messages.add(screen.getByTestId('terminal-error').textContent ?? '');
      unmount();
    }
    expect(messages.size).toBe(3);
  });

  // The default copy is about a drama, and a terminal state's only job is to explain itself. A
  // screen about the viewer's own list saying "we could not find this drama" explains the wrong
  // thing, and there is nothing to press that would reveal the right one.
  it('takes copy from the surface while keeping the reason for diagnosis', () => {
    renderRouted(<TerminalError reason="REJECTED" messageKey="history.unavailable" />);

    const state = screen.getByTestId('terminal-error');
    expect(state.getAttribute('data-reason')).toBe('REJECTED');
    expect(state.textContent).toContain('We could not load your list.');
    expect(state.textContent).not.toContain('drama');
  });
});

/**
 * Every `coverUrl` in the seed catalogue points at `cdn.example.invalid`, which is not a registered
 * trusted domain, so today every cover fails to load (`docs/handoff/w2-work-d.md` §5). The same
 * thing happens in production the first time an image origin is missed in the Portal.
 */
describe('a cover image', () => {
  it('renders the image with the title as its alt text', () => {
    render(<CoverImage src="https://cdn.example.invalid/a.jpg" alt="The Heiress" />);

    const image = screen.getByTestId('cover-image');
    expect(image.getAttribute('src')).toBe('https://cdn.example.invalid/a.jpg');
    expect(image.getAttribute('alt')).toBe('The Heiress');
    expect(image.getAttribute('loading')).toBe('lazy');
  });

  it('degrades to a labelled placeholder instead of a broken-image icon', () => {
    render(<CoverImage src="https://cdn.example.invalid/a.jpg" alt="The Heiress" />);

    fireEvent.error(screen.getByTestId('cover-image'));

    expect(screen.queryByTestId('cover-image')).toBeNull();
    const placeholder = screen.getByTestId('cover-placeholder');
    expect(placeholder.getAttribute('aria-label')).toBe('The Heiress');
  });

  // Otherwise one broken cover keeps the placeholder for whatever scrolls into its position next.
  it('gives a new source a fresh chance to load', () => {
    const { rerender } = render(<CoverImage src="https://a.invalid/1.jpg" alt="One" />);
    fireEvent.error(screen.getByTestId('cover-image'));
    expect(screen.getByTestId('cover-placeholder')).toBeDefined();

    rerender(<CoverImage src="https://a.invalid/2.jpg" alt="Two" />);
    expect(screen.getByTestId('cover-image')).toBeDefined();
  });
});
