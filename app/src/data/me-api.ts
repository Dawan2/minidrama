import type { MeView, Result } from '@minidrama/shared';

import { asRecord, narrow } from './narrow';
import type { ApiFailure } from './failure';
import type { HttpReader } from './http';

/**
 * The current-user identity read: "who does this session say I am".
 *
 * `GET /v1/users/me` is served. The body is fail-closed: `id` is the session's user id (the
 * platform `open_id` until a users table exists), and nickname / avatar are omitted until the
 * platform names them. A missing nickname is not the `id` and not `"Guest"`.
 *
 * VIP, expiry and Beans are ignored even if a future body grows them. There is no subscription
 * contract (`C4-07`) and no coin→Beans rate (`C3-09`). The profile VIP card does not read this
 * client — quoting `vip.active=false` from an omitted field would be the same lie as quoting
 * `0 coins`.
 */

export const ME_PATH = '/v1/users/me';

export interface MeApi {
  fetchMe(): Promise<Result<MeView, ApiFailure>>;
}

export function createMeApi(http: HttpReader): MeApi {
  return {
    fetchMe: async () => {
      const body = await http.getJson(ME_PATH);
      return body.ok ? narrow(body.value, narrowMeView) : body;
    },
  };
}

/**
 * Read identity out of an unknown body, or report that none is there.
 *
 * Returns `null` only when the value is not an object or `id` is missing / unreadable — that is
 * a truncated or HTML body, and `narrow` maps it to `MALFORMED`. Extra keys, including `vip`
 * and `beansAmount`, are dropped rather than forwarded. An empty nickname is omitted rather
 * than treated as a display name.
 */
export function narrowMeView(value: unknown): MeView | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const id = record['id'];
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }

  const view: {
    -readonly [K in keyof MeView]: MeView[K];
  } = { id };

  const nickname = record['nickname'];
  if (typeof nickname === 'string' && nickname.length > 0) {
    view.nickname = nickname;
  }

  const avatarUrl = record['avatarUrl'];
  if (typeof avatarUrl === 'string' && avatarUrl.length > 0) {
    view.avatarUrl = avatarUrl;
  }

  return view;
}
