# W18 — PLY-011 remainder: S6 cover + lock chrome

> **Slot:** W18, work slot (`bc-119dafb6`). One leftover item, no pull request.
> **Branch:** `cursor/w18-work-c6-follow-72c4`, cut from `origin/main` at **`079701b`**
> (X-26 scrub already on main). Merged forward onto **`eff5eb2`** (倍速 and INF-004
> S-C1 landed while this slot wrote).
> **Item:** **PLY-011 remainder** — SCR-05 **S6 锁定态**: 封面 + 锁标 under PNL-02.
> A 403 play does not construct VePlayer. Cover goes through `CoverImage`. A
> missing poster is the existing placeholder, not an invented host.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, 倍速 (`bc-3bac5e63`,
> landed `eff5eb2`), scrub (on main at `079701b`), INF-004 S-C1 (`bc-19bb7d97`,
> landed), QA-010 remainder screens, 充值 option on PNL-02 (C4-06 stays disabled),
> playback failure report path. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-6-backlog.md` ranks D-17 first (not a branch) and protocol-C4
交互验收单 second. Scrub was already on `main`. 倍速 and C6-next INF-004 S-C1
were running. C4-03 / C4-07 stay skipped. The named leftover after stall chrome
(`docs/handoff/w18-interaction.md` §6) is S6 cover+lock, not a new panel.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| X-26 scrub | **On `main`** at `079701b`. Not retaken |
| X-26 倍速 | **RUNNING** `bc-3bac5e63`. **Landed** `eff5eb2` while this slot merged. Left |
| INF-004 S-C1 | **RUNNING** `bc-19bb7d97`. **Landed** while this slot merged. Left |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| QA-010 remainder screens | Further a11y fixtures. Not this slice |
| **PLY-011 S6 cover + lock** | **This slot.** Empty `player-locked` stub was not the chrome |

PNL-02 already auto-opens on a lock. Recharge stays off. Ads stay behind
`features.adUnlock`. This slice does **not** claim protocol-C4 exit 1 closed.

---

## 2. What changed

A commercially locked session (403) renders cover + lock mark and never mounts
VePlayer. The drama poster is read only after the lock is known; a failed or
absent read is CoverImage's placeholder. PNL-02 is unchanged.

| File | Change |
| --- | --- |
| `app/src/player/locked-chrome.tsx` | Cover + lock mark. `posterFromDrama` fail-closed |
| `app/src/routes/PlayPage.tsx` | Locked attempt uses the chrome; fetches drama only when locked |
| `app/src/styles/app.css` | `.player-locked` overlay on the 9:16 surface |
| `app/src/core/i18n/locales/en.json` / `ar.json` | `player.locked` |

`docs/plan/cycle-6-backlog.md` is not rewritten. `.github/` and `packages/quality/`
are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No BytePlus
`vid`. PlayerSurface / rate plugin / audit job are the siblings that landed on
`main` while this slot wrote.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Empty `player-locked` stub (no cover, no mark)

```
FAIL  opens the unlock overlay on a locked deep link and does not start the player
TestingLibraryElementError: Unable to find an element by: [data-testid="player-locked-mark"]
```

### 3.2 Raw `<img>` instead of CoverImage

```
FAIL  a cover URL is checked before the browser is asked to fetch it
expected [ 'src/player/locked-chrome.tsx:…' ] to deeply equal []
```

### 3.3 Missing drama still constructs VePlayer

```
FAIL  keeps the lock chrome when the drama poster cannot be read
expected [] to have a length of +0 but got 1
```

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-3bac5e63` 倍速 | **Idle. Landed** `eff5eb2`. Rate plugin / `PlayerSurface`. This slot did not edit those files |
| `bc-19bb7d97` INF-004 S-C1 | **Idle. Landed.** `check:audit` / quality package. Untouched here |
| `bc-c68b4e10` scrub | **Idle. Landed** `079701b` before this cut. Seek inference not retaken |

`git diff origin/main -- .github/ packages/quality/ app/src/player/PlayerSurface.tsx app/src/player/veplayer-plugins.ts` is empty of this slot's work (after absorbing their landings).

---

## 5. Verify

`pnpm verify` exited 0 after absorbing `origin/main` (`eff5eb2`: 倍速 + INF-004).
L1 sequence is now format → lint → typecheck → check:commits → check:skips →
**check:audit** → check:a11y → test:coverage → check:coverage → build →
guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped) |
| G1.10 skips | `236 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits)` |
| QA-010 a11y | `a11y passed (1 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,548 passing** — shared 63, quality 419, config 45, server 1,785, app 1,236. Coverage: global lines 94.36% (17649/18704), branches 90.96%, core 95.70%, **diff lines 100.00% (35/35)** |
| Build | pass — `index-C3L6HYpZ.js` 364.54 kB / 111.58 kB gzip |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. No `vid_demo_` in product source. Test count
did not fall (3,511 on `main` after scrub → 3,548 here; the extra tests are this
slice plus 倍速 / INF-004 absorbed from `main`).

---

## 6. What is still open

- **充值 option on PNL-02.** C4-06: recharge stays disabled. Not a client-invented
  `#/recharge`.
- **QA-010 remainder.** S-A1 on every implemented SCR/PNL. This slot did not add
  screen fixtures.
- **S-C3 / S-C4.** Echo-only steps and required-checks vs branch protection.
  Further INF-004 slices. D-17 still falsifies GitHub reverse-verification.
- **`POST /v1/playback/sessions/{id}/failures`.** Report path. No invented endpoint.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-6-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named S6
cover+lock remainder. Tap pause / 倍速 / scrub stay VePlayer- or plugin-owned.
