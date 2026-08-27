# W14 — D-16: PlayPage mints a playback session

> **Slot:** W14, work slot (`bc-e3b0fe5e`). One defect, no pull request.
> **Branch:** `cursor/w14-work-d16-playback-72c4`, cut from `origin/main` at `4e6ad31` and later
> merged forward onto `51f8d88` (C4-01 G1.5 / C4-02 G2.7).
> **Item:** D-16 from `docs/verify/cycle-3-report.md` — wire `PlayPage` to
> `POST /v1/playback/sessions` so a locked episode cannot play a demo album.
> **Not in scope:** gesture 切集 / autoplay-on-ended, watch-progress heartbeats, prefetch of the
> next entitled descriptor, changing PNL-01 locked cells into destinations, Beans, GATE-8. No
> pull request.

---

## 1. The gap

C3's second exit is that a locked episode is refused at 连播, 深链, and 切集 by the **server**.
The server already answers `POST /v1/playback/sessions` with a 201 VePlayer descriptor or
`403 EPISODE_LOCKED`. The client never called it. `PlayPage` built a six-item `ep_demo_*` /
`vid_demo_*` album in `useMemo(demoPlaylist)` and played that regardless of the route id.
Picker cells and unlock-success links navigated to real catalogue ids; the retained instance
still played the demo.

X-19 / correction A4 still hold: the session body is identifiers, never a media URL, and the
surface still has no native `<video>`.

---

## 2. What changed

| File | Change |
| --- | --- |
| `app/src/data/playback-api.ts` | New. `POST /v1/playback/sessions` with `{ episodeId }` only. A 201 is narrowed to a descriptor; a URL-shaped key or value is `MALFORMED`. `isPlaybackLock` names the overlay codes |
| `app/src/data/playback-api-context.tsx` | New. No default client — a default that minted `ep_demo_*` is the defect |
| `app/src/routes/PlayPage.tsx` | Session per **route** episode id. 403 lock / VIP / anonymous paid → existing `UnlockPanel`. Any other failure → retryable or terminal, no player. Next link comes from the catalogue, including a locked neighbour. `demoPlaylist` is gone |
| `app/src/main.tsx`, `app/src/testing/render.tsx` | Seventh API client, provided the same way as wallet / progress |
| `app/src/testing/playback-fixtures.ts` | Default stub issues a descriptor for the asked id, so a test that forgets playback still does not get a demo album |
| `app/src/testing/import-hygiene.test.ts` | Product source may not name `demoPlaylist` / `ep_demo_` / `vid_demo_` / `album_demo_` |

The three entries all change `#/play/:episodeId`, so they all mint (or are refused) for that id:

- **深链** — the route episode is the session argument.
- **连播** — "Next episode" is the next catalogue id, even if locked; the new route sessions it.
- **切集** — a playable picker cell is already a `replace` link; PlayPage sessions the destination.
  Locked picker cells stay non-links (J16 / PNL-01). A stale `viewerAccess` that still navigates
  is caught when the session returns 403.

VePlayer is built only from a successful descriptor. Playlist is that one descriptor. Switching
episodes rebuilds the instance, because a second session is a new authorization, not a walk
through a client-built album.

`app/src/data/` is gitignored as `data/` (sqlite). New files there are `git add -f`, same as the
other API clients.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 `demoPlaylist` restored in `PlayPage.tsx`

The old six-item album, plus `void demoPlaylist` so it is not unused, was inserted above the
session wiring.

```
FAIL  src/routes/PlayPage.test.tsx > the demo album does not ship > is absent from PlayPage production source
AssertionError: expected '…' not to match /demoPlaylist/

FAIL  src/testing/import-hygiene.test.ts > the player does not ship a demo album
expected [ 'src/routes/PlayPage.tsx:35 const DEMO_ALBUM_ID = …', … ] to deeply equal []
```

The behavioural tests still passed, because the session path was left in place. The scan is
what fails a fallback album that nobody calls.

### 3.2 A 403 that still mounts VePlayer

Covered in `PlayPage.test.tsx`: a locked deep link and a locked 连播 both assert
`MockVePlayer.instances` is empty, `player-container` is absent, and `unlock-panel` is present.
A `create` that always returns 201 would fail those.

### 3.3 A 201 with `playUrl`

`playback-api.test.ts` rejects `{ …descriptor, playUrl: 'https://cdn.example/a.m3u8' }` as
`MALFORMED`. PlayPage then fail-closes (retryable), so the URL never reaches VePlayer.

---

## 4. In-flight compose

C4 engineering named as `bc-a38390dc` and `bc-2aa04a65` was not readable from this run's agent
list. Their work is on `main` as C4-01 (G1.5 coverage, `workflow_dispatch:`, D-07) and C4-02
(L2 G2.7 migrate). They touch `app/package.json` / `app/vite.config.ts` for coverage collection,
not PlayPage. Merged at `e1ab7e7` with no overlap.

---

## 5. Verify

`pnpm verify` exited 0 on this branch after the main merge.

| Gate | Result |
| --- | --- |
| Format | pass |
| Lint | pass |
| Types | pass, 5 packages |
| Tests + coverage | **2,759 passing** — `shared` 55, `config` 45, `quality` 67, `server` 1,604, `app` 988. Coverage gate: global lines 94.13%, branches 92.35%, core 98.07%, **diff lines 90.23%** (277/307) |
| Build | pass — `index-CoPOG7uw.js` 340.74 kB / 103.71 kB gzip |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

Native `<video>` remains absent from app production source. The mock player still renders a
`div`. No media URL is accepted from the session API.

---

## 6. What is still open

- **Prefetch of the next entitled descriptor.** `upNext` on the facade still exists; this slot
  mints only the route episode so a lock cannot be authorised early.
- **Auto-advance / gesture 切集.** Still a link, not `playNext()` on ended. Protocol-C4.
- **PNL-02 on a locked picker cell.** Locked cells are still marks, not purchases. A lock reached
  by 连播 or 深链 opens the overlay on the player.
- **D-17** GitHub Actions billing. Local verify cannot be corroborated from CI.
- **C3-08 / C3-09 / GATE-7 / GATE-8** unchanged.
