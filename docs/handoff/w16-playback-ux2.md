# W16 — second protocol-C4 playback exit: 跨端进度冲突

> **Slot:** W16, work slot. Second unblocked playback-experience item. No pull request.
> **Branch:** `cursor/w16-work-playback-ux2-72c4`, cut from `origin/main` at `7ecca77`
> (HOME continue rail UI). Merged forward onto `33f347b` (C5 plan docs landed while this
> slot ran; those files were not rewritten).
> **Item:** Protocol C4 exit 2 — 跨端进度冲突用例 (`PRG-001` remainder). Phone B's newer
> `clientUpdatedAt` stays the stored position after phone A's older report arrives late.
> Resume GET, HOME continue rail, drama `lastWatched`, watch-history, and
> `POST /v1/playback/sessions` all read that winner. A VePlayer tick at 0 before seek is
> not a watch: reporting it would last-write-wins over the other device.
> **Not in scope:** `bc-2fd6c885` player interaction (swipe / ended `playNext` on
> `cursor/w16-work-playback-ux-72c4`). Cycle-5 plan docs (`bc-e8f91fa2`, landed as
> `33f347b`). C4-03 Postgres. C4-07 VIP. D-17 billing. BytePlus `vid` fiction. a11y
> gate. Gestures / 倍速 / PNL-05. Drama-detail CTA. No pull request.

---

## 1. What was picked, and why

`docs/verify/cycle-4-report.md` §0 scored protocol-C4 播放体验 **0/3**. The three exits, in
order:

| # | Exit | At verify | This slot |
|---|---|---|---|
| 1 | 交互验收单 (`01-product-scope` §4.3) | Not met | **Skipped.** Sibling `bc-2fd6c885` owns swipe / ended 连播 |
| 2 | 跨端进度冲突用例通过 | Not met. Heartbeats + session resume + HOME rail on `main`; conflict *cases* absent | **This slot** |
| 3 | a11y 门禁 | Not met | Skipped. `QA-011` / `QA-010` |

HOME continue rail is on `main` (`7ecca77`). That is PRG-002 presentation, not exit 2.
`mergeReport` already ignores a stale `clientUpdatedAt`. Cycle-5's PRG-001 remainder asked
for a two-device *product case* a verifier can run as the §5.1 row, not another unit test
on the merge function. This slot adds that case, and the client hole that would make it
fail in play: a pre-seek `timeupdate` at 0 with a newer client clock.

| Item | State |
| --- | --- |
| Heartbeats / session resume / VePlayer `startTime` | on `main` at pick |
| HOME continue **rail** | on `main` at `7ecca77` |
| LWW merge unit tests | on `main` (`IGNORED_STALE`) |
| **Cross-end product case + pre-seek hold** | this slot |
| `bc-2fd6c885` PLY-010 slice | in flight; `PlayerSurface` / `PlayPage` overlap noted below |
| C5 plan docs | in flight at pick (`bc-e8f91fa2`); **landed as** `33f347b`. Not rewritten |
| C4-03 / C4-07 / D-17 | unchanged; cannot code-fix billing |

---

## 2. What changed

Two devices of the same viewer are distinguished by `clientUpdatedAt`, not by tokens.
The older report arriving second is still **204** with an empty body. Every read path
then answers the newer position.

The player half: until a `timeupdate` has landed within two seconds of session
`resumePositionSec` (the same bound as server `backwardJitterToleranceSec`), a tick
behind that resume is dropped. Once landed, a real rewind is reported. A new episode
that resumes at 0 is not held back. Catalog `durationSec` is still not a seek target.
No new BytePlus `vid`.

| File | Change |
| --- | --- |
| `app/src/player/progress-heartbeat.ts` | `resumePositionSec`; drop pre-seek observations |
| `app/src/player/progress-heartbeat.test.ts` | Pre-seek hold, land-then-rewind, episode switch at 0 |
| `app/src/player/PlayerSurface.tsx` | Passes the descriptor resume into the heartbeat |
| `app/src/player/PlayerSurface.test.tsx` | `startTime` 45 does not flush a tick at 0 |
| `app/src/routes/PlayPage.tsx` | Comment only: pre-seek 0 is not a watch |
| `app/src/routes/PlayPage.test.tsx` | Session resume 45 does not report a pre-seek 0 |
| `server/src/modules/progress/cross-end-conflict.test.ts` | HTTP use case: late older PUT, then resume / HOME / lastWatched / session / history |
| `docs/handoff/w16-playback-ux2.md` | This file |

`docs/plan/cycle-5-backlog.md` is not rewritten. The document belongs to the plan slot.
`.github/workflows/` is unchanged. Wallet top-up stays disabled. `adUnlock` stays false.

---

## 3. Reverse verification

Against a heartbeat whose session resume is 45, a `timeupdate` at 0 then pause:

```
expected report not to have been called
```

Against the same instance after a tick at 45, a later rewind to 0 is still reported
(`[45, 0]`). Against `setEpisode('ep_2', 0)` after a non-zero resume, a tick at 1 on
the new episode is reported — holding the old resume across 连播 would starve the
next episode of heartbeats.

On the server, phone B writes 41 at `T+10s`, phone A retries 12 at `T`:

```
PUT stale → 204, empty body
GET resume → 41
HOME feed[0].continueEpisode.positionSec → 41
GET /v1/progress/dramas/drm_sweet_0003 lastWatched.positionSec → 41
```

Playback session and history use the entitlement fixture world (`ep_fx_s1e01`,
existing `vid_fx_0001` — not a new BytePlus id) and answer `resumePositionSec` / 
`lastPositionSec` **45** after the same late older PUT. Two different viewers are
not two devices: `tok_b`'s newer clock does not move `tok_a`.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-2fd6c885` (`cursor/w16-work-playback-ux-72c4`) | **PlayerSurface.tsx, PlayerSurface.test.tsx, PlayPage.tsx, PlayPage.test.tsx.** Sibling: ended `playNext`, vertical swipe. This slot: `resumePositionSec` into the heartbeat, and tests that a pre-seek 0 is not reported. Did not take swipe, facade `playNext` on ended, or `episode-swipe.ts` |
| `bc-e8f91fa2` C5 plan | **Landed** as `33f347b` / `docs/plan/cycle-5-backlog.md`. Merged in; this slot did not edit it |
| HOME continue UI | Already on `main` at pick. `HomePage.tsx` / `home-feed.ts` untouched |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on `1148472` (3,279 tests: shared 61, quality 282, config 45,
server 1,755, app 1,136). Then `origin/main` (`33f347b`, C5 plan docs only) merged
in with no overlap. L1 sequence unchanged: format → lint → typecheck →
test:coverage → check:coverage → build → guardrails. G1.8 `check:secrets`, G1.6
`check:contract`, and G2.3 `check:smoke` stay out of `pnpm verify`.

Coverage gate after the implementation:

```
coverage global lines 94.11% (15793/16782), branches 91.31%, core lines 95.50%, diff lines 96.00% (24/25)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-C6xU-0U1.js` 354.45 kB / 108.33 kB
gzip). Native `<video>` remains absent.

---

## 6. Left open

- **PLY-010** tap / double-tap / scrub / 倍速 / swipe. Sibling `bc-2fd6c885` in
  flight. Not retaken.
- **a11y gate** (protocol exit 3). `QA-011` then `QA-010`. Not started.
- **Drama-detail continue CTA.** Catalog `viewer.lastWatched` is still `null` on
  the drama header. This slot reads `GET /v1/progress/dramas/{id}` `lastWatched`
  after LWW; it does not invent a detail-page button.
- **C4-03 / C4-07 / D-17.** Postgres, VIP contract, GitHub billing. Unchanged.
- **`docs/plan/cycle-5-backlog.md`.** Not rewritten. Rank 2 still says 0/3 until
  an independent verify wave re-scores.
