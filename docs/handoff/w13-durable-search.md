# Handoff — Wave 13: durable search hits (catalogue `0007`, no second DB)

> **Slot:** W13, work slot (`bc-98ce540a`).
> **Branch:** `cursor/w13-work-durable-search-72c4`, cut from `origin/main` at `cd25891`, then
> reset onto `be1b0f8` when leftover C3 (`bc-67274eb6`) landed catalogue sqlite as `0007`.
> **Item:** `C3-06` / C2 **T2-2**, persist the **search directory**. Search is not a separate
> store — `DramaDirectory` is a port over `CatalogStore` — so this slot does **not** add a
> migration. Catalogue already persists as `0007_catalog` (`docs/handoff/w13-durable-catalog.md`).
> A searchable-only table would be a second catalogue DB.
> **Not in scope:** a second sqlite catalogue, app chrome / SCR-03 (`bc-7cccf28c`, already on
> `main` as browse), cycle-4 docs, Postgres, Drizzle, Redis. No pull request.

---

## 1. What was picked, and why

Favourites persist as `0006` (`cd25891`, `docs/handoff/w13-durable-favourites.md`). The assignment
was: persist the search directory, or the catalogue if search is not a separate store, as
migration `0007`. Same sqlite pattern. Restart test for search hits. If search is already
durable, stop — do not invent a second catalogue DB.

At pick, search was still `createSeedDramaDirectory`. Catalogue sqlite then landed on `main` as
`be1b0f8` / `0007_catalog` while this slot ran (`bc-67274eb6`, leftover C3 — the in-flight agent
named as "app chrome / cycle-4 docs", which actually shipped the catalogue store). Search was
explicitly out of that slot (`docs/handoff/w13-durable-catalog.md` D1).

Search is not a store. Inventing `0008_search` (or a second `0007`) would duplicate `dramas.title`
and `dramas.tags`. This slot wires the existing directory port over the existing catalogue
store, on the same sqlite file.

In flight at pick: leftover C3 `bc-67274eb6` (landed catalogue `0007`), C3-more `bc-7cccf28c`
(landed SCR-03 browse). This branch does not touch `app/` or cycle-4 docs.

---

## 2. What changed

### 2.1 No new migration

`0007_catalog` already creates `dramas`, `seasons`, and `episodes`. The runner, the reverse
insert, and the sqlite URL refusal stay as that slot left them. This slot adds no `.sql` file.

### 2.2 One directory, the existing catalogue

`createCatalogDramaDirectory` implements `DramaDirectory` over `CatalogStore`:

- `listSearchable` is `listDramas({ sort: 'HOT' })` — published only, the filter `E-13` already
  owns.
- `lookup` is `getDrama` — any publication state, so favouriting can still tell `410` from `404`.

`createSeedDramaDirectory` remains for tests that inject a directory without standing up a
catalogue. Production wiring no longer uses it.

### 2.3 Wiring

`DATABASE_URL=sqlite:<path>` already opens **one** file for unlocks, sessions, webhook events,
orders, watch progress, favourites, and the catalogue. Search now reads that same
`catalogStore`. Two directories — seed plus sqlite catalogue — would let a bounce keep a drama
page and drop the hit, or the other way around. Unset still keeps stores in memory; search then
reads the in-memory catalogue, which is the same seed the old directory copied. A `postgres://`
URL is still **refused at boot**. Redis is not read.

### 2.4 Restart

GET `/v1/search?q=sweet`, close the process, open a new one on the same file: the same hit
comes back. An extra published row written to `dramas` after the seed is still found by query
(`Zxq`) after the bounce — proof the second process read the file rather than the search seed.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/src/modules/search/dramas.ts` | `createCatalogDramaDirectory`; seed directory kept for tests |
| `server/src/modules/search/dramas.test.ts` | directory over the catalogue store |
| `server/src/modules/search/durable-search.test.ts` | process restart; extra row is a search hit; postgres URL refused |
| `server/src/app.ts` | default directory is the catalogue store |
| `server/src/modules/catalog/store.ts` | comment: search reads this store |
| `server/src/db/database-url.ts` | comment: search is not a remaining store |
| `server/src/modules/search/durable-favorites.test.ts` | comment: catalogue and search now persist too |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | No migration `0008`, no second `0007` | Catalogue already is `0007`. A searchable-only table is a second catalogue DB |
| D2 | Wire `DramaDirectory` over `CatalogStore` | That is what `dramas.ts` named when the two branches met. Search is a port, not a store |
| D3 | Keep `createSeedDramaDirectory` for tests | Search-route tests inject a one-row directory. Deleting the seed would force every one of those to stand up a catalogue |
| D4 | Restart asserts an extra sqlite row, not only a seed title | A seed-title-only test would pass if search still scanned `SEED_SEARCHABLE_DRAMAS` |
| D5 | Do not touch `app/` or cycle-4 docs | C3-more browse already landed; leftover C3 shipped catalogue, not chrome |

---

## 5. Mutations

**Invent `0008_searchable` / `catalog_drama`:** would duplicate `0007`'s `dramas` table. Not
done. The first draft of this slot did that before `be1b0f8` was visible; it was discarded.

**Leave `createSeedDramaDirectory` as the app default:** the restart test's extra row would
never appear in `/v1/search`. Restored the catalogue directory as the default.

---

## 6. Verification

`pnpm verify` green after merging `origin/main` at `14276cb` (SCR-12 settings). No overlap with
search-directory files (`app/` settings routes vs `server/src/modules/search/` and `app.ts`
directory wiring). Catalogue sqlite stays `0007`. First verify on the pre-merge tip was also
green (2,681 tests); the settings merge added the extra app tests.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,594 |
| `app` | 950 |
| **Total** | **2,681** |

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,594 |
| `app` | 960 |
| **Total** | **2,691** |

Guardrails passed against `app/dist`. Bundle `index-DjE5Ee-R.js` 336.56 kB (gzip 102.73 kB).
`node:sqlite` is experimental on Node 22 and prints a warning; it is not a failure.

---

## 7. Left open

- **C3-06's eight stores are on the sqlite file.** Search was the last named gap; it is a
  directory over catalogue, not a ninth store.
- **PostgreSQL / Drizzle (T14 / T16).** Do not rewrite `DATABASE_URL` to a file to make the
  swap look done.
- **Redis (T15).** Not read.

Leftover C3 catalogue (`bc-67274eb6` → `be1b0f8`) and C3-more browse (`bc-7cccf28c`, SCR-03)
landed while this slot ran; SCR-12 settings (`14276cb`) landed after verify on the pre-merge
tip. This branch has taken them; it does not edit their files.
