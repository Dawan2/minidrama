# W14 — client resume seek: VePlayer starts at session `resumePositionSec`

> **Slot:** W14, work slot. One leftover client gap, no pull request.
> **Branch:** `cursor/w14-work-resume-seek-72c4`, cut from `origin/main` at `1f6ca13`
> (playback sessions already copy watch progress into `resumePositionSec`). Merged
> forward onto `67d063f` (G1.8 Gitleaks).
> **Item:** PlayPage / VePlayer seek at the session `resumePositionSec`. Omitted or `0`
> starts at the beginning. Catalog `durationSec` is not a start time. A 403 never
> constructs the player.
> **Not in scope:** G2.3 Playwright (`bc-9578758f`). No-ads / G1.8 (`bc-f81b2f9f`,
> landed as `67d063f` while this slot ran). C4-03 Postgres. C4-07 VIP. Beans, enabling
> wallet top-up, inventing ad-unit ids. No pull request.

---

## 1. What was picked, and why

`POST /v1/playback/sessions` now returns `resumePositionSec` from the heartbeat store
(`07c1a4b` / `1f6ca13`). The player facade already forwarded that field as VePlayer
`startTime`, but:

- the wire narrower treated a missing field as `MALFORMED`, so the player never
  started instead of starting at 0
- PlayPage had no proof that a 201 with a non-zero resume reached `startTime`
- catalog `durationSec` (95 in fixtures) was an available number nobody was forbidden
  from using as a seek

The assignment: wire PlayPage / VePlayer to that value; fail-closed if missing (start
at 0 only if the API omitted or sent 0); do not invent duration; do not seek on 403.
If the client already applied it, take the next unblocked C4 item that is not G2.3 and
not the no-ads slot. The client did not fully apply it. This slot closes that gap.

| Item | State |
| --- | --- |
| C4-01 / C4-02 G2.7 G2.2 G2.6 G2.4 Semgrep / CodeQL / G2.5 | on `main` |
| C4-04 splash / `GET /v1/config` | on `main` |
| C4-05 OAuth stub | on `main` |
| C4-06 trade_order stub | on `main` |
| C4-08 ads | on `main`; `adUnlock` stays false |
| After-CodeQL resume (`bc-e2805d2b`) | on `main` as `1f6ca13`. Server half. This slot is the client half |
| G2.3 Playwright | in flight (`bc-9578758f`). Not this slot |
| G1.8 secrets | in flight at pick (`bc-f81b2f9f` / `cursor/w14-work-c4-noads-72c4`); landed as `67d063f` |
| C4-03 T14 Postgres | do not fake |
| C4-07 VIP | no contract; do not invent |

---

## 2. What changed

`resumeStartTime` is the fail-closed mapping used when narrowing
`POST /v1/playback/sessions`:

| Wire `resumePositionSec` | Result |
| --- | --- |
| omitted | `0`, player starts at the beginning |
| `0` | `0` |
| non-negative finite number | that number, as VePlayer `startTime` |
| negative / NaN / Infinity / string / `null` / `{ durationSec }` | descriptor refused (`MALFORMED`). Not a guessed duration |

PlayPage still does not start VePlayer without a 201 descriptor. A 403
(`EPISODE_LOCKED` / `EPISODE_VIP_REQUIRED`) still opens PNL-02 and constructs zero
players, so `startTime` is never applied.

`createPlayerFacade` still sets `startTime: descriptor.resumePositionSec`. The comment
now names the two things it must not become: catalog duration, and a lock.

| File | Change |
| --- | --- |
| `app/src/data/playback-api.ts` | `resumeStartTime`; omitted resume is 0, not MALFORMED |
| `app/src/data/playback-api.test.ts` | omitted / present / 0 / invalid / duration-shaped refuse |
| `app/src/player/player-facade.ts` | Comment: session resume only |
| `app/src/player/player-facade.test.ts` | `startTime` 42 and `startTime` 0 |
| `app/src/routes/PlayPage.tsx` | Comment: omitted/0 start at 0; 403 does not seek |
| `app/src/routes/PlayPage.test.tsx` | 45 vs catalog 90; 0 stays 0; 403 has no `startTime` |

Heartbeat files (`progress-heartbeat.ts`) are not retaken. A `timeupdate` without
duration is still not a watch. This slot does not invent one to seek with.

`docs/11-official-onboarding-checklist.md` is untouched. Wallet top-up stays disabled.
`.github/workflows/` is unchanged by this slot (G1.8 arrived from `origin/main`).

---

## 3. Reverse verification

Against a 201 whose body has no `resumePositionSec` and a catalogue duration of 90:

```
FAIL  starts at 0 when the session omitted resumePositionSec, rather than inventing duration
expected { resumePositionSec: 90 }
```

(the assertion is `toEqual(ok(playbackDescriptor({ resumePositionSec: 0 })))`.)

Against PlayPage with session resume `45` and catalog `durationSec: 90`:

```
FAIL  starts VePlayer at the session resume, not at catalog duration
expected 90, received 45
```

(the assertion is `toBe(45)` and `not.toBe(90)`.)

Against a 403 lock:

```
FAIL  does not start the player
expected [45] to deeply equal []
```

(`MockVePlayer.instances` stays empty; `startTime` is never applied.)

A stuffed `{ durationSec: 90 }` as `resumePositionSec` is `null` from `resumeStartTime`,
not 90.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| After-CodeQL (`1f6ca13`) | Already on `main` at pick. Server `resumeFromProgress`. This slot does not edit `server/` |
| G1.8 (`bc-f81b2f9f` / `cursor/w14-work-c4-noads-72c4`) | **Landed.** `67d063f`. `ci.yml` Gitleaks, `packages/quality/src/secrets*`. Merged in; no overlap with playback-api / PlayPage / player-facade |
| G2.3 (`bc-9578758f`) | Playwright / `l2.yml`. This slot does not touch `.github/workflows/` |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`67d063f` G1.8).
L1 sequence unchanged: format → lint → typecheck → test:coverage → check:coverage →
build → guardrails. G1.8 `check:secrets` stays in `ci.yml`, not in `pnpm verify`.

| Package | Tests |
| --- | ---: |
| shared | 61 |
| quality | 220 |
| config | 45 |
| server | 1,740 |
| app | 1,121 |
| **Total** | **3,187** |

Zero skipped. Coverage gate:

```
coverage global lines 94.00% (15043/16003), branches 91.60%, core lines 95.50%, diff lines 100.00% (11/11)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DMmaAoAe.js` 353.43 kB / 108.04 kB gzip).
Native `<video>` remains absent.

---

## 6. Left open

- **G2.3 Playwright.** Left for `bc-9578758f`. Not faked with a grep.
- **`play_auth_token` for TikTok clients below 44.5.0.** Still deferred (W10).
- **Continue-watching feed rail.** Still a discovery concern, not a session field.
- **C4-03 / C4-07.** Postgres, VIP contract. Unchanged.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
