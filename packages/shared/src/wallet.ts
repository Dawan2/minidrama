/**
 * The wallet read: "how many coins does this viewer hold".
 *
 * `GET /v1/wallet` answers this shape. Every balance field is optional because the honest answer,
 * until the platform supplies a coin figure, is to omit it. A missing `coinBalance` is not `0`:
 * `0` is a real empty wallet the platform must have said, and a missing figure is the unavailable
 * card (`docs/plan/cycle-3-backlog.md` C3-04, `docs/handoff/w3-work-m.md` M16).
 *
 * Beans and fiat are not part of this type. The platform charges Beans; what a coin is worth in
 * Beans is a pricing decision that does not exist (`C3-09`). Inventing `beansAmount`,
 * `amountCents`, `currency` or a rate here would be that decision, made in a type definition.
 */

export interface WalletView {
  /**
   * Paid-coin balance. Present only when the platform named it. A non-negative integer, including
   * `0` when the platform said zero.
   */
  readonly coinBalance?: number;
  /**
   * Bonus-coin balance. Same rule. Absent is not "all paid" and not `0`.
   */
  readonly bonusBalance?: number;
  /**
   * The figure the viewer is shown. Present only when the platform named a total, or when both
   * halves were named and this is their sum — the server never invents one from a lone half.
   */
  readonly totalBalance?: number;
  /**
   * Only `true` when the platform said a credit is still settling. Absent is not a pending credit;
   * the banner SCR-09 reserves for that stays down.
   */
  readonly pendingCredit?: boolean;
}

/**
 * Compile-time: adding a Beans, fiat or rate field to `WalletView` is a type error here, not a
 * review comment. The client ignores those keys; putting them on the wire would still quote a
 * currency this product has no rate for.
 */
type ForbiddenWalletKey =
  | 'beansAmount'
  | 'beansPerCoin'
  | 'coinToBeans'
  | 'BEANS_RATE'
  | 'beansRate'
  | 'amountCents'
  | 'currency'
  | 'fiatAmount'
  | 'usdAmount';

type CarriesNoBeansOrFiat<T> = Extract<keyof T, ForbiddenWalletKey> extends never ? true : false;

const _walletViewCarriesNoBeansOrFiat: CarriesNoBeansOrFiat<WalletView> = true;

/**
 * Ledger row types. `docs/12-domain-model.md` §5.2. Unlocks do not write these
 * (`docs/handoff/w9-work-unlock-grant.md` S73): a `CONSUME` that we invented from a grant would be
 * a spend the platform never posted to a coin ledger.
 */
export const WALLET_TRANSACTION_TYPES = ['RECHARGE', 'CONSUME', 'REWARD', 'REFUND'] as const;

export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WALLET_TRANSACTION_REF_TYPES = [
  'UNLOCK',
  'RECHARGE_ORDER',
  'CAMPAIGN',
  'AD_REWARD',
  'MANUAL',
] as const;

export type WalletTransactionRefType = (typeof WALLET_TRANSACTION_REF_TYPES)[number];

export function isWalletTransactionType(value: string): value is WalletTransactionType {
  return (WALLET_TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isWalletTransactionRefType(value: string): value is WalletTransactionRefType {
  return (WALLET_TRANSACTION_REF_TYPES as readonly string[]).includes(value);
}

/**
 * One row of `GET /v1/wallet/transactions`.
 *
 * Deltas are signed integers when the platform named them. They are omitted, never defaulted to
 * `0`, when it did not: a recharge rendered as `+0` because we guessed is a wrong ledger line.
 * Beans and fiat are not properties of this type (`C3-09`).
 */
export interface WalletTransaction {
  readonly id: string;
  readonly type: WalletTransactionType;
  readonly coinDelta?: number;
  readonly bonusDelta?: number;
  readonly refType?: WalletTransactionRefType;
  readonly refId?: string;
  readonly createdAt?: string;
}

const _walletTransactionCarriesNoBeansOrFiat: CarriesNoBeansOrFiat<WalletTransaction> = true;
