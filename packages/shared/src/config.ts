/**
 * The boot configuration read: "which product flags are on, and how often should progress beat".
 *
 * `GET /v1/config` answers this shape. It is anonymous-capable — browsing and a failed silent
 * login still need a config — and it is fail-closed. Comments (PNL-04) stay off: a
 * `comments: true` would render an entry whose endpoints do not exist. Ad-unlock endpoints
 * exist (C4-08) but GATE-4 has not named a unit id, so `adUnlock` stays false. Legal URLs,
 * ad-unit ids, Beans and a coin→Beans rate are not part of this type: those are unpublished,
 * GATE-4, or Q-G-7 (`C4-04`, `C4-06`, `C3-09`).
 *
 * `progressHeartbeatSec` is the one number this product already owns (10 seconds; the progress
 * write's documented interval). A missing or unreadable value is that default, never 0.
 */

export const DEFAULT_PROGRESS_HEARTBEAT_SEC = 10;

/**
 * What a client uses when `GET /v1/config` fails, times out, or returns a body that is not
 * this shape. Paid features off, comments off, heartbeat 10 s (`docs/product/acceptance-criteria.md`
 * AC-BOOT-4). Not `comments: true`. Not a legal URL. Not an ad-unit id.
 */
export const CONSERVATIVE_CLIENT_CONFIG: ConfigView = {
  features: { comments: false, adUnlock: false },
  playback: { progressHeartbeatSec: DEFAULT_PROGRESS_HEARTBEAT_SEC },
};

export interface ConfigView {
  readonly features: {
    /** PNL-04 is not on `main`. Live and the conservative fallback are both `false`. */
    readonly comments: boolean;
    /** C4-08 endpoints exist. GATE-4 has not named a unit id. Live and fallback are `false`. */
    readonly adUnlock: boolean;
  };
  readonly playback: {
    /** Seconds between progress heartbeats. A positive integer. Default 10. */
    readonly progressHeartbeatSec: number;
  };
}

/**
 * Compile-time: adding Beans, legal URLs, ad-unit ids or a coin name to `ConfigView` is a type
 * error here, not a review comment. C4-04 forbids inventing those in the splash; putting them
 * on the wire would quote a rate, a URL, or a unit id this product does not have.
 */
type ForbiddenConfigKey =
  | 'beansAmount'
  | 'beansPerCoin'
  | 'coinToBeans'
  | 'BEANS_RATE'
  | 'beansRate'
  | 'termsUrl'
  | 'privacyUrl'
  | 'legalUrls'
  | 'tosUrl'
  | 'adUnitId'
  | 'rewardedAdUnitId'
  | 'interstitialAdUnitId'
  | 'coinName'
  | 'wallet';

type CarriesNoInventedConfig<T> = Extract<keyof T, ForbiddenConfigKey> extends never ? true : false;

const _configViewCarriesNoInventedFields: CarriesNoInventedConfig<ConfigView> = true;

export const CONFIG_VIEW_KEYS = ['features', 'playback'] as const;
export const CONFIG_FEATURE_KEYS = ['comments', 'adUnlock'] as const;
export const CONFIG_PLAYBACK_KEYS = ['progressHeartbeatSec'] as const;
