import {
  CONSERVATIVE_CLIENT_CONFIG,
  DEFAULT_PROGRESS_HEARTBEAT_SEC,
  type ConfigView,
  type Result,
} from '@minidrama/shared';

import { asRecord, narrow } from './narrow';
import type { ApiFailure } from './failure';
import type { HttpReader } from './http';

/**
 * The boot configuration read: "which product flags are on, and how often should progress beat".
 *
 * `GET /v1/config` is served and is anonymous. The live body is fail-closed: comments and
 * ad-unlock are `false` because PNL-04 and C4-08 are not on `main`. A missing, malformed or
 * refused body is `CONSERVATIVE_CLIENT_CONFIG` (AC-BOOT-4), never `comments: true`.
 *
 * Legal URLs, ad-unit ids, a coin name and Beans are ignored even if a future body grows them
 * (`C4-04`, `C3-09`). The splash does not read those keys.
 */

export const CONFIG_PATH = '/v1/config';

export interface ConfigApi {
  fetchConfig(): Promise<Result<ConfigView, ApiFailure>>;
}

export function createConfigApi(http: HttpReader): ConfigApi {
  return {
    fetchConfig: async () => {
      const body = await http.getJson(CONFIG_PATH);
      return body.ok ? narrow(body.value, narrowConfigView) : body;
    },
  };
}

/**
 * Read boot flags out of an unknown body, or report that none is there.
 *
 * Returns `null` only when the value is not an object, or `features` / `playback` are missing
 * as objects — that is a truncated or HTML body, and `narrow` maps it to `MALFORMED`. Extra
 * keys, including legal URLs, ad-unit ids and Beans, are dropped rather than forwarded.
 *
 * A missing `comments` is `false`, not `true`. A missing heartbeat is 10, not 0.
 */
export function narrowConfigView(value: unknown): ConfigView | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const features = asRecord(record['features']);
  const playback = asRecord(record['playback']);
  if (features === null || playback === null) {
    return null;
  }

  const heartbeat = playback['progressHeartbeatSec'];
  const progressHeartbeatSec =
    typeof heartbeat === 'number' && Number.isInteger(heartbeat) && heartbeat >= 1
      ? heartbeat
      : DEFAULT_PROGRESS_HEARTBEAT_SEC;

  return {
    features: {
      comments: features['comments'] === true,
      adUnlock: features['adUnlock'] === true,
    },
    playback: { progressHeartbeatSec },
  };
}

/**
 * What boot uses after the request. A transport failure, a malformed body, or a timeout
 * becomes the conservative defaults rather than a white screen. A successful body is used as
 * narrowed — today's live body *is* those defaults.
 */
export function resolveClientConfig(result: Result<ConfigView, ApiFailure>): ConfigView {
  return result.ok ? result.value : CONSERVATIVE_CLIENT_CONFIG;
}

export { CONSERVATIVE_CLIENT_CONFIG };
