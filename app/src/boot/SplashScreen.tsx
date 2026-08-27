import { translate } from '../core/i18n';

/**
 * SCR-01, the boot overlay. Not a hash route: the sequence finishes or fails before any
 * business screen renders (`docs/02-screen-inventory.md` SCR-01, AC-BOOT-1).
 *
 * It does not mention comments, ads, legal URLs or a Beans rate. Hard-coding "comments on"
 * here is exactly the splash C4-04 refuses.
 */
export function SplashScreen(): React.JSX.Element {
  return (
    <main className="page page--splash" data-testid="splash-screen">
      <p className="splash-brand">{translate('app.title')}</p>
      <p className="splash-status">{translate('boot.loading')}</p>
    </main>
  );
}
