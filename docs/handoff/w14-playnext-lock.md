# W14 — 连播 / 切集 mint the *next* episode before VePlayer advances

> **Slot:** W14, work slot (`bc-35dcf4b9`). One remainder of C3's second exit, no pull request.
> **Branch:** `cursor/w14-work-playnext-lock-72c4`, cut from `origin/main` at `9159974` (G2.2
> sqlite integration on L2, D-07 handoff already on main).
> **Item:** remaining C3 exit after D-16 (`4427d45`) — **连播 / 切集** must mint
> `POST /v1/playback/sessions` for the *next* episode. `403` → unlock overlay on the episode
> that is already playing. VePlayer is never given a demo album.
> **Not in scope:** autoplay-on-ended / gesture 切集 (still protocol-C4), prefetch of the next
> *entitled* descriptor into `upNext`, Beans, GATE-8, C4-04 splash, D-07. No pull request.

---

## 1. Why this was not skipped

D-16 wired the **route** episode: 深链, and 连播/切集 that *navigate first*, mint
`POST /v1/playback/sessions` for whatever `#/play/:episodeId` named. That already stops a demo
album on a locked deep link.

What it left open:

- **连播** was a `replace` `<Link>`. A locked neighbour destroyed the current player, then showed
  the overlay on an empty wall (`data-state=locked`). `AC-PL-5` asks to hold the final frame.
- **切集** of a commercially locked picker cell was a `<span>`. The server was never asked. C3's
  exit is server intercept at all three entries.

Playable picker cells still session-mint via the route (D-16). This slot does not turn them into
destinations they already are, and does not prefetch an entitled next descriptor (`upNext`).

C4-01 / D-07 (`bc-1f0c1f6d`) and C4-02 / G2.2 (`bc-0b570e4b`) were already on `main`. This is
not a C4 client remainder.

---

## 2. What changed

| File | Change |
| --- | --- |
| `app/src/routes/advance-gate.ts` | `gateAdvance`: `POST /v1/playback/sessions` for the *target* id. `201` → entitled; lock codes / `401 AUTH_REQUIRED` → `LOCKED`; anything else → `REFUSED` (stay, no demo) |
| `app/src/routes/PlayPage.tsx` | Next is a button. A lock keeps the current route and player and opens PNL-02 for the *next* catalogue episode. Entitled 连播 then `replace`-navigates; the new route mints again for VePlayer |
| `app/src/picker/EpisodePicker.tsx` | Commercially locked cells (`UNLOCK` / `SUBSCRIBE`) are attempt buttons when the player passed `onLockedAttempt`. Still not `<a>`s (J16). `UNAVAILABLE` / `PURCHASE_BLOCKED` stay marks |
| `app/src/styles/app.css` | Button reset for `.player-next` and `button.episode-picker__cell` |

A stale playable picker cell (catalogue says `PLAY`, session says 403) still navigates, and
D-16's route session opens the overlay. That path is tested so a client-side lock mark cannot
be the only gate.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 Next is a `Link` to the locked neighbour again

The 连播 test asserts the route episode id **stays** the free one, the live VePlayer instance is
not destroyed, and its `episodeId` / `vid` do not match `ep_demo_` / `vid_demo_`. Navigating
first fails all three.

### 3.2 A locked picker cell is a destination `<a>`

```
FAIL  src/routes/PlayPage.test.tsx > locked episodes are intercepted at every entry > sessions a locked 切集 target without advancing VePlayer onto a demo album
expected 'A' not to be 'A'
```

And the player would unmount. J16 is the reason it is a button that asks the server.

### 3.3 `gateAdvance` treats 403 as entitled

`advance-gate.test.ts` fails on `EPISODE_LOCKED` / `EPISODE_VIP_REQUIRED`. PlayPage would
navigate; D-16 would still overlay after teardown, and the new 连播 assertion that the current
instance survived would fail.

---

## 4. In-flight compose

| Who | Overlap |
| --- | --- |
| D-16 (`bc-e3b0fe5e`, `4427d45`) | Predecessor. Route-episode mint kept. This slot adds the *next*-episode gate |
| C4-01 / D-07 (`bc-1f0c1f6d`) | On `main` as `08e18ca` / `docs/handoff/w14-d07.md`. Not retaken |
| C4-02 G2.2 (`9159974`) | L2 sqlite integration. No overlap |
| `origin/cursor/w13-work-c3-remain-72c4` | Unmerged wallet-transactions. Not rewritten |

`git diff origin/main -- .github/workflows/ci.yml` is empty.

---

## 5. Verify

`pnpm verify` exited 0 on this branch at `6de53bf`.

| Gate | Result |
| --- | --- |
| Format | pass |
| Lint | pass |
| Types | pass, 5 packages |
| Tests + coverage | **2,791 passing** — `shared` 55, `config` 45, `quality` 67, `server` 1,627, `app` 997. Coverage gate: global lines 93.93%, branches 92.06%, core 98.07%, **diff lines 96.77%** (90/93) |
| Build | pass — `index-2Tmvm371.js` 341.72 kB / 103.97 kB gzip |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent from app production source. Demo-album identifiers remain banned
in product source. No media URL is accepted from the session API.

---

## 6. What is still open

- **Prefetch of the next entitled descriptor.** `upNext` on the facade still exists; a 201 for
  the next id is used only to *allow a route change*, then the new route mints again. A lock is
  never authorised onto VePlayer.
- **Auto-advance / gesture 切集.** Still not `playNext()` on `ended`. Protocol-C4.
- **PNL-02 purchase on the picker itself.** The cell is an attempt; the overlay still lives on
  the player.
- **D-17** GitHub Actions billing. Local verify cannot be corroborated from CI.
- **C3-08 / C3-09 / GATE-7 / GATE-8** unchanged.
- **C4-04 SCR-01.** `GET /config` is still design-only. Not invented here.
