# W16 — protocol-C4 exit 1: autoplay / swipe 切集 `playNext` on the retained instance

> **Slot:** W16, work slot (`bc-2fd6c885`). One protocol-C4 remainder, no pull request.
> **Branch:** `cursor/w16-work-playback-ux-72c4`, cut from `origin/main` at `5ab02d1`
> (G2.3 Playwright smoke). Merged forward onto `33f347b` (C5 plan + HOME continue UI).
> Composed `origin/cursor/w16-work-playback-ux2-72c4` (PRG-001 pre-seek hold) because that
> sibling also edited `PlayPage` / `PlayerSurface`.
> **Item:** highest unblocked protocol-C4 **播放体验** exit — `wave-protocol.md` §5.1 first
> row, `PLY-010` / `01-product-scope` §4.3: `ended` and swipe 切集 mint
> `POST /v1/playback/sessions` *before* VePlayer moves. Entitled immediate next is
> `enqueueNext` + `playNext` on the retained instance (`AC-PL-3`). Locked next holds the
> final frame and opens PNL-02 (`AC-PL-5`).
> **Not in scope:** G2.3, D-17 billing, C4-03 Postgres, C4-07 VIP, HOME continue rail
> (`bc-fb69d154`, already on `main`), cycle-5 plan docs (`bc-e8f91fa2`), PNL-05 / 倍速
> (VePlayer plugins, `AC-PL-6`), double-tap like, BytePlus vids. No pull request.

---

## 1. Why this was the pick

`docs/verify/cycle-4-report.md` scored protocol-C4 **0/3**:

| Exit | On `5ab02d1` | This slot |
|---|---|---|
| 交互验收单 (`01-product-scope` §4.3) | Not met. 连播/切集 were session *gates*, not `playNext` on `ended` | **This pick.** Slice: autoplay + swipe + retained `playNext` |
| 跨端进度冲突 | Heartbeats + resume + HOME rail; conflict *use case* absent | Sibling `bc-3c74c2c9` / composed in |
| a11y 门禁 | Not started | Left for `bc-5d32d64f` |

W14 `playnext-lock` named autoplay-on-ended / gesture 切集 as still protocol-C4. D-17 and G2.3
were forbidden. C4-03 / C4-07 skipped. HOME continue UI was in flight then landed; this slot
did not retake `HomePage.tsx`.

---

## 2. What changed

| File | Change |
|---|---|
| `app/src/routes/advance-gate.ts` | Entitled result carries the descriptor, so PlayPage can `playNext` instead of discarding it |
| `app/src/player/player-facade.ts` | `enqueueNext` appends the immediate next entitled descriptor and updates `setPreloadList` |
| `app/src/player/mock-veplayer.ts` | `setPreloadList` keeps the *current* index, so extending the queue after `playNext` does not rewind |
| `app/src/player/PlayerSurface.tsx` | `onEnded`, swipe up/down, `enqueueNext` handle. Playlist is a ref at construct so appending next does not destroy the instance. Heartbeat gets session `resumePositionSec` (composed) |
| `app/src/player/episode-swipe.ts` | Vertical-swipe threshold. Below it is a tap (VePlayer-owned) |
| `app/src/routes/PlayPage.tsx` | `ended` / next / swipe-up → `gateAdvance`. Entitled neighbour: `enqueueNext` then `replace`. Lock: overlay, current instance lives. Swipe-down rebuilds (`playNext` cannot go backwards) |
| `app/src/styles/app.css` | `touch-action: none` on the surface so vertical 切集 is ours |
| `server/src/modules/progress/cross-end-conflict.test.ts` | From ux2. Stale report 204; resume / history / session still the winner. Fixture `vid`s only |

Playable picker cells remain `replace` links (D-16). Adjacent entitled 连播 is `playNext`; a jump
still rebuilds.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 `ended` does not call `gateAdvance`

The entitled-next test emits `ended` and asserts the same instance `playNextCount === 1` and
`currentEpisodeId` is the neighbour. Restoring a no-op `onEnded` leaves the route on episode 1.

### 3.2 Entitled 连播 navigates without `enqueueNext`

`config.episodeId` stays the constructed episode; `currentEpisodeId` must move. A teardown that
builds a second instance fails `destroyed === false` and `instances.filter(live).length === 1`.

### 3.3 Locked next on `ended` advances VePlayer

`AC-PL-5`: overlay, route stays, `playNextCount === 0`, no `vid_demo_`.

---

## 4. In-flight compose

| Who | Overlap |
|---|---|
| `bc-fb69d154` HOME continue UI | **Landed** `7ecca77` / `33f347b`. `HomePage.tsx` not edited here |
| `bc-e8f91fa2` C5 plan | **Landed** `docs/plan/cycle-5-backlog.md`. Ranked 播放体验 0/3, did not open it. Not rewritten |
| `bc-3c74c2c9` second exit (PRG-001) | **Composed.** `PlayerSurface` / `PlayPage` / heartbeat pre-seek lock / `cross-end-conflict.test.ts` |
| `bc-5d32d64f` third exit (a11y) | Running. This slot does not add axe-core |

G2.3 stays the L2 `smoke` job. D-17 is still billing. No BytePlus ingest ids.

---

## 5. Verify

`pnpm verify` exited 0 after merging `origin/main` (`33f347b`) and composing
`cursor/w16-work-playback-ux2-72c4`.

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| Tests + coverage | **3,293 passing** — shared 61, quality 282, config 45, server 1,755, app 1,150. Coverage: global lines 94.07%, branches 91.26%, core 95.50%, **diff lines 91.24% (302/331)** |
| Build | pass — `index-B-Efb-vk.js` 356.59 kB / 109.02 kB gzip |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent. No demo album identifiers in product source.

---

## 6. What is still open

- **Full 交互验收单.** 倍速 / definition stay plugin-owned (PNL-05 deleted, X-26). Double-tap like
  is still postable (`01-product-scope` §7). Progress-bar drag is plugin-owned.
- **a11y 门禁** (`QA-011` / `QA-010`). Not this slot.
- **D-17** GitHub Actions billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **Playable picker 切集** of a non-adjacent cell still rebuilds (correct: `playNext` only
  goes forwards). Adjacent entitled picker cells are still route links, not `playNext`.

This slice does **not** claim protocol-C4 exit 1 closed. It is the named remainder W14 left
(autoplay-on-ended / gesture 切集) plus retained-instance `playNext` for the immediate neighbour.
