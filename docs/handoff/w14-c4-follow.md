# W14 — C4-08: ad call sites and server-side `isEnded` check

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-follow-72c4`, cut from `origin/main` at `74fd7cd` (C4-06
> trade_order stub on main).
> **Item:** `C4-08` / C2 `T0-3c` — product call sites for `showRewardedAd` / `showInterstitialAd`,
> plus the server-side reward check. No invented ad-unit ids. D5 / D6 stay `[ ]`.
> **Not in scope:** C4-06 (already on main at pick), remaining L2 and C4-plus (in flight at
> pick; both landed on `main` before this merge), C4-07 VIP, enabling wallet top-up, Beans.
> No pull request. Did not invent Portal ad-unit ids. Live `adUnlock` stays `false`.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after C4-01, C4-02 (G2.7, G2.2,
G2.6), C4-05, C4-06, PLY-002, playNext, and `GET /v1/users/me`:

| Item | State |
| --- | --- |
| C4-01 / C4-02 G2.7 G2.2 G2.6 | on `main` |
| C4-05 OAuth stub | on `main` |
| C4-06 trade_order stub | on `main` at `74fd7cd` |
| Remaining L2 (G2.3 / G2.4 / G2.5) | in flight at pick (`bc-33b61d7a`); G2.4 landed before merge |
| C4-plus extra | in flight at pick (`bc-e055048b`); C4-04 landed at `2a74748` |
| C4-03 T14 Postgres | do not fake |
| C4-04 splash / `GET /config` | landed on `main` while this branch was open |
| **C4-08 ads** | **this slot** |
| C4-07 VIP | no contract; do not invent |

The unblocked work C2 named: call sites against the mock, and `isEnded` verified server-side
before any reward. GATE-4 still owns real Portal ids. Enabling recharge would fail C4-06
acceptance item 4; this slot does not touch `WalletPage`.

---

## 2. What changed

### 2.1 Server

`POST /v1/unlock/ad-sessions` issues a single-use nonce for `AFTER_EPISODE` or `MANUAL_SKIP`
(the two F-4 slots). A free-form unlock-panel placement is not expressible. No Portal id
configured → `503 UNLOCK_AD_UNAVAILABLE`, not a placeholder string.

`POST /v1/unlock/ad-grants` is the only write that creates an `AD` receipt. The client reports
`isEnded`. That boolean is not a grant:

- the nonce must match the viewer, the episode, be unexpired and unconsumed
- a replaceable `AdCompletionVerifier` decides completeness (U-18: no SSV callback)
- daily quota (design-doc example of 5) is counted from `AD` rows
- VIP-only, free, and already-owned episodes are refused the same way coins are

A verifier that returns `NOT_COMPLETED` even when the body says `isEnded: true` still writes
no receipt. That is the reverse verification that the HTTP event is not the grantor.

Default `buildApp` has `rewardedAdUnitId: null`. Tests inject `ad_fx_rewarded`, a fixture id.

### 2.2 Client

`watchRewardedAdUnlock` is the rewarded product caller. `canIUse('createRewardedVideoAd')`
false never reaches the SDK. A skip still POSTs `isEnded: false` so the nonce is consumed.

UnlockPanel shows the ad channel only when PlayPage passes a placement (连播 =
`AFTER_EPISODE`, 切集 = `MANUAL_SKIP`) **and** `features.adUnlock` is on. Live config
keeps that flag false. A drama-list open does not.

`maybeShowInterstitial` is the interstitial product caller. Chrome invokes it when *leaving*
play, never on boot, never during play. The unit id is `null` until GATE-4, so production
skips. Tests inject `ad_fx_interstitial` and prove cooldown / `canIUse` / missing id.

`window.TTMinis` stays inside `platform/`.

| File | Change |
| --- | --- |
| `server/src/modules/unlock/ad-routes.ts` | Session + grant |
| `server/src/modules/unlock/ad-completion.ts` | Replaceable verifier |
| `server/src/modules/unlock/unlocks.ts` | `createAdUnlock` |
| `app/src/ads/rewarded-unlock.ts` | Rewarded call site |
| `app/src/ads/interstitial.ts` | Interstitial call site |
| `app/src/unlock/UnlockPanel.tsx` | F-4 ad channel |
| `app/src/routes/PlayPage.tsx` | Passes placement |
| `app/src/chrome/Chrome.tsx` | Leave-play interstitial attempt |
| `contracts/openapi.yaml` | The two paths |
| `docs/12-error-catalog.md` | `UNLOCK_AD_*` |
| `docs/12-api-parity.md` | live-only rows |

`docs/11-official-onboarding-checklist.md` D5 and D6 are still `[ ]`. This slot did not flip
them. `WalletPage` recharge stays disabled and Beans-free.

---

## 3. Reverse verification

Against a grant whose body is `isEnded: true` and whose nonce was never issued:

```
FAIL  refuses isEnded true when the nonce is missing — not a synthesised grant
expected 422, unlock row undefined
```

Against a verifier that always returns `NOT_COMPLETED`:

```
FAIL  still writes no receipt — the HTTP body is not the grantor
expected UNLOCK_AD_NOT_COMPLETED, unlock row undefined
```

Against a skip (`isEnded: false`) the client still POSTs that boolean; the server answers
`UNLOCK_AD_NOT_COMPLETED` and writes no row.

A sixth `AD` receipt in one UTC day is `429 UNLOCK_AD_QUOTA_EXCEEDED`.

`rg showRewardedAd|showInterstitialAd` outside `app/src/platform/` now hits `ads/` and the
panel. `window.TTMinis` still does not.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-33b61d7a` (remaining L2) | **Landed.** G2.4 Semgrep on `main` at `38ac2c4`. This slot still does not touch `.github/workflows/` |
| `bc-e055048b` (C4-plus / C4-04) | **Landed.** `GET /v1/config` at `2a74748`. ConfigView forbids ad-unit ids. `adUnlock` stays `false` |
| C4-06 on main | Trade-order create. Untouched |

Merged `origin/main` at `2a74748`. No file conflicts. After that merge the panel reads
`features.adUnlock` so a live `false` does not offer a channel that would 503. Tests that
exercise the channel inject `adUnlock: true`. Interstitial unit id remains `null` — config
does not carry one, and inventing a Portal id is GATE-4.

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`2a74748`). L1 sequence
unchanged: format → lint → typecheck → test:coverage → check:coverage → build → guardrails.

D5 / D6 remain `[ ]`. G2.6 `check:artifact` is L2, not folded into `pnpm verify`.

---

## 6. Left open

- **D5 / D6.** Wired against the mock. GATE-4 unit ids and a device still required. Do not
  mark the checklist `[x]`. `adUnlock` stays `false` on live config.
- **C4-07 VIP, recharge / Beans.** Unchanged. Top-up stays disabled.
- **G2.3, G2.5.** L2 remainder after G2.4 landed.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
