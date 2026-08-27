# W14 — HOME continue-watching rail from the server mix

> **Slot:** W14, work slot. One leftover client gap, no pull request.
> **Branch:** `cursor/w14-work-continue-ui-72c4`, cut from `origin/main` at `546dfe6`
> (HOME continue-watching from heartbeats).
> **Item:** HomePage renders the `CONTINUE_WATCHING` rail from
> `GET /v1/recommendations/feed?scene=HOME`, not a second guessed list. Empty /
> anonymous stays the catalogue mix. Fail-closed if the section is missing.
> **Not in scope:** G2.3 Playwright (`bc-9578758f`, landed as `5ab02d1` while
> this slot ran). Cycle-4 verify docs (`bc-caaa9d68`, landed). C4-03 Postgres.
> C4-07 VIP. Drama-detail `viewer.lastWatched` CTA. Beans, enabling wallet
> top-up, inventing ad-unit ids. No pull request.

---

## 1. What was picked, and why

`546dfe6` led the HOME feed with `CONTINUE_WATCHING` from the heartbeat table.
The composer, the delist drop, and `FeedCardView`'s one-tap resume already
existed. Home still painted every card in one list, so a returning viewer’s
rail was indistinguishable from the mix, and a later slot could have been
tempted to fetch watch-history as a second source.

| Item | State |
| --- | --- |
| C4-01 / C4-02 L2 slices / C4-04 / C4-05 / C4-06 / C4-08 | on `main` |
| Heartbeats / session resume / VePlayer seek | on `main` |
| HOME feed continue-watching **source** | on `main` at `546dfe6` |
| **HOME continue-watching **rail** (this slot)** | client projection of that mix |
| G2.3 Playwright | in flight (`bc-9578758f`). Not this slot |
| Cycle-4 verify docs | in flight (`bc-caaa9d68`). Not this slot |
| C4-03 T14 Postgres | do not fake |
| C4-07 VIP | no contract; do not invent |

Anonymous and empty-progress responses are already the catalogue mix on the
server. Inventing a rail from `GET /v1/users/me/watch-history` would disagree
with that mix — including showing someone a resume the feed had already
dropped.

---

## 2. What changed

`splitHomeFeed` partitions the loaded mix. A card is on the rail only when
`cardType === 'CONTINUE_WATCHING'` **and** `continueEpisode` is present. Home
renders that slice as `<section data-testid="continue-rail">` and the rest as
the existing `data-testid="feed"` catalogue list. No history client, no
progress client, no `lastWatched`.

| Situation | Home |
| --- | --- |
| Mix leads with a continue card that has `continueEpisode` | rail + remaining mix |
| All `DRAMA` (anonymous / empty progress) | no rail; catalogue mix only |
| Empty catalogue | existing empty state; no invented rail |
| `CONTINUE_WATCHING` with `continueEpisode: null` | not a rail item; stays in the mix as a non-resume card |
| Watch-history stub has rows, feed does not | no rail; history is not called |

One-tap resume is unchanged: `FeedCardView` still sends a valid continue card
to `/play/:episodeId`. Wallet top-up stays disabled. `.github/workflows/` is
unchanged.

| File | Change |
| --- | --- |
| `app/src/catalog/home-feed.ts` | Split. Fail-closed without `continueEpisode` |
| `app/src/catalog/home-feed.test.ts` | Order, empty mix, missing section, no history import |
| `app/src/routes/HomePage.tsx` | Rail from the split; mix unchanged |
| `app/src/routes/HomePage.test.tsx` | Mixed rail, history not consulted, missing section |
| `app/src/core/i18n/locales/{en,ar}.json` | `home.continue` |
| `app/src/styles/app.css` | Horizontal continue rail |

`docs/plan/cycle-4-backlog.md` is not rewritten. The document belongs to the
plan slot.

---

## 3. Reverse verification

Against a HOME mix that is only `DRAMA` cards, with watch-history holding a
row:

```
FAIL  does not invent a continue-watching rail from watch-history
expected continue-rail to be null, historyCalls []
```

Against a `CONTINUE_WATCHING` card whose `continueEpisode` is `null`:

```
FAIL  does not render a continue-watching rail when the episode section is missing
expected continue-rail to be null, no feed-resume
```

Against `HomePage.tsx` importing history or progress:

```
FAIL  does not import history or progress as a second continue-watching source
```

A mixed page still puts the continue card on the rail (`/play/ep_test_0007`)
and the `DRAMA` card in `data-testid="feed"`.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| Continue-watching **source** (`546dfe6`) | Already on `main` at pick. Server discovery / progress. This slot does not edit `server/` |
| G2.3 (`bc-9578758f`) | **Landed.** Playwright smoke on `main` at `5ab02d1`. `l2.yml`, `packages/quality/e2e/*`, `packages/quality/src/smoke*`. Merged in; no overlap with Home / `home-feed` |
| Cycle-4 verify (`bc-caaa9d68`) | **Landed.** `docs/verify/cycle-4-report.md`. This slot does not edit it |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on `6c6cdcd`, then again after merging `origin/main` (`5ab02d1`
G2.3 Playwright + C4 verify report). L1 sequence unchanged: format → lint →
typecheck → test:coverage → check:coverage → build → guardrails. G1.8
`check:secrets`, G1.6 `check:contract`, and G2.3 `check:smoke` stay out of
`pnpm verify`.

| Package | Tests |
| --- | ---: |
| shared | 61 |
| quality | 282 |
| config | 45 |
| server | 1,752 |
| app | 1,130 |
| **Total** | **3,270** |

Zero skipped. Coverage gate after the G2.3 merge:

```
coverage global lines 94.06% (15768/16763), branches 91.28%, core lines 95.50%, diff lines 100.00% (32/32)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DFMC6f1v.js` 354.12 kB / 108.20 kB
gzip). Native `<video>` remains absent.

---

## 6. Left open

- **G2.3 Playwright.** Closed by the sibling while this slot ran (`5ab02d1`).
  Not retaken. Specs click through Home to profile; they do not assert the rail.
- **Cycle-4 verify report.** Landed as `docs/verify/cycle-4-report.md`.
- **Drama-detail continue-watching CTA.** `viewer.lastWatched` is still unused
  on `DramaPage`; inventing a resume from the episode list would be a guess.
- **C4-03 / C4-07.** Postgres, VIP contract. Unchanged.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to
  the plan slot.
