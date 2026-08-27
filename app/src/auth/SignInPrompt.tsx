import { useState } from 'react';

import { translate } from '../core/i18n';
import { useSession } from './session-context';
import type { TranslationKey } from '../core/i18n';

/**
 * "You need to be signed in", with the recovery attached.
 *
 * This product has no login screen and never will: identity is silent login, and the affordance the
 * IA specifies is an in-place retry at the point of use (`docs/02-information-architecture.md` §9,
 * `docs/02-user-journeys.md` J10-B). So this is a sentence and a button, rendered where the content
 * would have been, and it never navigates anywhere.
 *
 * It is deliberately not one of the four shared states in `components/states.tsx`. A viewer who is
 * not signed in is not looking at an empty screen and not looking at an error: nothing failed, and
 * their data is not gone. Reusing `EmptyState` here would make the two indistinguishable in the DOM
 * and, in time, indistinguishable in the code — which is exactly the confusion this slot exists to
 * prevent.
 *
 * Silent login cannot succeed yet — the server refuses every auth code until the identity slot
 * lands — so the honest outcome today is the "we could not sign you in" hint. That is a real state
 * with a real cause, not a placeholder: the same hint is what a viewer sees when the platform's
 * `login()` fails on a device, and it is the branch J10-B specifies for a failed retry.
 */
export interface SignInPromptProps {
  readonly messageKey: TranslationKey;
  /** Called after a successful sign-in, so the surface can retry the read it could not make. */
  readonly onSignedIn?: () => void;
  readonly testId?: string;
}

type PromptState = 'IDLE' | 'SIGNING_IN' | 'UNAVAILABLE';

export function SignInPrompt({
  messageKey,
  onSignedIn,
  testId,
}: SignInPromptProps): React.JSX.Element {
  const session = useSession();
  const [state, setState] = useState<PromptState>('IDLE');

  const signIn = async (): Promise<void> => {
    // Guarded rather than merely disabled: a second exchange of a single-use auth code is a
    // request that cannot succeed, and it would be sent while the first is still in flight.
    if (state === 'SIGNING_IN') {
      return;
    }
    setState('SIGNING_IN');
    const signedIn = await session.signIn();
    if (signedIn) {
      setState('IDLE');
      onSignedIn?.();
      return;
    }
    setState('UNAVAILABLE');
  };

  return (
    <div
      className="state state--sign-in"
      data-testid={testId ?? 'sign-in-prompt'}
      data-prompt-state={state}
    >
      <p className="state__message">{translate(messageKey)}</p>
      {state === 'UNAVAILABLE' ? (
        <p className="state__hint" data-testid="sign-in-unavailable">
          {translate('auth.signInUnavailable')}
        </p>
      ) : null}
      <button
        className="state__action"
        type="button"
        data-testid="sign-in"
        disabled={state === 'SIGNING_IN'}
        onClick={() => {
          void signIn();
        }}
      >
        {translate(state === 'SIGNING_IN' ? 'auth.signingIn' : 'auth.signIn')}
      </button>
    </div>
  );
}
