import { Link } from 'react-router';

import { ROUTES } from '../routes/routes';
import { translate } from '../core/i18n';
import type { SurfaceError, TerminalReason } from '../data/failure';
import type { TranslationKey } from '../core/i18n';

/**
 * The four non-content states, as components (`docs/02-screen-inventory.md` CMP-03 to CMP-05).
 *
 * They are shared rather than per-screen so that the states cannot drift into four different
 * shapes with four different recovery affordances — which is what makes an app feel broken even
 * when every individual screen is correct.
 *
 * Every one of them is reachable by the user and every one of them offers a way forward. A state
 * with no exit inside a single WebView leaves the user with nothing to do but kill the mini app
 * (`docs/architecture/system-overview.md` §4.4).
 */

export interface SkeletonProps {
  readonly rows: number;
  readonly label?: string;
}

/**
 * Present in the DOM immediately, revealed only after 300ms by a CSS animation delay.
 *
 * The IA asks for the delay so a fast response does not flash a skeleton (§8.1). Doing it with a
 * timer would mean the loading state is unobservable to a test for its first 300ms; doing it in CSS
 * keeps the state assertable the moment it exists and still shows the user nothing.
 */
export function Skeleton({ rows, label }: SkeletonProps): React.JSX.Element {
  return (
    <div
      className="skeleton"
      data-testid="skeleton"
      role="status"
      aria-busy="true"
      aria-label={label ?? translate('state.loading')}
    >
      {Array.from({ length: rows }, (_unused, index) => (
        <div className="skeleton__row" key={index} />
      ))}
    </div>
  );
}

/**
 * The action out of an empty state, which the IA makes mandatory rather than optional: an empty
 * screen with nothing to press is indistinguishable from a broken one (§8.1). Sometimes the way
 * out is another screen and sometimes it is trying again — a list that is empty because the
 * catalogue is empty has nowhere to send anyone.
 */
export type EmptyStateAction =
  | { readonly kind: 'link'; readonly to: string; readonly labelKey: TranslationKey }
  | { readonly kind: 'button'; readonly onAction: () => void; readonly labelKey: TranslationKey };

export interface EmptyStateProps {
  readonly messageKey: TranslationKey;
  readonly action?: EmptyStateAction;
}

export function EmptyState({ messageKey, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="state state--empty" data-testid="empty-state">
      <p className="state__message">{translate(messageKey)}</p>
      {action === undefined ? null : action.kind === 'link' ? (
        <Link className="state__action" to={action.to}>
          {translate(action.labelKey)}
        </Link>
      ) : (
        <button className="state__action" type="button" onClick={action.onAction}>
          {translate(action.labelKey)}
        </button>
      )}
    </div>
  );
}

export interface RetryableErrorProps {
  readonly error: SurfaceError;
  readonly onRetry: () => void;
}

/**
 * The recoverable error. In-page, never a dialog: a modal over a list the user can still partly
 * see is an interruption pretending to be information (IA §8.1).
 *
 * The trace id rides along in an attribute rather than on screen. It is the only thing that turns
 * "it did not work" into a searchable server trace, and it is meaningless to the user
 * (`docs/12-api-contracts.md` §2.5).
 */
export function RetryableError({ error, onRetry }: RetryableErrorProps): React.JSX.Element {
  const retryAfterSec = error.kind === 'RETRYABLE' ? error.retryAfterSec : null;

  return (
    <div
      className="state state--error"
      data-testid="retryable-error"
      data-failure-kind={error.failure.kind}
      data-trace-id={error.failure.traceId ?? ''}
      role="alert"
    >
      <p className="state__message">{translate('state.retryableTitle')}</p>
      {retryAfterSec === null ? null : (
        <p className="state__hint" data-testid="retry-after">
          {translate('state.retryAfter', undefined, { n: retryAfterSec })}
        </p>
      )}
      <button className="state__action" type="button" onClick={onRetry}>
        {translate('state.retry')}
      </button>
    </div>
  );
}

const TERMINAL_MESSAGE_KEYS: Readonly<Record<TerminalReason, TranslationKey>> = {
  NOT_FOUND: 'drama.notFound',
  OFFLINE: 'drama.offline',
  REJECTED: 'drama.rejected',
};

export interface TerminalErrorProps {
  readonly reason: TerminalReason;
  readonly traceId?: string | null;
  /**
   * Copy for a surface whose missing thing is not a drama. The default map is worded for the
   * catalogue ("we could not find this drama"), which is wrong on a screen about the viewer's own
   * list, and wrong copy in a terminal state is the whole failure: the state's only job is to
   * explain itself, since it offers nothing to press.
   */
  readonly messageKey?: TranslationKey;
}

/**
 * The dead end, made survivable. Deliberately has no retry button: the content is gone, or the
 * request was refused, and a button that cannot succeed is worse than no button — the user presses
 * it until they give up on the app rather than on the page.
 */
export function TerminalError({
  reason,
  traceId,
  messageKey,
}: TerminalErrorProps): React.JSX.Element {
  return (
    <div
      className="state state--terminal"
      data-testid="terminal-error"
      data-reason={reason}
      data-trace-id={traceId ?? ''}
      role="alert"
    >
      <p className="state__message">{translate(messageKey ?? TERMINAL_MESSAGE_KEYS[reason])}</p>
      <Link className="state__action" to={ROUTES.home}>
        {translate('fallback.backHome')}
      </Link>
    </div>
  );
}
