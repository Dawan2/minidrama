# Handoff — Wave 13: the next durable store (catalogue)

> **Slot:** W13, work slot (`bc-67274eb6`).
> **Branch:** `cursor/w13-work-durable-catalog-f9cb`, cut from `origin/main` at `fcc6fd6`.
> **Item:** `C3-06` / C2 **T2-2**, the next slice after orders and watch progress: three SQLite
> tables (`dramas`, `seasons`, `episodes`) behind the existing `CatalogStore` interface. Same
> runner, same `DATABASE_URL=sqlite:` wiring, same refusal of a postgres URL.
> **Not in scope:** favourites sqlite (`bc-a824ef82`, migration `0006`), search directory, SCR-03
> browse (`bc-7cccf28c`), Postgres, Drizzle, Redis, GATE-8. No pull request.

---

## 1. What was picked, and why

Orders persist (`docs/handoff/w13-durable-orders.md`, `fcc6fd6`). Watch progress persists
(`docs/handoff/w13-durable-progress.md`). C3-06 names eight stores; the payment three and
sessions and progress are on `main`. Of what remains:

| Store | State at pick |
| --- | --- |
| Favourites | In flight, `bc-a824ef82`, took `0006_favorites` |
| Catalogue | Still a seed map. This slot |
| Search directory | Still `createSeedDramaDirectory`. Not this slot |

`bc-7cccf28c` is SCR-03 browse (`cursor/w13-work-c3-more-72c4`): client routes against
`GET /v1/dramas`. Different files.

The in-memory catalogue "survives" a bounce only because the fixture is in the binary. An
operator row written to the file would revert to the seed. That is the loss C3-06 named.

---

## 2. What changed

### 2.1 Migration `0007_catalog`

`server/migrations/0007_catalog.{up,down}.sql`. Three tables:

- `dramas` — keyed on `id`. `tags` is JSON text (sqlite has no `text[]`). `is_completed` is
  INTEGER 0/1. Stat columns sit on the row; `DramaRecord` embeds them and splitting a write-hot
  table nobody writes is how a later slot thinks the join is done.
- `seasons` / `episodes` — FKs to `dramas`. `price_coins` is NULL when the policy does not admit
  coins, matching the record type. `global_episode_number` is omitted: numbering stays derived
  (`numbering.ts`), so an offline season still keeps its numbers and a draft is still not
  numbered.

`0006` is unused on this branch's first commit on purpose: the in-flight favourites slot owned
that version. Favourites landed on `main` as `0006_favorites` while this ran (`d182043`). The
merge takes both: `0006` then `0007`. A gap would have been fine; composing is better.

The down file drops episodes, then seasons, then dramas. The reverse check now covers the
catalogue: after rollback, `INSERT INTO dramas` fails with `no such table`; after a second up,
it succeeds, and so do seasons and episodes.

### 2.2 One store, the existing interface

`createSqliteCatalogStore` implements `CatalogStore`. The seed is written once, when `dramas` is
empty; a second open of the same file does not re-insert. `getDramas` is one
`WHERE id IN (...)` statement — the lookup C3-07 named. The existing suite runs against both
implementations (`describe.each`).

### 2.3 Wiring, and what is refused

`DATABASE_URL=sqlite:<path>` opens **one** file, migrates it, and puts SQLite behind unlock
receipts, sessions, webhook events, coin unlock orders, watch progress, favourites, **and** the
catalogue. Unset keeps the remaining in-memory store (the search directory). A `postgres://`
URL is still **refused at boot**. Redis is not read. Favourites (`0006`) landed on `main` as
`d182043` while this slot ran; this branch has taken it.

### 2.4 Restart

GET `/v1/dramas/drm_revenge_0001`, close the process, open a new one on the same file: the same
detail comes back. An extra published row written after the seed is still listed after the
bounce — proof the second process read the file rather than the fixture.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/migrations/0007_catalog.up.sql` / `.down.sql` | `dramas`, `seasons`, `episodes` |
| `server/src/modules/catalog/sqlite-catalog-store.ts` | durable `CatalogStore`; seed-on-empty |
| `server/src/modules/catalog/store.ts` | comment: sqlite is the durable backend; `compareDramas` exported |
| `server/src/modules/catalog/store.test.ts` | suite against both backends |
| `server/src/modules/catalog/sqlite-catalog-store.test.ts` | close/reopen; no re-seed; INTEGER completed; one IN list |
| `server/src/modules/catalog/durable-catalog.test.ts` | process restart; extra row survives; postgres URL refused |
| `server/src/app.ts` | one sqlite connection includes the catalogue |
| `server/src/db/migrate.test.ts` | catalogue up, down, and reverse-insert |
| `.env.example` | documents the catalogue on the sqlite file |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Catalogue next, not the search directory | C3-06 named both. The catalogue is what the storefront and `getDramas` read. The search directory is a second copy of titles and is a follow-up, not this slot |
| D2 | Migration `0007`, not `0006` | Compose with in-flight favourites sqlite. Reusing `0006` is a collision; a gap is not |
| D3 | Seed once, when empty | Re-seeding on every boot would make "durable" mean "the fixture, plus a file we never read" |
| D4 | No `global_episode_number` column | Numbering is a rule (`numbering.ts`). A stored copy would drift from it |
| D5 | No media handle, no BytePlus id | GATE-8 stays unanswered. Same honesty as the seed floor |
| D6 | `getDramas` is one `IN` list | C3-07 / W8-b. Per-row `getDrama` moves the N+1 from the client to the server |
| D7 | INTEGER 0/1 for `is_completed`, JSON text for `tags` | sqlite has neither boolean nor `text[]`. A TEXT `'true'` would make a dump lie |
| D8 | Unset `DATABASE_URL` stays in-memory; `postgres://` fails closed | Same as the other sqlite stores. Do not rewrite a postgres URL to a file. Do not add Redis |

---

## 5. Mutations

**Filter the sqlite backend out of `describe.each`:** the in-memory suite would still pass and
the durable implementation would be untested. Same trap as unlocks, sessions, webhook events,
orders, and watch progress. Not done.

**Reuse `0006`:** would collide with in-flight favourites sqlite. Took `0007`.

**Re-seed on every `createSqliteCatalogStore`:** the extra-row restart test fails, and a unique
constraint on `id` throws on the second open. Empty-check stays.

---

## 6. Verification

`pnpm verify` green on this branch (exit 0) after merging `origin/main` at `d182043`
(favourites sqlite `0006` and SCR-03 browse). Shared wiring lists both stores; catalogue
tables do not overlap with `favorite`.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,590 |
| `app` | 950 |
| **Total** | **2,677** |

Guardrails passed against `app/dist`. Bundle `index-Dm7zgKrK.js` 333.58 kB (gzip 101.93 kB).
`node:sqlite` is experimental on Node 22 and prints a warning; it is not a failure.

---

## 7. Left open

- **Search directory.** Still `createSeedDramaDirectory`. The catalogue module owns the records;
  wiring the two together is the follow-up `app.ts` already names.
- **PostgreSQL / Drizzle (T14 / T16).** The catalogue interface was already async. Do not rewrite
  `DATABASE_URL` to a file to make the swap look done.
- **Redis (T15).** Not read. Do not add a no-op client.
- **AM-blocked C3 leftovers.** Beans (`C3-09`), GATE-8 / EIS (`C3-03` recorded the escalation),
  real TikTok login (`C3-08`), SCR-10/11.
