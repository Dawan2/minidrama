# Handoff — Wave 8, Work Slot: the favourites list endpoint

> **Branch:** `cursor/w8-work-favorites-list-a666`, cut from `cursor/w2-work-j-acf5` (`496bc95`).
> **Scope:** one endpoint — `GET /v1/users/me/favorites`, paged — plus the keyset it needs and the
> cursor codec behind it. It is the item slot J listed as `J-b` and deliberately did not build
> (`docs/handoff/w2-work-j.md` §4, §5).
> **Not in scope:** the `DramaSummary` projection, the catalogue, and the favourites screen itself.
> Nothing under `app/src` was touched and no existing endpoint changed behaviour. No file outside
> `packages/shared/src/discovery.ts`, `server/src/modules/discovery/`, `server/src/contract.test.ts`
> and `contracts/openapi.yaml` was modified. No merge of any adjacent slot, no pull request.

---

## 1. What exists now

```http
GET /v1/users/me/favorites?cursor=&limit=20     Authorization: Bearer <session>   -> 200
```

```json
{
  "items": [
    { "dramaId": "drm_dynasty_0002", "favoritedAt": "2026-08-27T12:01:00.000Z" },
    { "dramaId": "drm_revenge_0001", "favoritedAt": "2026-08-27T12:00:00.000Z" }
  ],
  "pageInfo": { "nextCursor": "MTc4NzgzMjAwMDAwMDpkcm1fcmV2ZW5nZV8wMDAx", "hasMore": true }
}
```

`Cache-Control: private, no-store`. Most recently followed first, with the drama id as a tiebreak.
A viewer who follows nothing gets `200` with `items: []` and
`pageInfo: { "nextCursor": null, "hasMore": false }`.

| Failure | Status | Code |
|---|---|---|
| No verifiable session — missing, rejected or unverifiable credential, undistinguished | `401` | `AUTH_REQUIRED` |
| `limit` not an integer, or outside 1–100; `cursor` present and unreadable; either parameter repeated | `400` | `COMMON_VALIDATION_FAILED`, with `details.fields[]` |

There is no `404`: a favourites list always exists for a resolvable viewer, even when it is empty.
There is no publication check, so a drama that has since been delisted stays in the list (§3, S68).

### 1.1 Why this endpoint, and what it fixes

Slot J shipped the per-drama verbs, which answer *"do I follow **this** drama"*. A favourites screen
built on those alone has to name the dramas first, so it fans out one `GET` per candidate — and it
still cannot discover a favourite it did not think to ask about, which is every favourite of a drama
that has left the browse list. That is the fan-out this slot removes: one request returns the ids,
and the per-drama `GET` goes back to being what it is for, re-reading one row after a button press.

This partially discharges `J-b` (`docs/handoff/w2-work-j.md` §5). The half that remains is the
`DramaSummary` projection, which is still the catalogue's — see §5.

---

## 2. What was delivered

| File | Contents |
|---|---|
| `packages/shared/src/discovery.ts` | `PageInfo`, `FavoriteListItem`, `FavoriteList` added. Nothing existing changed |
| `server/src/modules/discovery/favorites.ts` | `FavoritesStore.list`, `FavoritesCursor`, `FavoritesListOptions`, `FavoritesPage`, `compareFavoritesDescending`, and the in-memory keyset implementation |
| `server/src/modules/discovery/favorites-cursor.ts` | New. `encodeFavoritesCursor`, `decodeFavoritesCursor`, `MAX_FAVORITES_CURSOR_LENGTH` |
| `server/src/modules/discovery/validation.ts` | `FAVORITES_LIMIT`, `parseFavoritesLimit`, `parseFavoritesCursor`; `DiscoveryField` gains `cursor` and `DiscoveryFieldReason` gains `malformed` |
| `server/src/modules/discovery/routes.ts` | One handler added; the module docstring updated where it said this endpoint was deliberately absent |
| `server/src/modules/discovery/favorites-list-routes.test.ts` | New. 34 tests |
| `server/src/modules/discovery/favorites-cursor.test.ts` | New. 21 tests |
| `server/src/modules/discovery/{favorites,validation}.test.ts` | 13 and 18 tests added; none modified |
| `contracts/openapi.yaml` | One operation, three schemas (`PageInfo`, `FavoriteListItem`, `FavoriteList`) |
| `server/src/contract.test.ts` | The new operation added to the expected set |

`app.ts` was **not** touched. The store is already injected there and the route already receives it,
so an endpoint that reads the same store needed no wiring — which is the whole benefit of the seam
slot J left.

### 2.1 Where each rule lives

The handler resolves the viewer, validates, asks the store, and answers. Ordering, the page boundary
and `hasMore` are the store's; the cursor encoding is its own module; the parameter rules are in
`validation.ts` with search's. Nothing about paging is decided inside the handler, because a paging
bug asserted only through two HTTP responses leaves you unable to tell which of the two layers is
wrong.

| Rule | Answer | Where it is tested |
|---|---|---|
| A viewer follows nothing | `200`, `items: []`, `hasMore: false` | `favorites-list-routes.test.ts` |
| The session is missing, forged, or unverifiable | `401`, one code for all three | same |
| A malformed query arrives without a credential | `401`, and the body names no parameter | same |
| A viewer pages through 7 favourites, 3 at a time | Every row exactly once, in order | same, and `favorites.test.ts` |
| Two favourites share a millisecond | Ordered by drama id, and the page boundary between them holds | `favorites.test.ts` |
| The last page is exactly full | `hasMore: false`, `nextCursor: null` — no empty page to discover the end | same |
| The row a cursor names is unfollowed before the next page is asked for | Paging continues from that position | same |
| A favourite is added after page one was served | It does not reappear on a later page | same |
| One viewer's cursor is presented with another viewer's session | A position inside *that* viewer's list; no cross-viewer row, ever | both |
| A cursor is truncated, re-encoded, or invented | `400` naming `cursor`, not a silent first page | `favorites-cursor.test.ts`, `validation.test.ts` |
| `?limit=500` | `400`, not a silent 100 | `validation.test.ts` |
| A drama in the list has since been delisted | Still listed | `favorites-list-routes.test.ts` |

### 2.2 Verification

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **616 passing, 0 skipped, 0 failing** — 483 server (was 396), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

87 new server tests. No existing test was modified, skipped or deleted, and the client bundle hash is
unchanged — nothing in this slot is reachable from `app/src`.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-j.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S60 | **The list returns `{ dramaId, favoritedAt }` rows, not the `DramaSummary` pages `docs/12-api-contracts.md` §4.3 specifies** | `DramaSummary` is a catalogue view object that does not exist on this branch, and a partial copy of it here is exactly the duplication S51 refused for `DramaSearchHit` — it is how two shapes of one drama start disagreeing about `totalEpisodes`. What the favourites store actually knows is which dramas the viewer follows and when; shipping that unblocks the fan-out today and the projection is additive later | One field, `items[].drama`, added when the catalogue lands (§5) |
| S61 | **Keyset paging on `(favoritedAtMs, dramaId)`, both descending** | Most recently followed first is the order SCR-08 reads in, and the drama id tiebreak is what makes that order *total*. Without it, two favourites recorded in the same millisecond sort arbitrarily, and a page boundary falling between them silently drops or repeats a row — the failure that is invisible in a seed and reported as "a drama vanished from my list" in production. Both components descending so the SQL predicate is one row-value comparison rather than a rule per column | One comparator and one predicate |
| S62 | **`hasMore` is observed by fetching `limit + 1` rows, not inferred from `rows.length === limit`** | The inference is wrong exactly once per list — for a viewer whose favourite count is an exact multiple of the page size, which is every viewer with 20 favourites on the default limit. They would be told there was another page and handed an empty one | One `+ 1` and one `slice` |
| S63 | **`nextCursor` is `null` on the final page, and derived from `hasMore` rather than from "a last row exists"** | They are one fact and a client should not have to reconcile two. A cursor on the final page invites the client to fetch an empty page just to learn it has finished, which is a wasted round trip on every favourites screen. `null` rather than absent so a client reading `pageInfo.nextCursor` unconditionally gets an explicit end | One expression |
| S64 | **The cursor carries no user id, and is not signed** | Encoding the viewer into the keyset is the obvious implementation and it turns the cursor into a client-supplied user id — the one input a per-viewer endpoint must never accept. Instead the viewer comes from the session on every request and the cursor is applied inside a query already scoped to them, so a forged cursor can only move a position within the forger's own list. Signing would buy nothing against that and would put a key rotation on the paging path | Nothing; adding a signature later is additive |
| S65 | **An unreadable `cursor` is `400 COMMON_VALIDATION_FAILED`, not a silent first page** | The fallback is tempting and silently wrong: a client whose cursor we have stopped understanding — a deploy that changed the encoding, a truncated URL, a proxy that ate a character — would loop over page one forever, and neither the client nor its logs would show anything but a lot of traffic. A `400` is diagnosable on the first request | One branch |
| S66 | **The `401` is decided before the query string is read** | A `400` for an anonymous caller confirms it reached a real handler and lets it probe the parameter rules of an endpoint it cannot call. It also keeps this endpoint's refusal identical to the three favourite verbs', which resolve the viewer first for the same reason | Two statements swapped |
| S67 | **An empty list is `200` with `items: []`, and is never conflated with the `401`** | "You follow nothing yet" is a complete answer and the empty state of SCR-08. The confusion this endpoint must prevent is the other direction: a client that read a refusal as an empty list would show a bare favourites screen to a viewer whose session had merely expired, and the viewer would read that as the product having lost their favourites. There is a test whose only job is to keep the two distinguishable | Nothing |
| S68 | **No publication check on the list** | The same rule the per-drama `GET` follows (S45): the row is *why* the drama is on the viewer's screen, and hiding it leaves a favourite they can neither see nor clear. Here it is a paging property too — filtering rows the store had already counted would return a page shorter than `limit` while `hasMore` still described the unfiltered query, so the two halves of the answer would disagree. Resolving an id to a drama is the client's step and is where a withdrawn title gets whatever treatment SCR-08 decides | One `filter`, once the catalogue is real and the count is filtered too |
| S69 | **`limit` defaults to 20 and maxes at 100, refused rather than clamped** | Those are the numbers `docs/12-api-contracts.md` §2.3 gives every list endpoint, and this is the first list endpoint to ship, so it takes them rather than inventing a third convention. Search's maximum is deliberately lower (S55) because search results are retyped where a list is scrolled. Refusing rather than clamping matters more here than on search: a page shorter than requested is the obvious end-of-list signal, so a silently reduced limit would stop a client paging | One number |
| S70 | **`PageInfo` is named for the envelope, not for favourites, and lives in `packages/shared/src/discovery.ts`** | The next list endpoint — `GET /v1/dramas` — must reuse this shape rather than define a second one that agrees with it by coincidence, and a name like `FavoritePageInfo` guarantees the second one. It sits in `discovery.ts` rather than a new `pagination.ts` so that this slot does not create a file the catalogue slot is also about to create; moving it is a re-export | One export line, moved |
| S71 | **`FavoritesStore` grows a fourth method rather than a separate list port** | It is the same table and the same key, and the list query (`WHERE user_id = $1`) is the one slot J's §5 already specified for the durable implementation. A second port over one table would have to be implemented twice and could disagree about ordering | Delete one method |
| S72 | **The cursor is base64url of `<ms>:<dramaId>`, charset-checked before decoding** | Base64url because a cursor travels in a query string, where `+` means a space — a plain base64 cursor fails for exactly the subset of positions whose encoding happens to contain one, which is the worst possible failure distribution. The charset is checked explicitly because Node's decoder *ignores* characters outside the alphabet rather than refusing them, so without the check two different strings decode to one position and `!!!!` reads as a merely empty cursor | One codec, with its own tests |

---

## 4. Deliberately not built

Listed so it is not re-scoped as an omission.

- **No `DramaSummary` in the rows** (S60). The client cannot render a full favourites card from this
  response yet; it gets ids and a follow date. §5 has the change.
- **No client code.** Nothing under `app/src` was touched, and the favourites UI was not written or
  rewritten. There is no `<video>`, no media URL, and a test asserts the response body matches no
  `https?://`.
- **No `DELETE /v1/users/me/favorites`**, no bulk unfollow, no reordering. The per-drama `DELETE`
  already clears a row and is idempotent; a bulk verb is a destructive operation that wants a
  confirmation design, not an endpoint.
- **No `favoriteCount`, no counters, no sort options.** `?sort=` on a favourites list means paging a
  second ordering, which needs a second keyset; "most recently followed" is the order SCR-08 reads
  in and the only one with a stated requirement.
- **No `total`.** A count is a second query, it is stale the moment it is computed, and a keyset
  page cannot use it for anything. `hasMore` is what a client needs to keep paging.
- **No filtering of delisted dramas** (S68).
- **No cache header beyond `private, no-store`**, and no `ETag`. A per-viewer list that changes on
  every tap is not a conditional-request candidate worth the invalidation.
- **No rate limit.** Inherited from slot J §6 and unchanged: the writes are still unbounded, and now
  a read is too. It belongs with the shared rate-limiting work.

---

## 5. For the next slots

**For whoever merges `catalog`.** The projection is the whole remaining half of `J-b`, and it is
additive:

```ts
// In the list handler, after `favorites.list(...)`:
const summaries = await store.getDramaSummaries(page.rows.map((row) => row.dramaId));
```

Then `FavoriteListItem` gains `drama: DramaSummary` and `items[].drama` appears in the response.
Three things to decide with it, none of which this slot could decide alone:

| # | Question | Why it waits |
|---|---|---|
| W8-a | What a delisted or deleted drama renders as on SCR-08 | It is a screen decision, and it only becomes answerable once there is a summary to fail to render. S68 keeps the row in the response precisely so the client *can* decide |
| W8-b | Whether the summary lookup is one batched query or N | A batch of 20–100 ids per page wants one `WHERE drama_id = ANY($1)`; doing it per row is the classic N+1 this endpoint would introduce on the favourites screen |
| W8-c | Whether `DramaDetail.viewer.favorited` is filled from the same store | The other half of `J-b`, unchanged and still one line in a catalogue handler |

**For whoever implements the durable store.** `list` is the query slot J §5 anticipated, now with an
exact shape:

```sql
SELECT user_id, drama_id, created_at
  FROM favorite
 WHERE user_id = $1
   AND ($2::timestamptz IS NULL OR (created_at, drama_id) < ($2, $3))
 ORDER BY created_at DESC, drama_id DESC
 LIMIT $4 + 1;
```

The index is `(user_id, created_at DESC)` — slot J already asked for it, and this is the query that
needs it. Two properties of the in-memory implementation are contracts: the order is
`(created_at, drama_id)` descending on **both** columns (so the keyset stays a single row-value
comparison), and `hasMore` comes from the extra row rather than from the row count. One caveat the
in-memory store cannot reproduce: `created_at` has millisecond resolution here and microsecond
resolution in Postgres, so the tie case that S61 exists for will be rarer there and not absent —
a batch insert or a coarse clock still produces it.

**For slot B, as a transcription obligation:**

| # | File | Required change |
|---|---|---|
| W8-1 | `docs/12-api-contracts.md` §4.3 | `GET /users/me/favorites` gains the `/v1` prefix (S44's rule applied again) and the note that it returns drama ids until the catalogue lands (S60). Record `limit` 1–100 default 20, refused not clamped |
| W8-2 | `docs/02-screen-inventory.md` SCR-08 | No longer blocked on a missing list endpoint. It is blocked on the card projection (`W8-a`, S60), which is a narrower statement |
| W8-3 | `docs/12-api-contracts.md` §2.3 | Record that the envelope now has a shipped implementation, that `nextCursor` is `null` on the final page (S63), and that an unreadable cursor is a `400` rather than a first page (S65) |
| W8-4 | `docs/14-security.md` | Add the cursor rule: an opaque cursor carries no user identifier and is scoped by the session, not by its own contents (S64) |

---

## 6. Known gaps in this slot's own work

- **In-memory storage still forgets every favourite on restart**, and the capacity eviction is now
  visible in a new way: a viewer's list can lose its *oldest* rows while keeping the newest, so the
  list looks complete and is not. Inherited from slot J §6, `DAT-004`, and unchanged here — worth
  restating because a list endpoint is where a hole becomes something a viewer can count.
- **The in-memory `list` scans and sorts every row on every request.** Correct and irrelevant at
  seed scale, and replaced by the index above. It is `O(rows)` per request rather than
  `O(rows_for_this_viewer)`, because a `Map` keyed by `(userId, dramaId)` has no per-viewer bucket —
  a durable store's `WHERE user_id = $1` is not merely faster, it is a different complexity class.
- **A cursor is not invalidated by anything.** It has no expiry, no version, and no tie to the
  encoding that produced it. If the ordering ever changes, old cursors will decode successfully and
  mean the wrong position — a silent failure, unlike the `400` a malformed one gets. A version byte
  is the cheap fix and was left out rather than shipped unused; it becomes necessary the moment a
  second ordering exists (§4).
- **`hasMore` can be a lie by the time the client reads it.** A viewer who unfollows the only
  remaining drama between two requests gets `hasMore: true` followed by an empty page. This is
  inherent to keyset paging over mutable data and the honest answer is that an empty final page is
  harmless; it is written down so nobody reads the `hasMore` test as a stronger guarantee than it is.
- **Nothing observes how deep clients page.** The log line carries the returned count and `hasMore`
  and no cursor, which is right — a cursor in a log is a position in a named viewer's list — but it
  means the page-depth distribution that would justify or refute the default limit of 20 is not
  obtainable. Same shape of gap as S58's, and the same answer: a deliberate event, not a log field.
- **The `414` gap is unchanged.** Past Fastify's `maxParamLength` an over-long path parameter still
  answers `414` with Fastify's own body. This endpoint has no path parameter, so it cannot reach it;
  the note stands only so the inherited gap is not assumed closed.
- **No test asserts the endpoint's behaviour at 100 rows with a real catalogue behind it**, because
  there is no catalogue. The largest list exercised is 21 favourites against the injected store.
