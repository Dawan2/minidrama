# W16 — leftover C5: double-tap 点赞 follows the current drama

> **Slot:** W16, work slot (`bc-8416a6dd`). One leftover item, no pull request.
> **Branch:** `cursor/w16-work-c5-left-72c4`, cut from `origin/main` at **`614f656`**
> (C5-01 / G1.10 skip-check on main; G1.7 dated as G2.5 Trivy).
> **Item:** remaining unblocked **PLY-010** gesture after swipe / autoplay / continue CTA
> landed: 双击点赞. PlayPage `PUT`s `/v1/dramas/{dramaId}/favorite`. A single tap is still
> VePlayer's pause (`AC-PL-6`). 联动收藏 is this write, not a second like API.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, C5-01 / G1.10 (on main),
> C5-02 / D-18 (on main), G1.9 (`bc-72e30448` / `cursor/w16-work-c5-more-72c4` and
> `bc-89fef1d3`), 倍速 / `playbackRate` (X-26, plugin-owned), axe-core, PLY-012 token
> re-issue, `#/vip`. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-5-backlog.md` remaining unblocked engineering after skipping D-17, C4-03,
and C4-07, and after in-flight / landed C5 slices:

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| C5-01 / D-20 G1.10 | **On `main`** at `614f656` (`bc-fed59ba3`). G1.7 dated as G2.5 |
| C5-02 / D-18 wallet transactions | **On `main`** at `e6b9b86` |
| G1.9 Conventional Commits | **RUNNING** (`bc-72e30448` `cursor/w16-work-c5-more-72c4`; also `bc-89fef1d3`). Left |
| C4-03 T14/T16/T15 | Do not fake. Skipped |
| C4-07 SCR-11 / D8 | No contract. Skipped |
| C5-03 / D-19 `wave-protocol.md` §6.2 | P3's file |
| 倍速 / axe-core as leftover | Forbidden by the C5 plan rank-2 close |
| **PLY-010 double-tap 点赞** | **This slot.** Named remainder after swipe+autoplay landed; 联动收藏可后置 was taken, not postponed |

Tap pause/resume is VePlayer-owned (`episode-swipe.ts`, `AC-PL-6`). Scrub and 倍速 are
plugin-owned (`AC-PL-6`, X-26). Double-tap like was the remaining gesture that is not a
plugin and is not the forbidden leftover.

---

## 2. What changed

Two close taps on the player surface (window 280 ms, slop 28 px) are a like. A vertical
flick is still 切集. A single tap is not delayed and is not `preventDefault`'d, so VePlayer
still owns pause.

The write is the existing favourite `PUT`. There is no like table. A second double-tap is
the same idempotent follow, not an unlike. `401` does not flash success.

| File | Change |
| --- | --- |
| `app/src/player/episode-double-tap.ts` | Gesture predicate |
| `app/src/player/PlayerSurface.tsx` | Touch pair + `dblclick` → `onDoubleTap`. Swipe clears the tap window |
| `app/src/routes/PlayPage.tsx` | `addFavorite(dramaId)` when the catalogue row is known and the picker / paywall is not up |
| `app/src/core/i18n/locales/en.json` / `ar.json` | `player.liked` |
| `app/src/styles/app.css` | `.player-liked` status copy |

`docs/plan/cycle-5-backlog.md` is not rewritten. `.github/` and `packages/quality/` are
untouched. Wallet top-up stays disabled. `adUnlock` stays false. No BytePlus `vid`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 Double-tap does not call `addFavorite`

```
FAIL  PUTs the catalogue drama and does not invent a like API
AssertionError: expected [] to deeply equal [ 'drm_test_0001' ]
```

### 3.2 A 401 still shows “Added to favourites”

```
FAIL  does not flash liked when the session is missing
expected <p …>Added to favourites</p> to be null
```

### 3.3 Swipe-up follows the drama

```
FAIL  does not follow on a 切集 swipe
expected [ 'drm_test_0001' ] to deeply equal []
```

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-fed59ba3` C5-01 / G1.10 | **Idle. Landed** `614f656`. Skip-check files not edited |
| `bc-8f301285` C5-02 / D-18 | **Idle. Landed** `e6b9b86`. Wallet files not edited |
| `bc-72e30448` C5-more / G1.9 | **RUNNING** `cursor/w16-work-c5-more-72c4` (`commits.ts`, `ci.yml`). Untouched |
| `bc-89fef1d3` G1.9 leftover | **RUNNING.** Same quality files as C5-more. Untouched |
| Playback UX siblings | **Idle. Landed.** Swipe / autoplay / cross-end / drama-detail Continue kept |

`git diff origin/main -- .github/ packages/quality/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` on this branch after the implementation.

---

## 6. What is still open

- **G1.9.** In flight. Further D-20 slice. Do not rewrite history.
- **PLY-012** token re-issue. Still no play-token refresh path.
- **QA-011 / QA-010** a11y. Still not started. Do not add axe-core as a leftover.
- **Tap pause / scrub / 倍速.** Plugin-owned or VePlayer-owned. Do not add competing controls.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named 双击点赞 remainder.
