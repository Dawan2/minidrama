# W14 — leftover C4: fail-closed watch-progress heartbeats

> **Slot:** W14, work slot. One leftover client gap, no pull request.
> **Branch:** `cursor/w14-work-c4-left-72c4`, cut from `origin/main` at `98e75c6` (G2.5 Trivy
> SCA on main).
> **Item:** remaining fail-closed client gap after named C4 engineering. PlayPage never wrote
> `PUT /v1/progress/episodes/{episodeId}` even though config advertises
> `progressHeartbeatSec: 10` and the server already stores heartbeats. History and picker
> marks had nothing to read.
> **Not in scope:** G2.5 (on main), G2.3 Playwright (`bc-eed03394`, long-running), C4-03
> Postgres, C4-07 VIP, ads Portal ids, Beans, enabling wallet top-up, playback
> `resumePositionSec` still `0` on the session descriptor. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining named items after G2.5 landed:

| Item | State |
| --- | --- |
| C4-01 / C4-02 G2.7 G2.2 G2.6 G2.4 G2.5 | on `main` |
| C4-04 splash / `GET /v1/config` | on `main` |
| C4-05 OAuth stub | on `main` |
| C4-06 trade_order stub | on `main` |
| C4-08 ads | on `main`; `adUnlock` stays false |
| C4-03 T14 Postgres | do not fake |
| C4-07 VIP | no contract; do not invent |
| G2.3 Playwright | in flight (`bc-eed03394`) |
| `bc-d41b8b99` | in flight; files unknown. This slot does not touch L2 |

The assignment: if only AM-blocked items remain, implement a remaining fail-closed client gap
(not ads Portal ids, not Beans). D-16's handoff left watch-progress heartbeats out of scope.
`GET /v1/config` now names the interval; PlayPage still never called the write.

---

## 2. What changed

`PUT /v1/progress/episodes/{episodeId}` is the heartbeat and the exit flush. The body is
`{ positionSec, durationSec, clientUpdatedAt }` — integers, floored from the player
observation. Extra keys (`completed`, Beans, unlock) are dropped. A float, a zero duration,
or a missing timestamp is `MALFORMED` and does not hit the network.

The beat runs only while playing (`INV-P5`). Pause, ended, error, unmount, and
`visibility: hidden` / `pagehide` flush the latest observation (`AC-PL-8`). A `timeupdate`
with only `currentTime` is dropped — that is the existing facade fixture, and inventing a
duration would be a guessed watch. `401 AUTH_REQUIRED` stops further writes for that
instance: no anonymous row.

`HttpWriter.send` may carry a JSON body so the progress `PUT` is still a 204 with no
`json()` on success (same as favourites). Favourite writes still omit the body.

| File | Change |
| --- | --- |
| `app/src/data/http.ts` | Optional JSON body on idempotent `send` |
| `app/src/data/progress-api.ts` | `reportEpisodeProgress`; wire-shape strip |
| `app/src/player/progress-heartbeat.ts` | Throttle / flush / halt |
| `app/src/player/PlayerSurface.tsx` | Subscribes the player; disposes on teardown |
| `app/src/routes/PlayPage.tsx` | Passes config interval + progress write |
| `app/src/player/mock-veplayer.ts` | `tick(position, duration)` |

Playback sessions still issue `resumePositionSec: 0`. Wiring that read is a later slot;
this one only starts writing. D5 / D6 / D7 stay `[ ]`. Wallet top-up stays disabled.

---

## 3. Reverse verification

Against a timeupdate that has no duration:

```
FAIL  does not invent a duration for a timeupdate that only has currentTime
expected report to have been called
```

Against a pause after 3 s of play:

```
FAIL  flushes on pause so a short watch is not lost
expected [{ episodeId: 'ep_1', positionSec: 3 }]
```

A stuffed `{ completed: true, beans: 50 }` still PUTs only the three contract fields.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| G2.5 (`98e75c6`) | Already on `main` at pick. Not retaken |
| `bc-eed03394` (subsequent C4, long-running) | G2.3-shaped. This slot does not touch `.github/workflows/` |
| `bc-d41b8b99` (more C4 backlog) | Running at pick. No `cursor/*` heartbeat branch on origin. This slot's files are progress write + PlayPage |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on `107cfa6`. L1 sequence unchanged: format → lint → typecheck →
test:coverage → check:coverage → build → guardrails.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 61 |
| `packages/config` | 45 |
| `packages/quality` | 144 |
| `server` | 1,734 |
| `app` | 1,113 |
| **Total** | **3,097** |

Zero skipped. Coverage gate:

```
coverage global lines 93.83% (14454/15404), branches 91.63%, core lines 95.50%, diff lines 93.09% (256/275)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-m61o31n9.js` 353.37 kB / 108.03 kB gzip).

---

## 6. Left open

- **Playback `resumePositionSec`.** Sessions still start at 0. The write now exists; the
  session read does not consume it.
- **G2.3, CodeQL.** Playwright smoke, CodeQL half of G2.4. Left for `bc-eed03394` / later
  L2 slices. Not faked with a grep.
- **C4-03, C4-07.** Postgres, VIP. Beans/VIP/recharge stay AM-blocked.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
