# W13 — `GET /v1/progress/dramas/{dramaId}`, fail-closed, PNL-01 watched marks

> **Slot:** W13, work slot (`bc-046f6d65`). One backlog item, no pull request.
> **Branch:** `cursor/w13-work-drama-progress-72c4`, cut from `origin/main` at `2aea931`.
> **Item:** the missing batch progress read PNL-01 named for watched marks, plus wiring the picker
> to that read and only that read.
> **Not in scope:** `GET /v1/wallet/transactions` (`bc-da8da7ff`), sqlite next-store
> (`bc-d26f106a`), SCR-10/PNL-03 recharge, SCR-11 VIP, replacing the player's demo album. No
> pull request.

---

## 1. What was picked, and why

`docs/handoff/w13-episode-picker.md` shipped the PNL-01 grid against `GET /v1/dramas/{dramaId}/
episodes` and left watched marks out: `docs/02-screen-inventory.md` names
`GET /progress/dramas/{dramaId}` for them, and that path was not in `contracts/openapi.yaml`.
Inventing it in the client would have been a client-side contract. Per-episode
`GET /v1/progress/episodes/{episodeId}` already existed; N of those for an 80-episode grid is
not a substitute.

On `origin/main` at `2aea931` that was still true: `rg progress/dramas contracts/openapi.yaml`
was empty, and the picker test asserted it never asked for the path.

The assignment: add the contract and a fail-closed handler in lockstep with the existing
watch-progress store, then paint picker watched marks **only** from that API. Auth required.
OpenAPI ↔ router asserted both ways.

In flight at start: C3 remainder `bc-da8da7ff` (likely wallet transactions), sqlite next-store
`bc-d26f106a`. This slot did not touch wallet transaction files or sqlite session stores.

---

## 2. What changed

### 2.1 The contract

`GET /v1/progress/dramas/{dramaId}` in `contracts/openapi.yaml`, operationId `getDramaProgress`,
tag `progress`. `DramaProgressView` is `{ items, lastWatched }`:

| Field | Meaning |
| --- | --- |
| `items[]` | Stored rows only. An unwatched episode is absent, not listed with `completed: false`. |
| `items[].episodeNumber` | Drama-wide running order from `catalog`. Not a suffix parse of the episode id. |
| `items[].completed` | The stored flag the write already computed. This read does not re-derive it. |
| `lastWatched` | Newest accepted report, or `null`. A pointer, not a watched-up-to range. |

Auth required. `Cache-Control: private, no-store`. `server/src/contract.test.ts` asserts the
path both ways: documented ⇒ routed, routed ⇒ documented. An unauthenticated inject answers
`401`, not `404`.

### 2.2 The handler

`server/src/modules/progress/drama-routes.ts`. Same `requireViewer` seam as the per-episode
progress read, so a missing and a rejected credential are both `401 AUTH_REQUIRED`, and an
unresolvable session is `503`. Same `WatchProgressStore` instance the PUT writes — two stores
would leave the picker permanently unmarked for a viewer whose player had been reporting.

The numbers come from `DramaProgressCatalogPort`. The unavailable default answers `503`, not
`{ items: [] }`: an empty list is "you have never watched this drama", which is a claim about
the viewer. `buildApp` wires `createCatalogDramaProgressPort` against the live catalogue store,
the same one the episode list is served from, so season 2 episode 1 of `drm_dynasty_0002` is
episode 4 here and episode 4 on the grid.

A draft (`ep_revenge_e08`) and an offline season (`ep_dynasty_s3e01`) are not listed, so a
stored row for either does not appear. Another viewer's rows do not appear.

### 2.3 The picker

`ProgressApi.fetchDramaProgress` is the only progress call PNL-01 makes. Watched marks are
`items` where `completed === true`. A failed or in-flight read is an unmarked grid. `lastWatched.
episodeNumber === 12` does not mark episodes 1–11. There is no loop of
`GET /v1/progress/episodes/{episodeId}`.

The grid still loads from the catalogue. Progress is additive and fail-closed: omitting marks
is the honest answer when the batch read cannot complete.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 Catalogue down becomes `{ items: [], lastWatched: null }`

```
FAIL  src/modules/progress/drama-routes.test.ts > GET /v1/progress/dramas/:dramaId — catalogue down > answers 503 rather than an empty list when rows exist and catalog cannot number them
AssertionError: expected 200 to be 503
```

That is the history-list lie on a smaller surface: a viewer who finished twenty episodes sees a
clean grid of unwatched cells.

### 3.2 Season 2 episode 1 is numbered 1

```
FAIL  src/modules/progress/drama-routes.test.ts > GET /v1/progress/dramas/:dramaId — signed in > numbers a later-season episode across the drama, not as episode 1 of its season
AssertionError: expected 1 to be 4
```

A suffix parse of `ep_dynasty_s2e01` would also fail `projectDramaProgress > numbers from the
catalogue ref, not from a suffix on the episode id`.

### 3.3 Everything before `lastWatched` is painted watched

```
FAIL  src/picker/EpisodePicker.test.tsx > watched marks come only from the drama-progress read > does not treat lastWatched as a watched-up-to range
AssertionError: expected 'true' to be 'false'
```

A skip to episode 3 would mark 1 and 2, which the viewer never opened.

---

## 4. Verify

`pnpm verify` on this branch. Counts filled after the run.

---

## 5. What is still open

- **SCR-10 / PNL-03 recharge.** Still blocked on a Beans rate (`C3-09`) and on `pay()`.
- **SCR-11 VIP.** No subscription contract.
- **The player's demo album.** PNL-01 navigates by real episode ids; the retained VePlayer
  instance still plays `ep_demo_*` until `POST /v1/playback/sessions` replaces the placeholder
  playlist.
- **Watch-history catalogue port.** Still the unavailable default. This slot wired the *drama
  progress* adapter to the live catalogue; history remains fail-closed until a sibling slot
  joins the two.
- **`GET /v1/wallet/transactions`.** Deliberately not this slot (`bc-da8da7ff`).

In flight, no overlap: C3 remainder `bc-da8da7ff`, sqlite next-store `bc-d26f106a`.
