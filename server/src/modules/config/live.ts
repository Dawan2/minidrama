import { CONSERVATIVE_CLIENT_CONFIG, type ConfigView } from '@minidrama/shared';

/**
 * The configuration `GET /v1/config` serves today.
 *
 * It is the conservative product state, not a design-doc example. Comments (PNL-04) stay off
 * because those endpoints do not exist — a `comments: true` here would tell the splash to
 * render an entry whose routes 404. Ad-unlock endpoints exist (C4-08) but GATE-4 has not named
 * a unit id, so `adUnlock` stays false: the panel does not offer a channel that would 503.
 * Legal URLs, ad-unit ids and a coin name are not on this object (`C4-04`).
 *
 * Equal to `CONSERVATIVE_CLIENT_CONFIG` on purpose: AC-BOOT-4's fallback *is* what we ship, until
 * a later slot turns a flag on for a reason that exists in this repository.
 */
export const LIVE_CLIENT_CONFIG: ConfigView = CONSERVATIVE_CLIENT_CONFIG;
