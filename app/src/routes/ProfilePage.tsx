import { Link } from 'react-router';

import { ROUTES } from './routes';
import { SignInPrompt } from '../auth/SignInPrompt';
import { isSignedIn } from '../auth/session';
import { translate } from '../core/i18n';
import { useSession } from '../auth/session-context';

/**
 * SCR-06, "me" — the shell, not the screen.
 *
 * What is here is the part that can be built honestly today: who the app thinks the viewer is, and
 * the entries that lead to the personal screens. What is deliberately *not* here is the assets area
 * — the balance card, the VIP card, the transaction list. `GET /users/me` and `GET /wallet` do not
 * exist on the server, so every one of those cards would be a number invented on the client, and
 * the IA is explicit that the anonymous assets area shows a login card and **not fake data**
 * (`docs/02-user-journeys.md` J10-B). A "0 coins" placeholder is not a placeholder; it is a wrong
 * balance, and a viewer who has recharged and sees it will not believe the next number either.
 *
 * The sections load independently by construction: nothing here shares a request, so a failure in
 * one entry cannot blank the others (`docs/02-screen-inventory.md` SCR-06, sectioned loading).
 */
export function ProfilePage(): React.JSX.Element {
  const session = useSession();
  const signedIn = isSignedIn(session.state);

  return (
    <main
      className="page page--profile"
      data-testid="profile-page"
      data-session={session.state.status}
    >
      <h1 className="page__heading">{translate('profile.heading')}</h1>

      {/*
        The default identity, which is the *normal* case rather than a degraded one: showing a real
        nickname and avatar needs TikTok's optional `authorize`, and a viewer who declines must be
        blocked from nothing at all (IA §9, J10-A). So the placeholder identity is permanent
        furniture and the "complete your profile" entry that would re-request authorization belongs
        with the bridge call that does it.
      */}
      <section className="profile-identity" data-testid="profile-identity">
        <div className="profile-identity__avatar" aria-hidden="true" />
        <div>
          <p className="profile-identity__name">
            {translate(signedIn ? 'profile.viewerName' : 'profile.guestName')}
          </p>
          <p className="profile-identity__hint">
            {translate(signedIn ? 'profile.signedIn' : 'profile.guestHint')}
          </p>
        </div>
      </section>

      {/*
        The assets area, in the only form it can honestly take. When there is no session this is the
        login guidance card, whose tap is a silent-login retry rather than a navigation — there is no
        login screen in this product (IA §9). When there is one, it is empty rather than fabricated:
        the wallet endpoints are the entitlement slot's.
      */}
      {signedIn ? null : (
        <SignInPrompt messageKey="profile.signInPrompt" testId="profile-sign-in" />
      )}

      <nav className="profile-entries" data-testid="profile-entries">
        <Link className="profile-entry" data-testid="history-entry" to={ROUTES.history}>
          {translate('profile.history')}
        </Link>

        {/*
          Favourites (SCR-08) has no screen and no endpoint: `GET /users/me/favorites` is not on the
          server and `DramaDetail.viewer` is null, so the list would be empty for everyone. The entry
          is present and visibly unavailable rather than hidden or linked. Hidden, and nobody can
          tell whether favouriting does anything; linked, and it lands on "this page does not exist",
          which reads as a broken app rather than an unfinished one.
        */}
        <button
          className="profile-entry profile-entry--pending"
          data-testid="favorites-entry"
          type="button"
          disabled
        >
          <span>{translate('profile.favorites')}</span>
          <span className="profile-entry__hint">{translate('profile.notYetAvailable')}</span>
        </button>
      </nav>
    </main>
  );
}
