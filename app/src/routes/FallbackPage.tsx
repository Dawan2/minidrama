import { Link, useSearchParams } from 'react-router';

import { ROUTES, isFallbackReason } from './routes';
import { translate } from '../core/i18n';
import type { FallbackReason } from './routes';
import type { TranslationKey } from '../core/i18n';

/**
 * The terminal error surface. It always offers a way home — a dead end inside a WebView leaves
 * the user with no option but to kill the mini app (`docs/architecture/system-overview.md` §4.4).
 *
 * Three variants, keyed on `?reason=` (`docs/02-screen-inventory.md` SCR-13). The variants exist
 * because "this link is wrong", "this content was withdrawn" and "we are down" ask the user for
 * three different things, and a single generic apology asks them for nothing. An unrecognised or
 * absent reason reads as `NOT_FOUND`, which is also where an unmatched route lands (IA §5).
 */
const MESSAGE_KEYS: Readonly<Record<FallbackReason, TranslationKey>> = {
  NOT_FOUND: 'fallback.notFound',
  OFFLINE: 'fallback.offline',
  MAINTENANCE: 'fallback.maintenance',
};

export function FallbackPage(): React.JSX.Element {
  const [params] = useSearchParams();
  const raw = params.get('reason') ?? '';
  const reason: FallbackReason = isFallbackReason(raw) ? raw : 'NOT_FOUND';

  return (
    <main className="page page--fallback" data-testid="fallback-page" data-reason={reason}>
      <h1>{translate('fallback.heading')}</h1>
      <p>{translate(MESSAGE_KEYS[reason])}</p>
      <Link className="state__action" to={ROUTES.home}>
        {translate('fallback.backHome')}
      </Link>
    </main>
  );
}
