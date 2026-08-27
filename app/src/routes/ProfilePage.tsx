import { Link } from 'react-router';

import { ROUTES } from './routes';
import { SignInPrompt } from '../auth/SignInPrompt';
import { WalletBalance } from '../wallet/WalletBalance';
import { isSignedIn } from '../auth/session';
import { presentSessionReadFailure } from '../data/session-read';
import { RetryableError, Skeleton, TerminalError } from '../components/states';
import { translate } from '../core/i18n';
import { useResource } from '../data/use-resource';
import { useMeApi } from '../data/me-api-context';
import { useSession } from '../auth/session-context';
import { useWalletApi } from '../data/wallet-api-context';

/**
 * SCR-06, "me" — the shell, plus the assets cards that can be built honestly today.
 *
 * Who the app thinks the viewer is, the entries that lead to the personal screens, a wallet
 * card that quotes a coin balance only when the server sent one, and a VIP card that quotes no
 * status. `GET /v1/users/me` returns session identity (`id`, and nickname/avatar only when the
 * platform named them). It does not carry VIP, expiry or Beans — SCR-11 has no contract, and
 * the Beans rate is `C3-09` — so the VIP region stays a statement rather than a `#/vip` that
 * invented a product. Settings (SCR-12) is reachable from here.
 *
 * The wallet card is fail-closed. `GET /v1/wallet` quotes a figure only when the server sent
 * one; a missing figure is a statement rather than `0 coins`. A viewer who has recharged and
 * sees an invented zero will not believe the next number either (`docs/02-user-journeys.md`
 * J10-B, `docs/plan/cycle-3-backlog.md` C3-04).
 *
 * The sections load independently by construction: the identity block, the wallet card, the VIP
 * card and the entries share no request, so a failure in one cannot blank the others
 * (`docs/02-screen-inventory.md` SCR-06, sectioned loading). The VIP card has no request at
 * all — `MeView` has no `vip` field to read.
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
        Showing a real nickname and avatar needs TikTok's optional `authorize`, and a viewer who
        declines must be blocked from nothing at all (IA §9, J10-A). The placeholder identity is
        therefore the default, and `GET /v1/users/me` only overlays fields the server actually
        sent: `id` always, `nickname` only when present. Echoing the id as a display name would
        be inventing a nickname.
      */}
      {signedIn ? <SignedInIdentity /> : <GuestIdentity />}

      {/*
        The assets area. When there is no session this is the login guidance card, whose tap is a
        silent-login retry rather than a navigation — there is no login screen in this product
        (IA §9). When there is one, the wallet card asks the server and quotes nothing it cannot
        read: a missing endpoint is not a zero balance.
      */}
      {signedIn ? (
        <>
          <ProfileWalletCard />
          <ProfileVipCard />
        </>
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
        <Link className="profile-entry" data-testid="settings-entry" to={ROUTES.settings}>
          {translate('profile.settings')}
        </Link>
      </nav>
    </main>
  );
}

function GuestIdentity(): React.JSX.Element {
  return (
    <section className="profile-identity" data-testid="profile-identity" data-me="guest">
      <div className="profile-identity__avatar" aria-hidden="true" />
      <div>
        <p className="profile-identity__name" data-testid="profile-identity-name">
          {translate('profile.guestName')}
        </p>
        <p className="profile-identity__hint">{translate('profile.guestHint')}</p>
      </div>
    </section>
  );
}

/**
 * Independent of the wallet card and of the VIP card. A failed me read leaves the rest of the
 * profile exactly where it is, and keeps the session placeholder rather than inventing a
 * nickname from the local `openId`.
 */
function SignedInIdentity(): React.JSX.Element {
  const api = useMeApi();
  const me = useResource(() => api.fetchMe(), 'profile-me');

  const ready = me.resource.status === 'ready' ? me.resource.data : undefined;
  const name = ready?.nickname ?? translate('profile.viewerName');
  const status = me.resource.status;

  return (
    <section
      className="profile-identity"
      data-testid="profile-identity"
      data-me={status}
      data-user-id={ready?.id}
    >
      <div className="profile-identity__avatar" aria-hidden="true" />
      <div>
        <p className="profile-identity__name" data-testid="profile-identity-name">
          {name}
        </p>
        <p className="profile-identity__hint">{translate('profile.signedIn')}</p>
      </div>
    </section>
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

/**
 * The VIP status card `docs/02-screen-inventory.md` SCR-06 names. `GET /v1/users/me` exists and
 * returns session identity; it still has no `vip` field and there is no subscription contract,
 * so this is a statement, not a status: inventing "not subscribed" is the same lie as inventing
 * `0 coins`, and a `#/vip` would be SCR-11 invented in the client (`C4-07` / `C3-04`). The
 * subscribe control is present and disabled for the same reason the wallet's recharge control
 * is: the entry the inventory asked for, naming the missing contract rather than hiding it.
 *
 * Beans never appear. The rate does not exist (`C3-09`). This card does not read `MeApi`.
 */
function ProfileVipCard(): React.JSX.Element {
  return (
    <section className="profile-vip" data-testid="profile-vip" data-status="unavailable">
      <h2 className="profile-vip__heading">{translate('profile.vip')}</h2>
      <p className="profile-vip__status">{translate('profile.vipUnavailable')}</p>
      <button
        className="profile-vip__action"
        type="button"
        disabled
        data-testid="profile-vip-subscribe"
      >
        {translate('profile.vipSubscribe')}
      </button>
      <p className="profile-vip__hint">{translate('unlock.vipPending')}</p>
    </section>
  );
}
