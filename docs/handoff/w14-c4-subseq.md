# W14 — C4 subsequent: ads call sites + server-side `isEnded` (C4-08 / T0-3c)

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-subseq-72c4`, cut from `origin/main` at `38ac2c4` (G2.4 Semgrep).
> **Item:** `C4-08` / C2 **T0-3c** unblocked half — product call sites against the mock, and a
> server-side completion check before any reward. No invented ad-unit ids. D5 / D6 stay `[ ]`.
> **Not in scope:** G2.4 (already on main), G2.5 / G2.3 (in flight as `bc-dd13f497` /
> `bc-e055048b`), C4-04 splash/`GET /config`, Beans, VIP, enabling wallet top-up, inventing
> Portal unit ids, flipping checklist rows. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after C4-01, C4-05, C4-06,
G2.2/6/7/8, users/me, D-16, playNext, PLY-002, and G2.4: G2.5 (trivy), G2.3 (Playwright),
C4-04 (OpenAPI `/config`), C4-03 (do not fake Postgres), C4-07 (no subscription contract),
then **C4-08**. The two in-flight siblings (`bc-dd13f497`, `bc-e055048b`) were following
C4 / another C4; this slot does not take their files. Ads are a distinct product item:
`showRewardedAd` / `showInterstitialAd` had no product caller outside `platform/` and
fixtures. The unblocked work is the same C2 named: call sites against the mock, verify
`isEnded` **server-side** before any reward, never grant from the client event alone.

---

## 2. What changed

A one-use ad session nonce (`POST /v1/unlock/ad-sessions`) and a redeem
(`POST /v1/unlock/ad-grants`). The client reports `isEnded`. That report is an input to
`AdCompletionVerifier`. The default trusts **only** `isEnded === true` (U-18: no platform
SSV). `createRefusingCompletionVerifier` proves the client event alone is not a grant: a
200-shaped `isEnded: true` that the verifier refuses still leaves the episode locked, and
a skipped view consumes the nonce. Daily cap is `DESIGN_EXAMPLE_AD_DAILY_LIMIT = 5` from
`docs/design/api-contracts.md` §6.3 — an engineering ceiling, not a partner/Beans rate.

Receipt: `createAdUnlock` → `method: 'AD'`, `costCoins: 0`, `orderId` = session id
(`unlocks.order_id` is NOT NULL). GATE-4 unit ids are not a column and not a wire field.

Client unit ids come only from `VITE_REWARDED_AD_UNIT_ID` / `VITE_INTERSTITIAL_AD_UNIT_ID`.
Empty → `null`. Unlock panel offers ads when `capabilities.ads === true` **and** a unit id
is passed. Tests inject `test-rewarded-unit`. Interstitial: `offerInterstitialIfConfigured`
on **PlayPage unmount** (a natural break; must not interrupt 连播). No-op without a unit id.

Migration `0008_ad_unlock` adds `ad_unlock_sessions` and `ad_reward_log`. This is not a
search table. G2.7 floors: 8 migrations, 12 tables.

| File | Change |
| --- | --- |
| `server/migrations/0008_ad_unlock.{up,down}.sql` | Session nonce + reward log |
| `server/src/modules/unlock/ad-*.ts` | Verifier, grant, routes, stores |
| `server/src/modules/unlock/unlocks.ts` | `createAdUnlock` |
| `contracts/openapi.yaml` | Two paths. No `adUnitId` on the wire |
| `docs/12-api-parity.md` | Two live-only rows |
| `app/src/ads/` | Fail-closed unit ids, `runAdUnlock`, interstitial caller |
| `app/src/unlock/UnlockPanel.tsx` | Ad channel. Skip does not grant |
| `app/src/routes/{Drama,Play}Page.tsx` | Wire capabilities from probe + configured id |

`docs/11-official-onboarding-checklist.md` D5 and D6 are still `[ ]`. This slot did not
flip them. `.github/workflows/` is unchanged.

---

## 3. Reverse verification

The refusing verifier is the injection. Against a client `isEnded: true` that the port
refuses:

```
FAIL  the verifier, not the client event, decides completion
expected 200, received 422 AD_NOT_COMPLETED
episode-access reason still NEED_UNLOCK
```

A skipped showing (`isEnded: false`) is `422 AD_NOT_COMPLETED`, consumes the nonce, and a
second POST with `isEnded: true` on the same session is still `AD_NOT_COMPLETED`. An empty
`VITE_REWARDED_AD_UNIT_ID` is `null`; the panel does not invent a placement. A missing
binary for Semgrep is not this slot.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `cursor/w14-work-c4-follow-72c4` | **Landed C4-08** on `main` as `727592f` while this slot ran. Different files (`rewarded-unlock.ts` / `interstitial.ts` vs this slot's `ad-unlock.ts` / `offer-interstitial.ts`). **Not merged.** A second ad unlock path would be a retake |
| `cursor/w14-work-c4-cont-72c4` | **Landed G2.5** Trivy as `98e75c6`. `.github/workflows/` — this slot did not touch it |
| `cursor/w14-work-c4-plus-72c4` | **Landed C4-04** `GET /v1/config` as `2a74748`. Not retaken |
| `cursor/w14-work-c4-more2-72c4` | **Running.** G2.4 CodeQL remainder. This slot does not touch `l2.yml` |

`git diff origin/main -- .github/workflows/` is empty of this slot's work. This branch was **not** merged onto `main`.

---

## 5. Verification

`pnpm verify` green on this branch at `913dbe8` (cut from `38ac2c4`, before the sibling C4-08 merge). L1 sequence unchanged: format → lint → typecheck → test:coverage → check:coverage → build → guardrails.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 58 |
| `packages/config` | 45 |
| `packages/quality` | 102 |
| `server` | 1,736 |
| `app` | 1,086 |
| **Total** | **3,027** |

Zero skipped. Coverage gate:

```
coverage global lines 93.83% (14168/15100), branches 91.42%, core lines 95.05%, diff lines 90.78% (1083/1193)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DUCt4NiH.js` 350.25 kB / 105.90 kB gzip). Native `<video>` remains absent.

This slot did **not** merge to `main`. Re-fetching `origin/main` after verify showed C4-08 already present (`727592f`). Merging this branch would duplicate the ad unlock surface.

---

## 6. Left open

- **D5 / D6.** Still `[ ]`. GATE-4 Portal unit ids are unanswered. Wiring against the mock
  is not a device listing.
- **SSV.** U-18: there is no published server-side verification callback. The verifier port
  is the seam; the default trusts the boolean. A wrapper that ignores `isEnded` is the
  regression.
- **C4-04, C4-07, C4-03.** Splash contract, VIP, Postgres. Not faked.
- **G2.3.** Playwright smoke. Next remaining L2 slice. `cursor/w14-work-c4-more2-72c4` is CodeQL, not this.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
