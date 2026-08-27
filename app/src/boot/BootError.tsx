import { translate } from '../core/i18n';

/**
 * SCR-01's terminal retry. Bridge `init` failed, so nothing downstream is usable. A way to
 * try again — killing the mini app is the only other exit (`docs/02-screen-inventory.md`).
 */
export interface BootErrorProps {
  readonly onRetry: () => void;
}

export function BootError({ onRetry }: BootErrorProps): React.JSX.Element {
  return (
    <main className="page page--boot-error" data-testid="boot-error">
      <h1 className="page__heading">{translate('boot.initFailed')}</h1>
      <p>{translate('boot.initFailedHint')}</p>
      <button className="state__action" type="button" onClick={onRetry}>
        {translate('state.retry')}
      </button>
    </main>
  );
}
