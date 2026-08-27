import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FallbackPage } from './FallbackPage';
import { ROUTES } from './routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FallbackPage />
    </MemoryRouter>,
  );
}

/**
 * SCR-13. Three variants, because "this link is wrong", "this content was withdrawn" and "we are
 * down" ask the user for three different things and a single generic apology asks them for nothing.
 */
describe('the fallback screen', () => {
  it('renders a distinct message per reason', () => {
    const messages = new Set<string>();

    for (const reason of ['NOT_FOUND', 'OFFLINE', 'MAINTENANCE'] as const) {
      const { unmount } = renderAt(`/fallback?reason=${reason}`);
      const page = screen.getByTestId('fallback-page');
      expect(page.getAttribute('data-reason')).toBe(reason);
      messages.add(page.textContent ?? '');
      unmount();
    }

    expect(messages.size).toBe(3);
  });

  it('reads an absent or unknown reason as a missing page', () => {
    for (const path of ['/fallback', '/fallback?reason=', '/fallback?reason=BANANA']) {
      const { unmount } = renderAt(path);
      expect(screen.getByTestId('fallback-page').getAttribute('data-reason')).toBe('NOT_FOUND');
      unmount();
    }
  });

  // A dead end inside a single WebView leaves the user with nothing to do but kill the mini app.
  it('always offers a way home', () => {
    renderAt('/fallback?reason=MAINTENANCE');
    expect(screen.getByRole('link').getAttribute('href')).toBe(ROUTES.home);
  });
});
