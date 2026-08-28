# W18 — remaining interaction-sheet gap: S7 stall indicator then retry

> **Slot:** W18, work slot (`bc-402f89a0`). One leftover item, no pull request.
> **Branch:** `cursor/w18-work-interaction-72c4`, cut from `origin/main` at **`aa8a9e8`**
> (PLY-012 silent play-token re-issue).
> **Item:** next remaining **交互验收单** gap after PLY-010 gestures and PLY-012:
> SCR-05 **S7 卡顿态** / `AC-PL-7`. A `timeupdate` gap while playing shows a spinner at
> 1.5 s and a retry affordance at 8 s (`CN-6` budget). The last frame stays. Retry remints
> the route episode. Definition is never changed (`AC-PL-6`).
> **Not in scope:** PLY-012 (landed `aa8a9e8`, not retaken), QA-010 (`bc-b0108787`),
> cycle-6 plan docs (`bc-4233e1b3`), D-17 billing, C4-03 Postgres, C4-07 VIP, 倍速 /
> `playbackRate` (X-26, plugin-owned), tap pause / scrub (VePlayer / plugin), BytePlus
> `vid` fiction. No pull request.

---

## 1. What was picked, and why

Cycle-5 verify scored protocol-C4 exit 1 (交互验收单, `01-product-scope` §4.3) as **not
met** even after PLY-010. PLY-012 (`aa8a9e8` / `docs/handoff/w16-c5-after-like.md`)
closed 令牌过期静默换发. Remaining named sheet rows that a work slot must not invent:
倍速 / scrub (plugin-owned, X-26). QA-010, D-17, C4-03, and C4-07 were skipped as
ordered.

The next closable sheet remainder is the §4.3 验收要点 that landed gestures did not
cover: 低端机不卡死. Screen inventory S7 and the player state machine already specify
the chrome: stall is inferred from a `TIME_UPDATE` gap (`CN-17`), spinner at 1.5 s,
retry at 8 s, **no definition change**. That path was absent from product source.

| Item | State at pick |
| --- | --- |
| PLY-012 token re-issue | **On `main`** at `aa8a9e8`. Not retaken |
| PLY-010 swipe / ended `playNext` / double-tap | **On `main`** |
| 倍速 / scrub / tap pause | Plugin- or VePlayer-owned. Not competing controls |
| QA-010 axe-core | **RUNNING** `bc-b0108787`. Left |
| Cycle-6 plan docs | **RUNNING** `bc-4233e1b3`. Left |
| D-17 / C4-03 / C4-07 | Skipped as ordered |
| **S7 stall / `AC-PL-7`** | **This slot.** No stall watchdog, no spinner, no retry chrome |

---

## 2. What changed

While the surface is `playing`, a one-second tick compares wall-clock to the last
*advancing* `timeupdate`. A frozen WebView timer that wakes after 10 s lands on retry
rather than restarting the 1.5 s flash guard. Pause, ended, and error are not stalls.
A same-position tick is not advancement. Retry remints via the existing PlayPage
re-issue path and does not unmount VePlayer.

| File | Change |
| --- | --- |
| `app/src/player/player-stall.ts` | Watchdog + chrome phase |
| `app/src/player/PlayerSurface.tsx` | Overlay on the last frame; `onStallRetry` |
| `app/src/routes/PlayPage.tsx` | Stall retry remints the route episode |
| `app/src/core/i18n/locales/en.json` / `ar.json` | `player.stalled` |
| `app/src/styles/app.css` | `.player-stall` overlay |

`docs/plan/cycle-5-backlog.md` is not rewritten. `.github/` and `packages/quality/`
are untouched. Wallet top-up stays disabled. `adUnlock` stays false. No BytePlus `vid`.

This slice does **not** claim protocol-C4 exit 1 closed. 倍速 / scrub remain
plugin-owned (X-26).

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Watchdog never enters stall

```
FAIL  shows the indicator after the watchdog plus 1.5 s of silence, then retry at 8 s
AssertionError: expected [] to deeply equal [ 'indicator' ]
```

### 3.2 Advancing `timeupdate` does not clear chrome

```
FAIL  clears the overlay when position advances and does not stall a pause
expected <div data-testid="player-stall"> not to be null
```

### 3.3 Stall retry does not remint

```
FAIL  keeps the last frame, remints once the user retries, and does not change definition
expected [ 'ep_test_0001' ] to deeply equal [ 'ep_test_0001', 'ep_test_0001' ]
```

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-264077b7` PLY-012 | **Idle. Landed** `aa8a9e8`. `player-fatal.ts` / re-issue kept. This slot adds stall next to them |
| `bc-b0108787` QA-010 | **Idle. Landed** `3e8bdb2` while this slot ran. `.github/` / axe-core not edited here |
| `bc-4233e1b3` cycle-6 plan | **Idle. Landed** `68d2747`. Plan docs not rewritten. Rank 2 is the rest of the sheet; this slice is S7, not 倍速 |

`git diff origin/main -- .github/ packages/quality/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 after absorbing `origin/main` (`3e8bdb2`: QA-010 axe-core L1
and the cycle-6 plan). L1 sequence is now format → lint → typecheck →
check:commits → check:skips → **check:a11y** → test:coverage → check:coverage → build →
guardrails.

- skip-check: 232 files, 0 skips
- a11y: 1 screen, 0 critical, 0 serious
- app tests: 1213 passed
- coverage: diff lines 98.33% (177/180)
- build: `index-o9suSD8K.js` 362.88 kB

---

## 6. What is still open

- **倍速 / scrub / tap pause.** Plugin-owned or VePlayer-owned. Do not add competing controls.
- **QA-010** a11y gate. Landed `3e8bdb2`. Do not retake axe-core.
- **PLY-011 remainder** (S6 cover+lock chrome; 充值 option on PNL-02). Not this slice.
- **`POST /v1/playback/sessions/{id}/failures`.** Report path. No invented endpoint.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named S7 stall remainder.
