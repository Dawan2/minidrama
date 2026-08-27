# W13 — seed catalogue meets the eighty-episode floor

> **Slot:** W13, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w13-work-seed-floor-e1f8`, cut from `origin/main` at `a2122c1`.
> **Item:** the seed-scale half of `C3-06` / C2 `T2-3` — ≥ 2 dramas and ≥ 80 listed episodes, the
> W7 / C2 exit that W10 recorded as 8 dramas / **27 episodes**.
> **Not in scope:** the durable-store half of `C3-06` (sibling `bc-1668e0df`, "W13 work durable data
> layer"), wallet UI (`bc-5f167886`), BytePlus ingest, GATE-8. No partner content ids. No pull
> request.

---

## 1. What was picked, and why

W10 (`docs/verify/cycle-2-report.md` §0): 27 seed episodes against a floor of 80. Cycle 3 still
requires that volume for listing-quality (`docs/plan/cycle-3-backlog.md` C3-06 acceptance item 2).
Favourites `DramaSummary` is already on `main` (`a2122c1`). Wallet and the data-layer rewrite are
live sibling slots.

C3-06 names two things that must not be split *as a data-layer task*. This slot takes only the
fixture volume the listing bar can use today, behind the in-memory store that is already on `main`.
Migrations, restart tests, and swapping the eight stores are the sibling's.

GATE-8 stays unanswered. The extra rows are the same fixture ids the catalogue already uses
(`ep_sweet_eNN`). No `vid`, no `albumId`, no BytePlus partner content id, no ingest.

---

## 2. What changed

The volume sits on `drm_sweet_0003` (Sweet Trap), which was already an incomplete four-episode
serial. It is now 80 listed episodes, `COIN_OR_VIP` at 50 coins, free window still 5. A default
episode page of 50 therefore has a remainder of 30. The first five stay `FREE`; episode 6 is
`NEED_UNLOCK`.

Nothing else in the table of cases moved:

| Fixture | Still true |
|---|---|
| `drm_dynasty_0002` | Six listed episodes; `ep_dynasty_s2e01` is global 4 and not free |
| `ssn_dynasty_s3` | Offline; hides its two episodes and keeps their numbers |
| `ep_revenge_e05`–`e08` | Marked-free, VIP-only, offline-listed, draft-omitted |
| `drm_offline_0007` | Delisted |
| `drm_draft_0008` | Unpublished |

Eight dramas still. No new drama, so HOT/NEW order tests are untouched.

**Listed episode count:** 103 (27 − 4 + 80). Floor is 80. Published dramas: 6 (floor 2). Total
episode *records* including drafts and the hidden season: 107.

---

## 3. Files

| File | Change |
|---|---|
| `server/src/modules/catalog/fixtures.ts` | `SEED_LISTED_EPISODE_FLOOR = 80`, `SEED_PUBLISHED_DRAMA_FLOOR = 2`; Sweet Trap `totalEpisodes` and `paidRun(1, 80, 50)` |
| `server/src/modules/catalog/store.test.ts` | Floor, longest-run, publication-fixture preservation, no BytePlus id |
| `server/src/modules/catalog/routes.test.ts` | Default-page split on Sweet Trap (50 then 30) |
| `docs/handoff/w13-seed-floor.md` | This document |

---

## 4. Mutations

Inverting Sweet Trap back to four listed episodes fails the floor and the default-page split:

```
FAIL  meets the W7 listed-episode floor without adding dramas
AssertionError: expected 27 to be greater than or equal to 80

FAIL  pages a volume drama past the default episode limit
AssertionError: expected 4 to be 50   // first.items.length
```

Restored. A catalogue of 80 one-episode dramas would pass the count and still never page; the
longest-run test is what makes that insufficient.

---

## 5. Overlap with in-flight

At pick time, two work slots were live:

| Slot | Overlap |
|---|---|
| W13 durable data layer (`bc-1668e0df`) | Same C3-06, different half. This branch does not touch store implementations, migrations, or `app.ts` wiring |
| W13 wallet UI (`bc-5f167886`) | None. Wallet screens do not read seed episode counts |

`origin/main` stayed at `a2122c1` through verify. No merge of `main` into this branch was required.

---

## 6. Verification

`pnpm verify` green on `119bae5`, first try, exit 0.

| Package | Tests |
|---|---:|
| `packages/shared` | 51 |
| `packages/config` | 45 |
| `server` | 1,334 |
| `app` | 805 |
| **Total** | **2,235** |

Guardrails passed against `app/dist`. Bundle unchanged: `index-BfoN7A5C.js` 308.47 kB (gzip 96.08
kB) — nothing in `app/` moved.

---

## 7. Left open

- **C3-06 durable stores.** Migrations, restart tests, and the eight in-memory implementations.
  The seed this slot raised is the one those stores should load.
- **GATE-8.** Unanswered. This catalogue still has no media handle. Playback still refuses unless a
  media port is injected.
- **C3-04 wallet / PNL-01.** Unblocked for structure; not this slot.
- **`docs/plan/cycle-3-backlog.md`.** Not rewritten. The seed-scale acceptance item is met on this
  branch; the document belongs to the plan slot.
