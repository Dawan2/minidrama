# W20 — protocol-C4 remainder: single-tap pause/resume on the retained VePlayer

> **Slot:** W20, work slot (`bc-ecde45cf`). One leftover item, no pull request.
> **Branch:** `cursor/w20-work-tap-pause-72c4`, cut from `origin/main` at **`a49ebd7`**
> (QA-010 SCR-06 profile already on main).
> **Item:** remaining **播放体验 / 交互验收单** gap after 倍速 / scrub shipped in C6:
> **单击暂停/继续** on the retained VePlayer, distinct from double-tap 点赞.
> `closeVideoClick: false` stays. A click on the mount toggles `pause()` / `play()`
> on the same instance. Product source does not `preventDefault` a single tap and
> does not draw a competing play/pause control (`AC-PL-6`).
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, profile a11y
> (`bc-a6639f6d`, already on `main` at `a49ebd7`), C7-second (`bc-1ed8782f`),
> 倍速 / `playbackRate` / 0.75 (X-26, plugin-owned), BytePlus `vid` fiction.
> No pull request.

---

## 1. What was picked, and why

`docs/handoff/w20-c7-first.md` ranked the 交互验收单 as a named remainder and
left **tap pause** untouched (倍速 / scrub already plugin-owned from C6).
C7-first took SCR-06 profile instead; that remainder is on `main`. This slot
takes the named tap-pause half. Sibling `bc-a6639f6d` is retaking profile a11y
and should no-op. C7-second `bc-1ed8782f` is left.

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| QA-010 SCR-06 profile | **On `main`** at `a49ebd7`. Sibling `bc-a6639f6d` should no-op. Not retaken |
| C7-second `bc-1ed8782f` | **RUNNING.** Left |
| 倍速 / scrub | **On `main`** as kept plugins (C6). X-26. Not retaken |
| C4-03 / C4-07 | Do not fake / no contract. Skipped |
| **PLY-010 单击暂停/继续** | **This slot.** VePlayer-owned tap pause/resume on the retained instance |

`VEPLAYER_CLOSE_VIDEO_CLICK` was already `false`. The gap was that MockVePlayer
did not toggle, and tests treated a single tap as nothing. Constructor flag
without the behaviour is not the sheet row.

This slice does **not** claim protocol-C4 exit 1 closed. 倍速 / scrub stay
plugin-owned. Sheet is not 全过.

---

## 2. What changed

`closeVideoClick: false` keeps tap-to-pause on VePlayer. The mock now listens
on `config.el` and toggles `pause()` / `play()` on that instance. Destroy
removes the listener. `closeVideoClick: true` does not steal the tap.
`data-veplayer-tap-pause="kept"` records the policy the way progress and
playbackrate already do.

PlayerSurface still does not `preventDefault` a single tap and still does not
call `pause()` / `play()` itself. Double-tap 点赞 stays the product gesture
(`episode-double-tap.ts`). A click is not a like. No competing pause button.

| File | Change |
| --- | --- |
| `app/src/player/mock-veplayer.ts` | Click toggles play/pause when `closeVideoClick` is false; dataset `veplayerTapPause` |
| `app/src/player/mock-veplayer.test.ts` | Same-instance toggle; closed click is a no-op; destroy does not leak the listener |
| `app/src/player/PlayerSurface.tsx` | Comment: single tap stays VePlayer's; no product `pause()` |
| `app/src/player/PlayerSurface.test.tsx` | Click pauses then resumes; not a like; no `preventDefault(` |
| `app/src/player/player-facade.test.ts` | Click on the retained instance; dataset kept |
| `app/src/player/veplayer-plugins.ts` | Comment: do not `preventDefault` a single tap |
| `app/src/player/veplayer-plugins.test.ts` | `VEPLAYER_CLOSE_VIDEO_CLICK = false` stays in source |

`docs/plan/cycle-7-backlog.md` is not rewritten. `.github/` is untouched.
Wallet top-up stays disabled. `adUnlock` stays false. No BytePlus `vid`.
No client `playbackRate`. No 0.75 constant.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 `VEPLAYER_CLOSE_VIDEO_CLICK` flipped to `true`

```
FAIL  pauses and resumes on a single tap of the retained VePlayer, not a like
AssertionError: expected true to be false // Object.is equality
 ❯ src/player/PlayerSurface.test.tsx
    expect(instance.config.closeVideoClick).toBe(false);
```

### 3.2 Product `preventDefault(` on the surface

```
FAIL  does not invent 倍速, axe-core, a subscription path, or postgres
expected '…preventDefault(…' not to match /preventDefault\(/
```

### 3.3 Click is treated as a like

```
FAIL  pauses and resumes on a single tap of the retained VePlayer, not a like
expected "spy" to not be called at all, but actually been called 1 times
```

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-a6639f6d` profile a11y | **RUNNING.** SCR-06 already on `main` at `a49ebd7`. Should no-op. Profile fixtures not edited here |
| `bc-1ed8782f` C7-second | **RUNNING.** Left. Player files may overlap if that slot also picks the sheet; this tip owns tap-pause |
| `bc-22d4f29b` C7-first | **Idle. Landed** `a49ebd7` / `docs/handoff/w20-c7-first.md` (SCR-06). Tap pause was the named remainder it left |

`git diff origin/main -- packages/quality/ .github/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch (`995a213`). L1 sequence is format → lint →
typecheck → check:commits → check:skips → check:audit → check:a11y →
test:coverage → check:coverage → build → guardrails.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| G1.9 commits | `2 new commits vs origin/main, 0 prose, 0 missing-id` |
| G1.10 skips | `238 test files, 0 skips, 0 empty` |
| INF-004 audit | `audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)` |
| QA-010 a11y | `a11y passed (6 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)` |
| Tests + coverage | **3,590 passing** — shared 63, quality 440, config 45, server 1,785, app 1,257. Coverage: global lines 94.37% (17888/18956), branches 90.88%, core 95.70%, **diff lines 86.67% (13/15)** |
| Build | pass — `index-DGRevdWg.js` 367.05 kB / 112.17 kB gzip |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. Test count did not fall (3,583 on `main` after
SCR-06 → 3,590 here; the extra tests are this remainder). jsdom still prints
`HTMLCanvasElement's getContext()` while axe attempts `color-contrast`; that
is incomplete, not a skip.

---

## 6. What is still open

- **Full 交互验收单.** This slice is tap pause only. 倍速 / scrub stay
  plugin-owned (X-26). D9 stays `[ ]` until a device. Sheet is not 全过.
- **X-26 as a P1/P2 write.** This slice does not amend `01-product-scope` or
  inventory. It refuses a client constant.
- **QA-010 remainder screens** after SCR-06 (history, favorites, wallet,
  settings, panels). Not this slice.
- **S-C4.** Required-checks vs GitHub branch protection. S-C3 echo-only already
  on `main`. D-17 still falsifies GitHub reverse-verification.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.
- **`docs/plan/cycle-7-backlog.md`.** Plan-slot file.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named
单击暂停/继续 remainder C7-first left on the sheet.
