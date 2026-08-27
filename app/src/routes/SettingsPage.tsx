import { translate } from '../core/i18n';

import { APP_VERSION, SUPPORT_EMAIL, supportMailto } from './settings';

/**
 * SCR-12, settings · about.
 *
 * There is no data dependency: ToS and privacy URLs are still unpublished (checklist C4/C5),
 * so this screen does not invent them. The support address is the `.invalid` placeholder C11
 * uses until a 2FA mailbox exists. The version is the package version. The access token is
 * memory-only (`session-store.ts`), so there is no on-device cache to wipe and no logout.
 *
 * "Complete profile" stays off this screen for the same reason it stays off SCR-06: it needs
 * `authorize`, which is optional and not wired.
 */
export function SettingsPage(): React.JSX.Element {
  return (
    <main className="page page--settings" data-testid="settings-page">
      <h1 className="page__heading">{translate('settings.heading')}</h1>

      <section className="settings-block" data-testid="settings-version" data-version={APP_VERSION}>
        <h2 className="page__subheading">{translate('settings.version')}</h2>
        <p className="settings-value">{APP_VERSION}</p>
      </section>

      <section className="settings-block" data-testid="settings-legal">
        <h2 className="page__subheading">{translate('settings.legal')}</h2>
        <p data-testid="settings-terms">{translate('settings.termsUnpublished')}</p>
        <p data-testid="settings-privacy">{translate('settings.privacyUnpublished')}</p>
      </section>

      <section className="settings-block" data-testid="settings-support">
        <h2 className="page__subheading">{translate('settings.support')}</h2>
        <p>{translate('settings.supportHint')}</p>
        <a className="profile-entry" data-testid="settings-support-mail" href={supportMailto()}>
          {SUPPORT_EMAIL}
        </a>
      </section>

      <section className="settings-block" data-testid="settings-cache">
        <h2 className="page__subheading">{translate('settings.localData')}</h2>
        <p>{translate('settings.localDataHint')}</p>
      </section>
    </main>
  );
}
