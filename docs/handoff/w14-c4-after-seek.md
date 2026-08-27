# W14 — continue-watching rail from the heartbeat table

> **Slot:** W14, work slot. One leftover server gap, no pull request.
> **Branch:** `cursor/w14-work-c4-after-seek-72c4`, cut from `origin/main` at `795baaf`
> (client resume seek on main).
> **Item:** HOME `GET /v1/recommendations/feed` continue-watching rail, from the same
> watch-progress store heartbeats write. Anonymous stays the catalogue mix. A rejected
> session is not a 401.
> **Not in scope:** Resume-seek (on `main` as `795baaf`). G2.3 Playwright (`bc-9578758f`,
> in flight). Post-G1.8 C4 (`bc-84ec4fdd`, G1.6, landed as `3cb724c` while this slot ran).
> C4-03 Postgres. C4-07 VIP. Beans, enabling wallet top-up, inventing ad-unit ids,
> G1.7 / G1.10. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after resume-seek landed,
skipping items this assignment named in-flight:

| Item | State |
| --- | --- |
| C4-01 / C4-02 G2.7 G2.2 G2.6 G2.4 Semgrep / CodeQL / G2.5 | on `main` |
| C4-04 splash / `GET /v1/config` | on `main` |
| C4-05 OAuth stub | on `main` |
| C4-06 trade_order stub | on `main` |
| C4-08 ads | on `main`; `adUnlock` stays false |
| G1.8 Gitleaks | on `main` |
| Heartbeats / session resume / VePlayer seek | on `main` as `795baaf` |
| G2.3 Playwright | in flight (`bc-9578758f`). Not this slot |
| Post-G1.8 C4 | in flight (`bc-84ec4fdd`). Likely G1.6 / G1.7 / G1.10. Not this slot |
| C4-03 T14 Postgres | do not fake |
| C4-07 VIP | no contract; do not invent |

The resume-seek handoff left **continue-watching feed rail** open: a discovery concern, not
a session field. Composition, delist-dropping, and the client card already existed. The
default source was empty because "the progress module does not exist yet." It does. The
player writes heartbeats. Playback sessions read them. The HOME rail still did not.

---

## 2. What changed

`createProgressContinueWatchingSource` lists the viewer's newest progress rows. The feed
route resolves the **session** (the same resolver progress and history use), not the
anonymous catalogue viewer. Catalog still answers unlocks / VIP; a second identity would
let the rail name a viewer the history screen then refused.

| Situation | Rail |
| --- | --- |
| Signed-in viewer with a stored non-negative integer | that episode, newest first |
| No row / another viewer's row | catalogue mix, no `CONTINUE_WATCHING` |
| Anonymous | empty rail; the store is not consulted |
| Rejected / unresolvable session | anonymous mix, **200**, not 401 |
| Stored value not a non-negative integer | dropped, not forwarded as a seek |
| Completed row | the stored position, not an invented restart |

`buildApp` creates one progress store before registering discovery, then hands that
instance to playback / progress / history. A second map would leave the rail empty for a
viewer whose player had been writing.

Injected `continueWatching` still overrides, so the existing composer tests stay pinable.

| File | Change |
| --- | --- |
| `server/src/modules/discovery/continue-watching.ts` | Progress-backed source |
| `server/src/modules/discovery/continue-watching.test.ts` | Anonymous, leak, completed, bad integer |
| `server/src/modules/discovery/feed.ts` | `forViewer(userId)` |
| `server/src/modules/discovery/routes.ts` | Session identity; public-read degrade |
| `server/src/modules/discovery/routes.test.ts` | Default wiring over a real session + store |
| `server/src/app.ts` | One store, created before the feed |

The client is unchanged. `FeedCardView` already routes a `CONTINUE_WATCHING` card to the
episode. Wallet top-up stays disabled. `.github/workflows/` is unchanged.

---

## 3. Reverse verification

Against a signed-in session whose store holds another viewer's `80`:

```
FAIL  does not leak another viewer's heartbeat onto this rail
expected every cardType to be DRAMA
```

Against an anonymous request whose store holds this viewer's `41`:

```
FAIL  does not invent a rail for an anonymous caller, even when the store has rows
expected every cardType to be DRAMA
```

Against a rejected bearer token:

```
FAIL  answers a rejected session as anonymous rather than 401ing the catalogue mix
expected 200
```

Against a stored `-3`:

```
FAIL  drops a stored position that is not a non-negative integer rather than forwarding it
expected []
```

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| Resume-seek (`795baaf`) | Already on `main` at pick. Client `startTime`. This slot does not edit `app/` |
| G2.3 (`bc-9578758f`) | Playwright / `l2.yml`. This slot does not touch `.github/workflows/` |
| Post-G1.8 (`bc-84ec4fdd`) | **Landed.** G1.6 oasdiff on `main` at `3cb724c`. `ci.yml`, `packages/quality/src/contract*`. Merged in; no overlap with discovery / progress |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on `85d0bc9`, then again after merging `origin/main` (`3cb724c` G1.6
oasdiff). L1 sequence unchanged: format → lint → typecheck → test:coverage →
check:coverage → build → guardrails. G1.8 `check:secrets` and G1.6 `check:contract` stay
in `ci.yml`, not in `pnpm verify`.

| Package | Tests |
| --- | ---: |
| shared | 61 |
| quality | 250 |
| config | 45 |
| server | 1,752 |
| app | 1,121 |
| **Total** | **3,229** |

Zero skipped. Coverage gate after the G1.6 merge:

```
coverage global lines 94.07% (15279/16242), branches 91.60%, core lines 95.50%, diff lines 100.00% (33/33)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DMmaAoAe.js` 353.43 kB / 108.04 kB gzip —
the resume-seek merge's artifact, not this slot's). Native `<video>` remains absent.

---

## 6. Left open

- **G2.3 Playwright.** Left for `bc-9578758f`. Not faked with a grep.
- **G1.6.** Landed as `3cb724c` while this slot ran. Not retaken.
- **G1.7 / G1.10.** osv-scanner, skip/empty-test detection. Further L1 slices.
- **Drama-detail continue-watching CTA.** `viewer.lastWatched` is still unused on
  `DramaPage`; inventing a resume from the episode list would be a guess.
- **`play_auth_token` for TikTok clients below 44.5.0.** Still deferred (W10).
- **C4-03 / C4-07.** Postgres, VIP contract. Unchanged.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
