# W16 — leftover C5 after like-gesture: PLAYER_FATAL silent re-issue

> **Slot:** W16, work slot (`bc-264077b7`). One leftover item, no pull request.
> **Branch:** `cursor/w16-work-c5-after-like-72c4`, cut from `origin/main` at **`764fa8e`**
> (double-tap 点赞 on main). Merged forward onto **`a8e1c63`** (G1.9 tracker-id half
> landed while this slot ran).
> **Item:** **PLY-012** — 播放令牌过期静默换发与续播. VePlayer `error` re-mints
> `POST /v1/playback/sessions` once for the route episode and applies the fresh descriptor
> on the retained instance. A failed mint overlays retry copy on the last frame.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, G1.9 (`bc-89fef1d3` /
> `bc-72e30448`, landed at `a8e1c63`), double-tap 点赞 (on main), 倍速 / `playbackRate`
> (X-26, plugin-owned), axe-core, `#/vip`. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-5-backlog.md` remaining unblocked engineering after skipping D-17,
C4-03, and C4-07, and after in-flight / landed C5 slices:

| Item | State at pick |
| --- | --- |
| D-17 GitHub Actions billing | Rank 1. **Not a branch.** Skipped |
| Double-tap 点赞 (`PUT favorite`) | **On `main`** at `764fa8e` (`bc-8416a6dd`). Not retaken |
| G1.9 Conventional Commits | **RUNNING** at pick (`bc-89fef1d3`, `bc-72e30448`). Left. **Landed** `a8e1c63` while this slot ran |
| C5-01 / D-20 G1.10 | **On `main`**. G1.7 dated as G2.5 |
| C5-02 / D-18 wallet transactions | **On `main`** |
| C4-03 T14/T16/T15 | Do not fake. Skipped |
| C4-07 SCR-11 / D8 | No contract. Skipped |
| C5-03 / D-19 `wave-protocol.md` §6.2 | P3's file |
| 倍速 / axe-core as leftover | Forbidden by the C5 plan rank-2 close |
| **PLY-012 token re-issue** | **This slot.** Named remainder: no play-token refresh path in product source |

Tap pause/resume is VePlayer-owned (`AC-PL-6`). Scrub and 倍速 are plugin-owned (X-26).
CN-8's timer re-sign is superseded. This is CN-7's retry-once discipline: the ERROR
payload is undocumented, so classification is the re-issued session
(`docs/design/playback-contract.md` §5.2).

---

## 2. What changed

A VePlayer `error` on the live surface asks PlayPage to mint the **route** episode
again. The first mint is silent. The second fatal after that mint already ran is the
give-up overlay, not a third POST.

| Re-issue answer | What the user sees |
| --- | --- |
| 201 | Same instance, new `playAuthToken` / identifiers, no `playNext`, no seek, no overlay |
| 403 / 401 commercial lock | Unlock panel on the current episode; last frame stays |
| 409 | Terminal "unavailable right now"; no retry, no price; last frame stays |
| 5xx / transport | Retryable overlay; last frame stays |
| Second fatal | Retryable overlay; no third mint |

`resumePositionSec` on the fresh body is ignored. Seeking to it would jump the kernel
that already holds the position.

| File | Change |
| --- | --- |
| `app/src/player/player-fatal.ts` | Plan + classify |
| `app/src/player/player-facade.ts` | `reissue` — same episode, no `playNext` |
| `app/src/player/PlayerSurface.tsx` | `error` → `onPlayerFatal`; handle `reissue` |
| `app/src/routes/PlayPage.tsx` | Silent mint; overlay on the last frame |
| `app/src/core/i18n/locales/en.json` / `ar.json` | `player.blocked` |
| `app/src/styles/app.css` | `.player-fatal` |

`docs/plan/cycle-5-backlog.md` is not rewritten. `.github/` and `packages/quality/` are
untouched by this slot (G1.9 landed from `origin/main`). Wallet top-up stays disabled.
`adUnlock` stays false. No BytePlus `vid`.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 `error` does not call `createSession`

```
FAIL  re-mints the route episode and keeps the instance
AssertionError: expected [ 'ep_test_0001' ] to deeply equal [ 'ep_test_0001', 'ep_test_0001' ]
```

### 3.2 A 503 unmounts VePlayer

```
FAIL  keeps the last frame and shows retry when the silent mint fails
expected null not to be null  (player-container)
```

### 3.3 A second fatal after a 201 posts a third session

```
FAIL  does not mint a third session after the silent attempt was already used
expected [ 'ep_test_0001', 'ep_test_0001', 'ep_test_0001' ] to have a length of 2
```

---

## 4. In-flight overlap

| Who | Overlap |
| --- | --- |
| `bc-8416a6dd` leftover C5 / double-tap | **Idle. Landed** `764fa8e`. Gesture files kept; this slot adds `error` / `reissue` next to them |
| `bc-89fef1d3` / `bc-72e30448` G1.9 | **Idle. Landed** `a8e1c63`. `ci.yml` / `commits.ts` not edited here. This slot's unique commit is `feat(ply-012):` so the new gate stays green |
| Playback UX siblings | **Idle. Landed.** Swipe / autoplay / cross-end / drama-detail Continue kept |

`git diff origin/main -- .github/ packages/quality/` is empty of this slot's work.

---

## 5. Verify

`pnpm verify` exited 0 on this branch at `271408f` after absorbing `origin/main` (`a8e1c63`).
L1 sequence is now format → lint → typecheck → **check:commits** → check:skips →
test:coverage → check:coverage → build → guardrails.

| Package | Tests |
| --- | ---: |
| shared | 63 |
| quality | 347 |
| config | 45 |
| server | 1,785 |
| app | 1,196 |
| **Total** | **3,436** |

```
commits passed (1 new commits vs origin/main, 0 prose, 0 missing-id)
skip-check passed (227 test files, 0 skips, 0 empty)
coverage global lines 94.19% (16835/17873), branches 91.02%, core lines 95.70%, diff lines 86.89% (159/183)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-CUut56eC.js` 360.61 kB / 110.26 kB gzip).

Native `<video>` remains absent. No demo album identifiers in product source. Test count
did not fall (3,382 on `main` after double-tap + G1.9 quality tests → 3,436 here; the extra
app tests are the re-issue slice).

The unique commit was restaged as `feat(ply-012):` after G1.9 landed. History on `main`
was not rewritten.

---

## 6. What is still open

- **QA-011 / QA-010** a11y. Still not started. Do not add axe-core as a leftover.
- **Tap pause / scrub / 倍速.** Plugin-owned or VePlayer-owned. Do not add competing controls.
- **`POST /v1/playback/sessions/{id}/failures`.** The report path in the playback contract.
  Not this slice; no invented endpoint.
- **D-17.** Billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19.** P3 writeback of `wave-protocol.md` §6.2.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named 令牌换发 remainder.
