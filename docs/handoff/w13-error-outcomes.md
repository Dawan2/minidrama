# Handoff — Wave 13: `ERROR_OUTCOMES` is asserted, and `NOT_FULFILLED` is in it

> **Branch:** `cursor/w13-work-error-outcomes-72c4`, cut from `origin/main` at `fb2b967` (CoverImage
> already on `main`).
> **Scope:** a regression test that the webhook operator-alerting set still contains the
> grant-not-fulfilled outcome. One file besides this one: the new test. Production code is
> unchanged — the set on `main` was already correct.
> **Not in scope:** app page tests (W13 flakes slot), CoverImage, silent re-login client files, the
> W11 plan branch, and the W10 report. No pull request was opened.

---

## 1. The gap

`docs/handoff/w12-merge-unlock-grant-tail.md` §5.2 mutated the merged tree by dropping one member:

```diff
 export const ERROR_OUTCOMES: readonly PaidTradeOrderOutcome[] = [
   'PAYER_MISMATCH',
   'ORDER_NOT_PAYABLE',
-  'NOT_FULFILLED',
   'DUPLICATE_PURCHASE',
 ];
```

All 1,314 server tests still passed. The rename `UNLOCK_NOT_GRANTED` → `NOT_FULFILLED` was not the
cause: the set was asserted by nothing under either name. A paid viewer who owns nothing then
produces an `info` line nobody reads instead of an `error` line operators see, because
`platform-tiktok/routes.ts` picks the level with `ERROR_OUTCOMES.includes(outcome)`. The callback
answers `200` either way — a non-200 is a failed delivery and a 72-hour retry — so the log line is
the whole of the alerting.

W9's S70 argued that naming the set next to the type forces a decision when a human adds an
outcome. It does not catch a member being dropped. W12 flagged that for whoever owns
`platform-tiktok/` and did not write the test (merge slot, §8 rule 4). This slot is that owner.

---

## 2. What changed

**The set was already right.** `PaidTradeOrderOutcome` on `main` names the grant-not-fulfilled
member `NOT_FULFILLED`, and `ERROR_OUTCOMES` already lists it, with `PAYER_MISMATCH`,
`ORDER_NOT_PAYABLE`, and `DUPLICATE_PURCHASE`. No product behaviour moved.

**One new file** asserts it:

| File | Change |
| --- | --- |
| `server/src/modules/platform-tiktok/paid-trade-orders.test.ts` | New, 4 tests |
| `docs/handoff/w13-error-outcomes.md` | This document |

The four tests:

1. **`ERROR_OUTCOMES` contains `'NOT_FULFILLED'`.** The literal is in the test, not derived from the
   set, so dropping the member fails even if the rest of the file is edited to match.
2. **The set is exactly the four "money in the wrong place" outcomes.** Ordinary traffic
   (`RECORDED`, `ALREADY_RECORDED`, `NO_MATCHING_ORDER`) is not in it.
3. **The set agrees with an exhaustive classification of `PaidTradeOrderOutcome`.** Adding a member
   to the type fails typecheck until it is classified as `error` or `info`; classifying it as
   `error` without putting it in the set fails the loop.
4. **`routes.ts` takes the log level from `ERROR_OUTCOMES.includes(outcome) ? 'error' : 'info'`.**
   Membership is what operators see, not a second inline list at the log line.

Nothing under `app/`, `packages/`, `contracts/`, or any other server module changed. The built
bundle still hashes to `index-DmVWrZ3O.js` (307.42 kB / 95.75 kB gzip) — the same artifact CoverImage
left on `main`.

---

## 3. The mutation that the new tests catch

The same edit W12 made, on this branch, against the new file:

```diff
 export const ERROR_OUTCOMES: readonly PaidTradeOrderOutcome[] = [
   'PAYER_MISMATCH',
   'ORDER_NOT_PAYABLE',
-  'NOT_FULFILLED',
   'DUPLICATE_PURCHASE',
 ];
```

Three of the four tests fail, in 10 ms:

| Test | Failure |
| --- | --- |
| includes the grant-not-fulfilled outcome… | `expected [ 'PAYER_MISMATCH', …(2) ] to include 'NOT_FULFILLED'` |
| is exactly the outcomes that mean… | expected array missing `'NOT_FULFILLED'` |
| agrees with the callback vocabulary… | `expected false to be true` (`NOT_FULFILLED` classified as `error`, not in the set) |

The source-scan of `routes.ts` still passes, which is the point of it: dropping a member does not
change how the level is chosen, only what the choice does. The membership tests are what close §5.2.

Reverted before commit. `git diff` against `paid-trade-orders.ts` is empty.

---

## 4. Verification

`pnpm verify` exits 0 on this branch, first try, **2,167 tests across 116 files, none skipped**.
That is four more tests and one more file than `fb2b967` carried (2,163 / 115). Server tests went
1,314 → **1,318**. FavoritesPage did not flake; it was not retried, and this slot did not touch it.

The same verify was re-run after merging `78505ad` (the paging-flake tests that landed on `main`
mid-slot): same count, first try, none skipped.

---

## 5. Decisions taken in this slot

None that change the product. One that records why not:

The set on `main` matches W9 S70 and W12 §3.1: `NOT_FULFILLED` and `DUPLICATE_PURCHASE` are error
level, and so are `PAYER_MISMATCH` and `ORDER_NOT_PAYABLE`. A slot asked to prefer test-only when
the set is already correct does not "fix" a list that is not wrong.

`publishVerifiedPayment` stays unexported. The log-level assertion is a source scan of the one
ternary that consumes the set, not a new helper and not an HTTP trip through a custom logger.

---

## 6. In-flight work, left alone

`origin/main` moved while this slot was running: the W13 flakes branch landed as `78505ad`
(`docs/handoff/w13-test-flakes.md`). That is six files under `app/src/routes/`, `app/src/testing/`,
and `docs/handoff/` — none of them this slot's two new paths. Merged into this branch with no
conflicts.

At the fetch immediately before merging onto `main`:

| Branch | Paths | Overlap with this slot |
| --- | --- | --- |
| `cursor/w13-work-test-flakes-a44c` | already an ancestor of `main` | none (never shared a path) |
| `cursor/w11-plan-cycle-3-93ab` | `docs/plan/cycle-3-backlog.md`, `docs/handoff/w11-plan.md` | none |
| `cursor/w10-verify-cycle-2-7b17` | `docs/verify/cycle-2-report.md` | none |

W12 silent re-login still has no branch on origin. CoverImage was already on `main` (`8e3c2aa`) and
was not opened. This slot's two paths are both new. No pull request.

---

## 7. For the next slot

**The W12 §5.2 gap is closed.** Dropping `NOT_FULFILLED` from `ERROR_OUTCOMES` fails CI. Adding an
outcome to `PaidTradeOrderOutcome` without classifying it in the new file fails typecheck.

Still open, and not this slot's:

- **`cursor/w11-plan-cycle-3-93ab`** and **`cursor/w10-verify-cycle-2-7b17`**, still not ancestors
  of `main`. Documents only.
- **Silent re-login**, still unpublished. Untouched.
- **W13 flakes** is closed on `main` as of `78505ad`. Untouched here.
