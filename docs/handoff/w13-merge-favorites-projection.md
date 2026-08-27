# W13 — favourites `DramaSummary` projection, merged onto main

> **Slot:** W13, work slot that also merged. One backlog item, no pull request.
> **Branch:** `cursor/w13-work-cycle3-next-72c4`, merged onto `main` as `b4cc54c`.
> **Parents:** `d27b969` (`main`, "Write the gate register back: GATE-7 and GATE-8 are in the
> table, and the two-cycle silence is filed") and `52a541e` (the branch tip, "Note that
> silent-login, VePlayer, and gate writeback landed with no overlap").
> **Base:** `main` at `ba4bfb3` when the work was cut; the branch later took `a6c04d3` and
> `d27b969`, so the merge-base at merge time *was* `origin/main`.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Predecessor:** `docs/handoff/w13-work-favorites-projection.md`, which is the work this merge
> lands.
> **Already on `main`:** silent re-login (`a6a0404`), VePlayer replace (`a6c04d3`), gate writeback
> (`d27b969`). This merge did not open those paths.
> This slot adds this document and nothing else of its own.

---

## 1. Where it got to

**`cursor/w13-work-cycle3-next-72c4` is an ancestor of `main`.** C3-07 is closed: `GET
/v1/users/me/favorites` still pages `{ dramaId, favoritedAt }` in keyset order, and each item now
also carries `drama: DramaSummary | null` from one catalogue lookup per page. Unpublished,
deleted, and unknown ids stay on the page as `null` (S68 / W8-a). The client no longer fans out
`getDrama` per row. `GET /v1/dramas/{id}` fills `viewer.favorited` from the same `FavoritesStore`
when the session resolves.

`pnpm verify` exits 0 on `main` after one try, **2,230 tests across 119 files, none skipped**.

The whole effect of the merge on `main`:

| File | Change |
| --- | --- |
| `server/src/modules/catalog/store.ts` | `getDramas(ids)` — one query, unpublished records included |
| `server/src/modules/catalog/summary-lookup.ts` | New. Adapter: published → `toDramaSummary`, else absent |
| `server/src/modules/search/routes.ts` | List handler projects `items[].drama` |
| `server/src/modules/catalog/views.ts` / `routes.ts` | `toDramaDetail` takes viewer; W8-c read |
| `server/src/app.ts` | One favourites store for verbs, list, and drama detail |
| `packages/shared/src/discovery.ts` | `FavoriteListItem.drama: DramaSummary \| null` |
| `contracts/openapi.yaml` | `drama` required on `FavoriteListItem`; viewer description |
| `app/src/data/favorites-api.ts` | Shared types; G-C1 widening recorded |
| `app/src/favorites/favorite-collection.ts` | Fan-out deleted |
| `app/src/routes/FavoritesPage.tsx` | No catalogue client |
| `docs/handoff/w13-work-favorites-projection.md` | New, the work slot's own record |

`git diff --stat HEAD^1 HEAD` is 22 files, 803 insertions, 363 deletions.

---

## 2. Fast-forward was available and was not taken

The branch had already merged `origin/main` (`8df9591`), so `git merge --ff-only` would have
accepted it. A merge commit was taken instead, so `main` names the landing the same way it named
silent-login (`a6a0404`) and the cycle-3 plan (`2249b35`). Rebasing would have rewritten a branch
already on origin and already described by its own handoff, to save one commit.

**Git resolved it with no conflicts at all.** Predicted empty compose:

```
git diff --stat d27b969 origin/main -- \
  app/src/data/favorites-api.ts \
  app/src/favorites/favorite-collection.ts \
  app/src/routes/FavoritesPage.tsx \
  contracts/openapi.yaml \
  packages/shared/src/discovery.ts \
  server/src/app.ts \
  server/src/modules/catalog/store.ts \
  server/src/modules/catalog/summary-lookup.ts \
  server/src/modules/search/routes.ts
```

which is empty: merge-base *is* `origin/main`. `main` had not touched any of the twenty-two paths
since `d27b969`.

---

## 3. In-flight work, already on `main`

The two slots this work was told not to overwrite had landed before the merge ran. Their paths
were checked again at merge time and are still disjoint.

| Slot | Landed on `main` as | Overlap with C3-07's twenty-two files |
| --- | --- | --- |
| W12 silent re-login (`bc-3365072b`) | `a6a0404` | empty. Session transport, recovery, `http.ts` |
| W13 VePlayer replace (`bc-f269a2f6`) | `a6c04d3` | empty. `video-replace.ts`, bundle-scan, source-rules |
| W13 gate writeback (`bc-d2609cbd`) | `d27b969` | empty. `wave-protocol.md`, `docs/gates/open-questions.md` |

No other `cursor/*` tip on origin was not an ancestor of `main` at merge time.

---

## 4. Verification

`pnpm verify` on the merge commit `b4cc54c`, first try, exit 0. No retry.

| Gate | Result |
| --- | --- |
| `pnpm format:check` | pass |
| `pnpm lint` | pass, 0 errors, 0 warnings |
| `pnpm typecheck` | pass, 4 packages |
| `pnpm test` | pass — **2,230 tests, 119 files, 0 skipped, 0 failing** |
| `pnpm build` | pass — `dist/assets/index-BfoN7A5C.js` 308.47 kB (gzip 96.08 kB); CSS 10.23 kB |
| `pnpm check:guardrails` | pass, against `app/dist` |

| Package | Test files | Tests |
| ---: | ---: | ---: |
| `server` | 55 | 1,329 |
| `app` | 57 | 805 |
| `packages/shared` | 4 | 51 |
| `packages/config` | 3 | 45 |

---

## 5. Reading the document this merge brought in

`docs/handoff/w13-work-favorites-projection.md` is a slot record and is on `main` as its author
wrote it. It was not rewritten here to mention this merge commit.

---

## 6. For the next slot

**C3-07 is closed.** `docs/plan/cycle-3-backlog.md` still records it as open against `2b66323`.
That document was not rewritten here.

**C3-04 wallet / PNL-01 is unblocked for structure.** The list no longer requires a client-side
drama fan-out; wallet work can consume `items[].drama` the same way the favourites page does.

Still open, and not this merge:

- **W8-c `lastWatched`.** `viewer.lastWatched` is still `null`.
- **C3-05 D9 capsule.** Independent; every screen.
- **C3-06 durable stores.** Largest remaining engineering item; do not split.
- **C3-09 Beans rate.** Gated on M2/M4; not an engineering close.
- **G-C4.** A delisted favourite and a missing id still look identical (`drama: null`).
