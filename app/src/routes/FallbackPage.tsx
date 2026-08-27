import { Link } from 'react-router';

import { ROUTES } from './routes';
import { translate } from '../core/i18n';

/**
 * The terminal error surface. It always offers a way home — a dead end inside a WebView leaves
 * the user with no option but to kill the mini app (`docs/architecture/system-overview.md` §4.4).
 */
export function FallbackPage(): React.JSX.Element {
  return (
    <main data-testid="fallback-page">
      <h1>{translate('fallback.heading')}</h1>
      <Link to={ROUTES.home}>{translate('fallback.backHome')}</Link>
    </main>
  );
}
