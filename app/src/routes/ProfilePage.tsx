import { Link } from 'react-router';

import { ROUTES } from './routes';
import { SignInPrompt } from '../auth/SignInPrompt';
import { WalletBalance } from '../wallet/WalletBalance';
import { isSignedIn } from '../auth/session';
import { presentSessionReadFailure } from '../data/session-read';
import { RetryableError, Skeleton, TerminalError } from '../components/states';
import { translate } from '../core/i18n';
import { useResource } from '../data/use-resource';
import { useSession } from '../auth/session-context';
import { useWalletApi } from '../data/wallet-api-context';

/**
 * SCR-06, "me" — the shell, plus the one assets card that can be built honestly today.
 *
 * Who the app thinks the viewer is, the entries that lead to the personal screens, and a wallet
 * card that quotes a coin balance only when the server sent one. What is still not here is a VIP
 * card, a real nickname, or a recharge sheet: `GET /users/me` does not exist, SCR-11 has no
 * contract, and the Beans rate is `C3-09`.
 *
 * The wallet card is fail-closed. `GET /v1/wallet` is not served today, and a missing figure is a
 * statement rather than `0 coins`. A viewer who has recharged and sees an invented zero will not
 * believe the next number either (`docs/02-user-journeys.md` J10-B,
 * `docs/plan/cycle-3-backlog.md` C3-04).
 *
 * The sections load independently by construction: the identity block, the wallet card and the
 * entries share no request, so a failure in one cannot blank the others
 * (`docs/02-screen-inventory.md` SCR-06, sectioned loading).
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
        The assets area. When there is no session this is the login guidance card, whose tap is a
        silent-login retry rather than a navigation — there is no login screen in this product
        (IA §9). When there is one, the wallet card asks the server and quotes nothing it cannot
        read: a missing endpoint is not a zero balance.
      */}
      {signedIn ? (
        <ProfileWalletCard />
      ) : (
        <SignInPrompt messageKey="profile.signInPrompt" testId="profile-sign-in" />
      )}

      <nav className="profile-entries" data-testid="profile-entries">
        <Link className="profile-entry" data-testid="history-entry" to={ROUTES.history}>
          {translate('profile.history')}
        </Link>
        <Link className="profile-entry" data-testid="favorites-entry" to={ROUTES.favorites}>
          {translate('profile.favorites')}
        </Link>
        <Link className="profile-entry" data-testid="wallet-entry" to={ROUTES.wallet}>
          {translate('profile.wallet')}
        </Link>
      </nav>
    </main>
  );
}

/**
 * Independent of the identity block and of the entries. A failed wallet read leaves the rest of
 * the profile exactly where it is; a missing figure is the unavailable card, not a retry that
 * cannot produce a number the server does not have.
 */
function ProfileWalletCard(): React.JSX.Element {
  const api = useWalletApi();
  const wallet = useResource(() => api.fetchWallet(), 'profile-wallet');

  if (wallet.resource.status === 'loading') {
    return <Skeleton rows={1} />;
  }

  if (wallet.resource.status === 'failed') {
    const presented = presentSessionReadFailure(wallet.resource.error.failure);
    if (presented.kind === 'AUTH_REQUIRED') {
      return (
        <SignInPrompt
          messageKey="wallet.signInRequired"
          onSignedIn={wallet.reload}
          testId="profile-wallet-sign-in"
        />
      );
    }
    if (presented.kind === 'UNAVAILABLE') {
      return <WalletBalance balance={{ kind: 'UNAVAILABLE' }} />;
    }
    return presented.error.kind === 'RETRYABLE' ? (
      <RetryableError error={presented.error} onRetry={wallet.reload} />
    ) : (
      <TerminalError
        reason={presented.error.reason}
        messageKey="wallet.unavailable"
        traceId={presented.error.failure.traceId}
      />
    );
  }

  return (
    <WalletBalance
      balance={wallet.resource.data}
      pendingCredit={wallet.resource.data.kind === 'KNOWN' && wallet.resource.data.pendingCredit}
    />
  );
}
