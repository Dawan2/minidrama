import {
  CONFIG_FEATURE_KEYS,
  CONFIG_PLAYBACK_KEYS,
  CONFIG_VIEW_KEYS,
  DEFAULT_PROGRESS_HEARTBEAT_SEC,
  type ConfigView,
} from '@minidrama/shared';

/**
 * Project facts onto the wire shape the client `narrowConfigView` reads.
 *
 * Two properties this function exists to hold, because both are easy to violate with a
 * placeholder:
 *
 * 1. **No invented flags.** `comments` and `adUnlock` leave as booleans. A stuffed `true` is
 *    copied only when the caller named it — today's route names `false`, because PNL-04 and
 *    C4-08 are not on `main`.
 * 2. **No legal URLs, ad-unit ids, coin name or Beans.** Only the two `ConfigView` keys can
 *    leave. A `termsUrl` stuffed onto the facts is dropped (`C4-04`, `C3-09`).
 */

export function toConfigView(facts: ConfigView): ConfigView {
  const heartbeat = facts.playback.progressHeartbeatSec;
  const progressHeartbeatSec =
    Number.isInteger(heartbeat) && heartbeat >= 1 ? heartbeat : DEFAULT_PROGRESS_HEARTBEAT_SEC;

  return {
    features: {
      comments: facts.features.comments === true,
      adUnlock: facts.features.adUnlock === true,
    },
    playback: { progressHeartbeatSec },
  };
}

/**
 * The keys a config body is allowed to carry. Used by the route tests so a legal URL or Beans
 * field cannot be added to the mapper and left untested: the assertion is on the enumerated set.
 */
export function configViewKeys(view: ConfigView): readonly string[] {
  return Object.keys(view);
}

export { CONFIG_FEATURE_KEYS, CONFIG_PLAYBACK_KEYS, CONFIG_VIEW_KEYS };
