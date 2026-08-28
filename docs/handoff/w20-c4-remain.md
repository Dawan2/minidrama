# W20 — remaining interaction-sheet gap: CN-10 start / switch 15s timeout

> **Slot:** W20, work slot (`bc-7fbe0bc1`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-c4-remain-72c4`, cut from `origin/main` at **`35744ba`**
> (INF-004 S-C3 already on main). Merged forward onto **`51ab72f`** (W18 QA-010
> SCR-02 remainder, `bc-1a5a2455`, landed while this slot wrote).
> **Item:** next remaining **播放体验 / 交互验收单** gap after S7 stall, plugin-owned
> 倍速 / scrub, PLY-012, and S6 lock chrome: **CN-10 / J12-2 / J12-7** start and
> switch first-frame wait. Construction or an entitled episode switch with no
> `PLAY` yet shows an indicator at 300 ms (IA §8.1) and a retry affordance at
> 15 s. The last frame stays. The episode is **never** skipped. Retry remints
> the route episode. Definition is never changed (`AC-PL-6`).
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, cycle-7 plan docs
> (`bc-285529d4`), after-lock C6 QA-010 remainder (`bc-1a5a2455`, landed
> `51ab72f`), 倍速 / `playbackRate` / 0.75 (X-26, plugin-owned), tap pause /
> scrub (VePlayer / plugin), BytePlus `vid` fiction. No pull request.

---

## 1. What was picked, and why

`docs/verify/cycle-6-report.md` scored protocol-C4 exit 1 (交互验收单,
`01-product-scope` §4.3) as **still 1/3**, not 全过. S7 stall covers an
in-play `timeupdate` freeze. The named remainder that stall did not cover is
起播 / 切集 with no first frame: CN-10 (hold the current frame, error after
15 s, never auto-skip) and J12-7 (加载指示, then timeout, stay on this
episode). QA-010 remainder screens were in flight (`bc-1a5a2455`) and were
left; they landed as SCR-02 while this slot merged.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Cycle-7 plan docs | **RUNNING** `bc-285529d4`. Left |
| After-lock C6 / QA-010 remainder | **RUNNING** `bc-1a5a2455`. **Landed** `51ab72f`. Left |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| 倍速 / scrub / tap pause | Plugin- or VePlayer-owned. Not competing controls |
| S7 stall / S6 lock / PLY-012 | **On `main`.** Not retaken |
| **CN-10 start / switch timeout** | **This slot.** No first-frame wait, no 15 s retry, a hung 起播 could skip |

This slice does **not** claim protocol-C4 exit 1 closed. D9 stays `[ ]` until
a device. X-26 stays unadjudicated.

---

## 2. What changed

While the surface is waiting for `PLAY` after construction or an entitled
switch, a ticker compares wall-clock to the arm time. A frozen WebView timer
that wakes after 15 s lands on timeout rather than restarting the 300 ms
flash guard. `PLAY` clears chrome. `ERROR` clears it so PLAYER_FATAL is not a
second overlay. Retry remints via the existing PlayPage re-issue path and
does not unmount VePlayer. `playNext` is not called on timeout.

| File | Change |
| --- | --- |
| `app/src/player/player-start.ts` | Watchdog + chrome phase |
| `app/src/player/PlayerSurface.tsx` | Overlay on the last frame; `onStartTimeout`; arm on construct / switch / re-issue |
| `app/src/routes/PlayPage.tsx` | Start timeout remints the route episode |
| `app/src/player/mock-veplayer.ts` | `holdPlay` so a test can withhold `PLAY` |
| `app/src/core/i18n/locales/en.json` / `ar.json` | `player.starting` / `player.startTimeout` |
| `app/src/styles/app.css` | `.player-start` overlay |

`docs/plan/cycle-6-backlog.md` is not rewritten. `.github/` and
`packages/quality/` were not edited here. Wallet top-up stays disabled.
`adUnlock` stays false. No BytePlus `vid`.

---

## 3. Mutations that bite

Covered by tests on this branch (not a live revert in this slot).

### 3.1 Watchdog never enters timeout

```
FAIL  offers retry at 15 s without skipping or changing definition
TestingLibraryElementError: Unable to find an element by: [data-testid="player-start-retry"]
```

### 3.2 Timeout skips to the next episode

```
FAIL  re-arms on an entitled switch and does not skip when that PLAY never arrives
AssertionError: expected 2 to be 1
```

(`playNextCount` stays the switch that was already entitled, not a second hop.)

### 3.3 A client `playbackRate` is invented

```
FAIL  does not skip, change definition, or invent a rate ladder
```

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-1a5a2455` after-lock C6 / QA-010 remainder | **Idle. Landed** `51ab72f` / `cursor/w18-work-c6-after-lock-72c4`. `packages/quality/a11y/` not edited here |
| `bc-285529d4` W20 plan cycle-7 | **RUNNING** at pick. Plan docs left |
| `bc-2c841f7a` leftover INF-004 S-C3 | **Idle. Landed** `35744ba` before this cut |

`git diff origin/main -- .github/ packages/quality/` is empty of this slot's work
(after absorbing their landings).

---

## 5. Verify

`pnpm verify` exited 0 on this branch after merging `origin/main` (`51ab72f`,
QA-010 SCR-02 remainder). L1 sequence is format → lint → typecheck →
check:commits → check:skips → check:audit → check:a11y → test:coverage →
check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` (merge commits skipped; handoff is a later commit) |
| G1.10 skips | `237 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (2 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,571 passing** — shared 63, quality 428, config 45, server 1,785, app 1,250. Coverage: global lines 94.36% (17866/18934), branches 90.87%, core 95.70%, **diff lines 92.95% (145/156)** |
| Build | pass — `index-B2g09p35.js` 366.74 kB / 112.08 kB gzip |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. No `vid_demo_` in product source. Test count
did not fall (3,553 on `main` after S-C3 / 3,571 here; the extra tests are
this slice plus the absorbed QA-010 remainder).

---

## 6. What is still open

- **Full 交互验收单.** Tap pause / 倍速 / scrub stay VePlayer- or plugin-owned.
  Sheet is not 全过. D9 stays `[ ]` until a device.
- **X-26.** 0.75 vs inventory. Do not invent a client `playbackRate`.
- **QA-010 remainder.** S-A1 on every implemented SCR/PNL. SCR-02 landed; other
  screens are further slices. Not protocol-C4 exit 3.
- **充值 option on PNL-02.** C4-06: recharge stays disabled.
- **`POST /v1/playback/sessions/{id}/failures`.** Report path. No invented endpoint.
- **S-C4.** Required-checks vs GitHub branch protection. D-17 still falsifies
  GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named CN-10
start / switch timeout remainder.
