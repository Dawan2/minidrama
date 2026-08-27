# W13 — C3-07: favourites list rows carry `DramaSummary`

> **Slot:** W13, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w13-work-cycle3-next-72c4`, cut from `origin/main` at `ba4bfb3`.
> **Item:** `C3-07` — the `DramaSummary` projection on `GET /v1/users/me/favorites`, plus W8-c
> (`DramaDetail.viewer.favorited` from the same store).
> **Not in scope:** silent re-login (`cursor/w12-work-silent-login-97cf`), VePlayer
> `setValidateVideoReplaceElement` (`bc-f269a2f6`), CoverImage, paging flakes, ERROR_OUTCOMES,
> wallet UI, durable stores, Beans rate, `wave-protocol.md` gate writeback. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-3-backlog.md` at `ba4bfb3`. Highest remaining engineering item that is code,
excluding what is already on `main` and what is in flight:

| Item | State |
| --- | --- |
| C3-01 silent re-login | in flight, W12 `cursor/w12-work-silent-login-97cf` |
| C3-02 paging `renderSettled` | on `main` |
| C3-03 gate register | docs, skipped |
| C3-04 wallet | waits on this projection |
| C3-05 D9 capsule | independent, would touch every screen |
| C3-06 durable stores | largest task, not to be split |
| **C3-07 favourites `DramaSummary`** | **this slot** |
| C3-09 Beans rate | gated on M2/M4, not an engineering close |
| C3-10 CoverImage / SR-5 | cover on `main`; SR-5 in flight as VePlayer |

Both halves of C3-07 were on `main` for the first time. The client was absorbing an N+1: one list
read plus twenty drama reads, four in flight. The consume slot named the deletion
(`docs/handoff/w8-work-favorites-consume.md` §6).

---

## 2. What changed

### 2.1 The list

`GET /v1/users/me/favorites` still pages `{ dramaId, favoritedAt }` in keyset order. Each item now
also carries `drama: DramaSummary | null`.

- Published ids get the catalogue's own `toDramaSummary`. Not a partial copy assembled in search.
- Unpublished, deleted, and unknown ids get `null`. The row stays (S68 / W8-a). Filtering them
  would also make the page shorter than `limit` while `hasMore` still described the unfiltered
  query.

The lookup is one store method per page: `CatalogStore.getDramas` (`WHERE id = ANY($1)` in SQL).
`createCatalogDramaSummaryLookup` is the join; search does not assemble a second summary shape.

### 2.2 The client

`resolveFavoriteEntries` and `FAVORITE_RESOLVE_CONCURRENCY` are gone. `FavoritesPage` no longer
calls `useCatalogApi`. `FavoriteEntry.drama` stays nullable. `FavoriteRow`'s unresolved branch and
its five tests still pass.

**G-C1, decided rather than merged away.** `FavoriteState` is a re-export from
`@minidrama/shared`. `FavoriteListItem` is `Omit<WireFavoriteListItem, 'favoritedAt'>` with
`favoritedAt: string | null`. The wire type requires a string; this client still reads the field
tolerantly because it drives no decision on SCR-08, and rejecting a page over it would cost the
viewer their list.

### 2.3 W8-c

`GET /v1/dramas/{dramaId}` fills `viewer.favorited` from the same `FavoritesStore` the verbs write,
when the request carries a resolvable session. Anonymous stays `viewer: null` — `favorited: false`
is still not a safe stand-in for "not known". A bad token does not 401 a public read.
`lastWatched` is `null` until progress is folded the same way.

---

## 3. Files

| File | Change |
| --- | --- |
| `server/src/modules/catalog/store.ts` | `getDramas(ids)` — one query, unpublished records included |
| `server/src/modules/catalog/summary-lookup.ts` | New. Adapter: published → `toDramaSummary`, else absent |
| `server/src/modules/search/routes.ts` | List handler projects `items[].drama` |
| `server/src/modules/catalog/views.ts` / `routes.ts` | `toDramaDetail` takes viewer; W8-c read |
| `server/src/app.ts` | One favourites store for verbs, list, and drama detail |
| `packages/shared/src/discovery.ts` | `FavoriteListItem.drama: DramaSummary \| null` |
| `contracts/openapi.yaml` | `drama` required on `FavoriteListItem`; viewer description |
| `app/src/data/favorites-api.ts` | Shared types; G-C1 widening recorded; `narrow` for `drama` |
| `app/src/favorites/favorite-collection.ts` | Fan-out deleted |
| `app/src/routes/FavoritesPage.tsx` | No catalogue client |

---

## 4. Mutations

Two inversions, both fail as written:

**Drop unresolved rows** (`item.drama !== null` filter in the list handler):

```
FAIL  lists a drama that has since been delisted
AssertionError: expected [] to deeply equal [ 'drm_offline_0007' ]
```

**Loop `getDrama` instead of `getDramas`:**

```
FAIL  looks the summaries up once per page, not once per row
AssertionError: expected +0 to be 1   // getDramasCalls
```

Restored. The HTTP body of the N+1 rewrite still looks identical; the call-count assertion is
what makes W8-b a test rather than a comment.

---

## 5. Overlap with in-flight

| Branch / agent | Paths | Overlap |
| --- | --- | --- |
| `cursor/w12-work-silent-login-97cf` | `http.ts`, `transports.ts`, `main.tsx`, `session-recovery.ts`, `silent-login.ts` | none |
| W13 VePlayer `bc-f269a2f6` | bundle-scan / source-rules (SR-5) | none |

Safe to merge onto `main` without a pull request if those paths are still disjoint at merge time.

---

## 6. Verification

`pnpm verify` green after merging `origin/main` at `a6c04d3` (silent-login and VePlayer, no overlap). First try, exit 0.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 51 |
| `packages/config` | 45 |
| `server` | 1,329 |
| `app` | 805 |
| **Total** | **2,230** |

Guardrails passed against `app/dist`. Bundle `index-BfoN7A5C.js` 308.47 kB (gzip 96.08 kB).

---

## 7. Left open

- **W8-c `lastWatched`.** `viewer.lastWatched` is still `null`. Progress exists; folding it is a
  follow-up, not this projection.
- **C3-04 wallet / PNL-01.** Unblocked for structure; not started.
- **Durable `getDramas`.** The in-memory method is the query; SQL is `WHERE id = ANY($1)` when
  C3-06 lands.
- **G-C4.** A delisted favourite and a missing id still look identical (`drama: null`).
