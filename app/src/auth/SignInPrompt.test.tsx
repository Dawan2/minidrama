import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { SignInPrompt } from './SignInPrompt';
import { renderSurface } from '../testing/render';
import { stubSession } from '../testing/history-fixtures';

/**
 * The prompt is the whole of this product's login UI: a sentence and an in-place retry. There is no
 * login screen and no navigation away (`docs/02-information-architecture.md` §9).
 */
describe('the sign-in prompt', () => {
  it('explains itself in English and offers exactly one action', () => {
    renderSurface(<SignInPrompt messageKey="history.signInRequired" />);

    const prompt = screen.getByTestId('sign-in-prompt');
    expect(prompt.textContent).toContain('Sign in to pick up where you left off.');
    expect(prompt.textContent).not.toContain('history.signInRequired');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // A login screen would be the wrong answer: silent login needs nothing from the viewer, so the
  // recovery is a button that stays on the page.
  it('never navigates', () => {
    renderSurface(<SignInPrompt messageKey="history.signInRequired" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('runs silent login once per press', async () => {
    const session = stubSession({ signInSucceeds: true });
    renderSurface(<SignInPrompt messageKey="history.signInRequired" />, { session });

    fireEvent.click(screen.getByTestId('sign-in'));

    await waitFor(() => {
      expect(session.signInCalls()).toBe(1);
    });
  });

  it('tells the surface to retry its read once a session exists', async () => {
    const onSignedIn = vi.fn();
    renderSurface(<SignInPrompt messageKey="history.signInRequired" onSignedIn={onSignedIn} />, {
      session: stubSession({ signInSucceeds: true }),
    });

    fireEvent.click(screen.getByTestId('sign-in'));

    await waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('sign-in-unavailable')).toBeNull();
  });

  /**
   * The honest outcome today: the server's identity port refuses every auth code until the real
   * exchange lands. It is not a placeholder state — it is the same branch a device sees when the
   * platform's own `login()` fails, and J10-B specifies a message rather than a blocked screen.
   */
  it('says so when silent login could not produce a session', async () => {
    const onSignedIn = vi.fn();
    renderSurface(<SignInPrompt messageKey="history.signInRequired" onSignedIn={onSignedIn} />, {
      session: stubSession({ signInSucceeds: false }),
    });

    fireEvent.click(screen.getByTestId('sign-in'));

    const hint = await screen.findByTestId('sign-in-unavailable');
    expect(hint.textContent).toContain('We could not sign you in.');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByTestId('sign-in-prompt').getAttribute('data-prompt-state')).toBe(
      'UNAVAILABLE',
    );
  });

  // A single-use auth code exchanged twice is a request that cannot succeed, sent while the first
  // one is still in flight.
  it('does not start a second exchange while one is in flight', async () => {
    let release = (_signedIn: boolean): void => undefined;
    const session = {
      state: { status: 'ANONYMOUS' } as const,
      signIn: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      ),
    };
    renderSurface(<SignInPrompt messageKey="history.signInRequired" />, { session });

    const button = screen.getByTestId('sign-in');
    fireEvent.click(button);
    fireEvent.click(button);

    expect(session.signIn).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('disabled')).not.toBeNull();
    expect(button.textContent).toContain('Signing in…');

    release(false);
    await waitFor(() => {
      expect(screen.getByTestId('sign-in-unavailable')).toBeDefined();
    });
  });
});
