# W14 — C4 after CodeQL: playback sessions resume from watch progress

> **Slot:** W14, work slot. One leftover server gap, no pull request.
> **Branch:** `cursor/w14-work-c4-after-ql-72c4`, cut from `origin/main` at `7fb19ba`
> (G2.4 CodeQL on main) and merged forward onto `69fb33c` (leftover C4 heartbeats).
> **Item:** `POST /v1/playback/sessions` now copies the viewer's stored heartbeat into
> `resumePositionSec`. The player already forwards that field as VePlayer `startTime`.
> **Not in scope:** CodeQL / G2.4 / G2.5 (on main). G2.3 Playwright (`bc-9578758f`, in
> flight). G1.8 secrets (`cursor/w14-work-c4-noads-72c4`). Subsequent C4 ads branch
> (`bc-eed03394` / `cursor/w14-work-c4-subseq-72c4`). C4-03 Postgres. C4-07 VIP. Beans,
> enabling wallet top-up, inventing ad-unit ids. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after CodeQL landed, skipping
items this assignment named:

| Item | State |
| --- | --- |
| C4-01 / C4-02 G2.7 G2.2 G2.6 G2.4 Semgrep / CodeQL / G2.5 | on `main` |
| C4-04 splash / `GET /v1/config` | on `main` |
| C4-05 OAuth stub | on `main` |
| C4-06 trade_order stub | on `main` |
| C4-08 ads | on `main`; `adUnlock` stays false |
| Leftover C4 heartbeats (`bc-b0719814`) | landed as `69fb33c` while this slot read the tree |
| G2.3 Playwright | in flight (`bc-9578758f`). Not this slot |
| G1.8 secrets | in flight on `cursor/w14-work-c4-noads-72c4` |
| Subsequent C4 (`bc-eed03394`) | ads files on `cursor/w14-work-c4-subseq-72c4`; avoided |
| C4-03 T14 Postgres | do not fake |
| C4-07 VIP | no contract; do not invent |

The leftover heartbeat slot wrote `PUT /v1/progress/episodes/{episodeId}` and left
`resumePositionSec: 0` on the session descriptor. The route comment said that field
"belongs to watch progress and is `0` until that lands." It has landed. The client
`player-facade` already sets `startTime: descriptor.resumePositionSec`.

---

## 2. What changed

After entitlement allows play and the media port names a `vid`, the route reads the same
`WatchProgressStore` the heartbeat writes. The descriptor's `resumePositionSec` is:

| Situation | `resumePositionSec` |
| --- | ---: |
| Signed-in viewer with a stored integer ≥ 0 | that `positionSec` |
| No row | `0` |
| Anonymous | `0`, and the store is not consulted |
| Stored value not a non-negative integer | `0`, not forwarded into VePlayer |
| Completed row | the stored position, not an invented restart |
| Another viewer's row for the same episode | unreachable; the key is `(userId, episodeId)` |
| Commercial denial | store is not read (same ordering as the media port) |

`buildApp` creates one progress store before registering playback, then hands that instance
to progress / drama-progress / history. A second map would resume from a table the player
was not writing.

| File | Change |
| --- | --- |
| `server/src/modules/playback/routes.ts` | `progressStore`; `resumeFromProgress` after the gate |
| `server/src/app.ts` | One store, created before playback registration |
| `server/src/modules/playback/routes.test.ts` | Resume, leak, completed, bad integer, anonymous, denial |

The client is unchanged. `player-facade` already resumes from the descriptor. Heartbeat
files (`progress-heartbeat.ts`, `PlayPage.tsx`) are not retaken.

`docs/11-official-onboarding-checklist.md` is untouched. Wallet top-up stays disabled.
`.github/workflows/` is unchanged.

---

## 3. Reverse verification

Against a signed-in session whose store holds another viewer's `80`:

```
FAIL  does not leak another viewer's position onto this session
expected 80, received 0
```

(the assertion is `toBe(0)` — a leak fails by returning `80`.)

Against a locked episode whose store holds `12`:

```
FAIL  never reads progress for an episode it is about to refuse
expected [] to deeply equal [ 'usr_fx_newcomer\u0000ep_fx_s2e01' ]
```

Against a `timeupdate` duration this slot does not own: leftover C4 already fails a
heartbeat that invents one. This slot does not re-open that file.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| Leftover C4 (`bc-b0719814`) | **Landed.** Client heartbeat files. This slot reads the store they write; it does not edit `PlayPage` / `progress-heartbeat.ts` |
| Subsequent C4 (`bc-eed03394`) | Ads files on `cursor/w14-work-c4-subseq-72c4`. Not touched |
| G2.3 (`bc-9578758f`) | Playwright / `l2.yml`. This slot does not touch `.github/workflows/` |
| G1.8 (`cursor/w14-work-c4-noads-72c4`) | `ci.yml`, `packages/quality/src/secrets*`. Not touched |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`69fb33c` heartbeats).
L1 sequence unchanged: format → lint → typecheck → test:coverage → check:coverage →
build → guardrails.

Test counts and the coverage gate are recorded after that run.

---

## 6. Left open

- **G2.3 Playwright.** Left for `bc-9578758f`. Not faked with a grep.
- **G1.8 secrets.** Left for `cursor/w14-work-c4-noads-72c4`.
- **`play_auth_token` for TikTok clients below 44.5.0.** Still deferred (W10).
- **Continue-watching feed rail.** Still a discovery concern, not a session field.
- **C4-03 / C4-07.** Postgres, VIP contract. Unchanged.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
