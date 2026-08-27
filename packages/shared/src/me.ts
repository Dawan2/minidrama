/**
 * The current-user read: "who does this session say the viewer is".
 *
 * `GET /v1/users/me` answers this shape. `id` is required because a session is always bound to
 * a user (`session-store.ts` refuses to issue otherwise). Every other profile field is optional
 * because the honest answer, until the platform supplies it, is to omit it. A missing
 * `nickname` is not `"Guest"` and not the `id` echoed as a display name.
 *
 * VIP, expiry and Beans are not part of this type. There is no subscription contract (`C4-07`)
 * and no coin→Beans rate (`C3-09`). Inventing `vip`, `expiresAt`, `beansAmount` or a rate here
 * would be those decisions, made in a type definition.
 */

export interface MeView {
  /**
   * The session's user id. Today the platform `open_id`, because there is no users table to
   * mint a local `usr_` against. Present on every successful read.
   */
  readonly id: string;
  /**
   * Display name. Present only when the platform named one. Absent is not a guest.
   */
  readonly nickname?: string;
  /**
   * Avatar URL. Present only when the platform named one. Absent is the placeholder avatar.
   */
  readonly avatarUrl?: string;
}

/**
 * Compile-time: adding a VIP, expiry, Beans, fiat or phone field to `MeView` is a type error
 * here, not a review comment. The profile card may consume only fields that exist; putting
 * those keys on the wire would quote a subscription and a currency this product does not have.
 */
type ForbiddenMeKey =
  | 'vip'
  | 'vipActive'
  | 'expiresAt'
  | 'expiry'
  | 'phoneMasked'
  | 'phone'
  | 'beansAmount'
  | 'beansPerCoin'
  | 'coinToBeans'
  | 'BEANS_RATE'
  | 'beansRate'
  | 'amountCents'
  | 'currency'
  | 'fiatAmount'
  | 'usdAmount';

type CarriesNoVipOrBeans<T> = Extract<keyof T, ForbiddenMeKey> extends never ? true : false;

const _meViewCarriesNoVipOrBeans: CarriesNoVipOrBeans<MeView> = true;

export const ME_VIEW_KEYS = ['id', 'nickname', 'avatarUrl'] as const;
