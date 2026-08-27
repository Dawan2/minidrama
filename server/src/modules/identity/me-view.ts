import type { MeView } from '@minidrama/shared';
import { ME_VIEW_KEYS } from '@minidrama/shared';

/**
 * Project session identity onto the wire shape the client `narrowMeView` reads.
 *
 * Two properties this function exists to hold, because both are easy to violate with a
 * placeholder:
 *
 * 1. **No invented profile.** The session is bound to a user id (`open_id` until a users table
 *    exists). Nickname and avatar are copied only when the caller named a non-empty string —
 *    today's route names neither, because the session store does not hold them.
 * 2. **No VIP, no expiry, no Beans.** Only the three `MeView` keys can leave. A `vip` object
 *    stuffed onto the facts is dropped, not forwarded as `{ active: false }` (`C4-07`, `C3-09`).
 */

export interface MeIdentity {
  readonly id: string;
  readonly nickname?: string;
  readonly avatarUrl?: string;
}

export function toMeView(identity: MeIdentity): MeView {
  const view: {
    -readonly [K in keyof MeView]: MeView[K];
  } = { id: identity.id };

  const nickname = readNonEmptyString(identity.nickname);
  const avatarUrl = readNonEmptyString(identity.avatarUrl);
  if (nickname !== null) {
    view.nickname = nickname;
  }
  if (avatarUrl !== null) {
    view.avatarUrl = avatarUrl;
  }

  return view;
}

/**
 * The keys a me body is allowed to carry. Used by the route tests so a VIP or Beans field
 * cannot be added to the mapper and left untested: the assertion is on the enumerated set, not
 * on the absence of one name.
 */
export function meViewKeys(view: MeView): readonly string[] {
  return Object.keys(view);
}

export { ME_VIEW_KEYS };

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
