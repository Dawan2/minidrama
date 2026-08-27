# Handoff — Wave 2, Work Slot J: keyword search and favourites

> **Branch:** `cursor/w2-work-j-acf5`, cut from `cursor/w2-work-g-d191` (`34d19dc`).
> **Scope:** the two halves of `U4` — find a drama, then follow it. One anonymous search endpoint and
> three per-viewer favourite endpoints, the matching rules behind the first and the storage behind
> the others.
> **Not in scope:** playback, entitlement, watch progress and the client feed, all in flight in
> adjacent slots. No file under `server/src/modules/{playback,progress,identity,platform-tiktok}/`
> was modified, and nothing under `app/src` was touched. No media URL, no `<video>`, no skipped
> test, no pull request.

---

## 1. What exists now

```http
GET /v1/search?q=twin%20moons&limit=20
```

```json
{
  "query": "twin moons",
  "items": [
    {
      "dramaId": "drm_dynasty_0002",
      "title": "Twin Moons Dynasty",
      "tags": ["revenge", "time-travel"],
      "matchedOn": "TITLE"
    }
  ],
  "truncated": false
}
```

Anonymous — no credential is required or read. Nothing matched is `200` with `items: []`, which is
the empty-result screen (`docs/02-screen-inventory.md` SCR-03) and not an error.

```http
GET    /v1/dramas/{dramaId}/favorite     Authorization: Bearer <session>   -> 200
PUT    /v1/dramas/{dramaId}/favorite     Authorization: Bearer <session>   -> 204
DELETE /v1/dramas/{dramaId}/favorite     Authorization: Bearer <session>   -> 204
```

```json
{ "dramaId": "drm_revenge_0001", "favorited": true, "favoritedAt": "2026-08-27T12:00:00.000Z" }
```

`Cache-Control: private, no-store` on the read. For a drama this viewer does not follow: `200` with
`favorited: false` and no `favoritedAt`.

| Failure | Status | Code |
|---|---|---|
| No verifiable session on a favourite endpoint — missing, rejected or unverifiable credential, undistinguished | `401` | `AUTH_REQUIRED` |
| `q` missing or empty; `q` over 64 characters; `limit` not an integer or outside 1–50; either parameter repeated; `dramaId` empty or over 64 characters | `400` | `COMMON_VALIDATION_FAILED`, with `details.fields[]` |
| `PUT` against a drama that does not exist, or has never been published | `404` | `CONTENT_NOT_FOUND`, with `details.resourceType` and `details.resourceId` |
| `PUT` against a delisted drama | `410` | `CONTENT_OFFLINE`, same `details` |

`DELETE` has no `404` and no `410`: it answers `204` whatever the catalogue says. `GET` applies no
publication check either. Decision S45 explains why the three verbs differ.

This closes gap **G5** — "no keyword search endpoint", the reason the 剧场 tab's search entry is
built but hidden (`docs/02-information-architecture.md` §10, `docs/handoff/w1-p2.md` §3). It does
**not** close `W18`: what exists is keyword matching over titles and tags, not a search engine (§6).

---

## 2. What was delivered

| File | Contents |
|---|---|
| `packages/shared/src/discovery.ts` | New. `DramaSearchHit`, `DramaSearchResults`, `FavoriteState`, `DramaSearchMatch` — the wire shapes, with the reasoning for what a hit deliberately omits |
| `packages/shared/src/index.ts` | One export line added |
| `server/src/modules/discovery/dramas.ts` | New. `DramaDirectory` (the whole catalogue dependency of this slot), `SearchableDrama`, and the seed that answers it today |
| `server/src/modules/discovery/validation.ts` | New. The input edge: `validateSearchQuery`, `parseSearchLimit`, `validateDramaId`, `singleQueryValue`, and the three bounds |
| `server/src/modules/discovery/search.ts` | New. `foldForSearch` and `findMatches` — how two strings are compared, and which of two matches comes first |
| `server/src/modules/discovery/favorites.ts` | New. `FavoritesStore` (read one, add one, remove one, async) and an in-memory implementation keyed `(userId, dramaId)` |
| `server/src/modules/discovery/routes.ts` | New. The four handlers |
| `server/src/modules/discovery/{dramas,validation,search,favorites,search-routes,favorites-routes}.test.ts` | New. 141 tests |
| `server/src/app.ts` | Registers the module and adds `dramaDirectory` and `favoritesStore` to `AppDependencies`. Additive; nothing existing changed |
| `contracts/openapi.yaml` | Four operations and three schemas |
| `server/src/contract.test.ts` | The four new operations added to the expected set |

### 2.1 Where each rule lives, and why not in the handler

Everything that decides *what matches* or *what is stored* is a pure function. The handlers resolve
the viewer, validate, ask, and answer; they make no judgement of their own. Search is the one
endpoint in this product whose answer is a ranking, and a ranking asserted only through HTTP is one
nobody can change with confidence.

| Rule | Answer | Where it is tested |
|---|---|---|
| A viewer types a title in lower case, or with a double space | Matched: both sides are folded (`foldForSearch`) | `search.test.ts`, "foldForSearch" |
| An IME emits fullwidth Latin | Matched: NFKC first | same |
| A phone keyboard cannot produce `é` | Matched: Latin combining marks are stripped | same |
| The same fold would strip the dakuten from `ジ` | Refused: only `U+0300–U+036F` is stripped, so `ジ` stays `ジ` | same, "keeps the kana voiced mark" |
| A viewer types a title that is also somebody's tag | The title match wins, and is reported as `TITLE` | `search.test.ts`, "the order" |
| Two dramas match at the same tier | More played first, then by identifier — total and stable | same |
| An unpublished or delisted drama matches the query | Not returned, ever | `dramas.test.ts` and both route test files |
| The search box is empty | `400`, not an empty result set | `validation.test.ts` |
| A client asks for 500 results | `400`, not a silent 50 | same |
| A favourite button is double-tapped | `204`, and `favoritedAt` does not move | `favorites-routes.test.ts` |
| A `DELETE` is retried, or aimed at a delisted drama | `204` both times | same |
| A drama is withdrawn while a viewer follows it | The row stays readable; a new `PUT` is refused | same |

### 2.2 The three verbs disagree on purpose

This is the one part of the slot where the endpoints are deliberately inconsistent with each other,
so it is worth writing out.

- **`PUT` consults the catalogue.** Following a drama creates a reference to it, and a reference to
  something that does not exist reaches the viewer as a permanently broken card on their favourites
  screen. An unpublished drama answers `404` rather than `410`, so the endpoint cannot be used to
  confirm that an unannounced title exists.
- **`GET` does not.** A viewer must be able to read their own row for a drama that has since been
  withdrawn: that row is *why* the drama is still on their favourites screen, and answering `410`
  would leave them unable to see what they are being shown.
- **`DELETE` does not, and never fails.** Un-following must not be the operation that breaks.
  Refusing it for a delisted drama traps the row on the viewer's screen with no way to clear it, and
  a `404` for a row that is already gone makes a retried `DELETE` — the reason `DELETE` is meant to
  be idempotent — look like a failure.

The symmetry that was given up is "the same identifier gets the same answer from every verb". What
was bought is that no state a viewer can reach is a state they cannot leave.

### 2.3 Verification

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **529 passing, 0 skipped, 0 failing** — 396 server (was 251), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The 145 new tests are the six new files (141) plus four operations added to the contract test's
expected set. No existing test was modified, skipped or deleted. The client bundle is unchanged —
nothing in this slot is reachable from `app/src`.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-g.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S43 | **`GET /v1/search?q=&limit=`, and gap G5 is answered "yes, the endpoint ships"** | G5 has been open since W1 as a product question ("是否进 Wave 2"), and the cost of leaving it open is a built-but-hidden entry point in the 剧场 tab plus a journey (`U4`) that only half exists. The endpoint is small, additive and anonymous; the expensive half of search is relevance, and §6 is explicit that this slot does not claim it | One route file; the entry stays hidden if the answer changes |
| S44 | **Favourites keep their documented paths — `PUT`/`DELETE /v1/dramas/{dramaId}/favorite` — and gain a `GET` the document does not have** | `docs/12-api-contracts.md` §4.3 already specifies the pair; only the `/v1` prefix is added, which is decision S28's rule applied again. The `GET` exists because a favourite button that has just been pressed needs to re-read one row without re-fetching a whole drama, and because `DramaDetail.viewer.favorited` cannot be the only way to learn the fact while `catalog` is in another slot | One path string and one handler |
| S45 | **`PUT` checks the catalogue; `GET` and `DELETE` do not** | §2.2 | Two `await`s |
| S46 | **A never-published drama answers `404`, a delisted one `410`** | This is `catalog`'s own distinction (`docs/12-api-contracts.md` §4.3) and it matters here for a security reason as much as a semantic one: `410` confirms existence, and an unannounced title is exactly what a competitor probes for. Draft therefore has to be indistinguishable from absent | One branch |
| S47 | **A repeated `PUT` does not move `favoritedAt`** | "Following since" is a fact about the viewer's history; a double-tapped button and a retry after a network failure are one decision. It is also what `INSERT … ON CONFLICT DO NOTHING` does, so the in-memory behaviour and the durable behaviour agree by construction | One line in the store |
| S48 | **Both writes answer `204` with an empty body** | The document specifies `204`, and there is nothing useful to say: the client knows what it asked for, and echoing the stored row would invite it to trust a value another device may have written. The read is a separate endpoint precisely so that "tell me the state" is a request a client makes when it wants the state | One response body |
| S49 | **Search resolves no viewer and carries no per-viewer field, and sets no cache header** | Browsing is anonymous by contract (`docs/12-api-contracts.md` §2.2) and silent login can fail before the viewer has typed anything. Because the answer is viewer-independent it is the one response in this module a shared cache *could* hold — but choosing the TTL is a CDN and content-moderation decision (a takedown has to propagate), so no header is asserted here. Two tests pin the invariant the caching answer depends on: the body carries no favourite state, and a credentialled caller gets a byte-identical response | One header, once the policy owner exists |
| S50 | **No cursor on search; a `truncated` boolean instead** | Relevance order is not a keyset. Paging a ranking requires a snapshot of that ranking, or the second page is computed against a different order and silently drops or repeats rows — the exact failure `core/pagination.ts` exists to prevent for the catalogue. `truncated` is the honest thing available without a snapshot, and "narrow your query" is also the better search experience | The field stays; `pageInfo` is added beside it |
| S51 | **A search hit carries `dramaId`, `title`, `tags` and `matchedOn` — no cover art, no counters, no `DramaSummary` fields** | The alternative is a second, partial copy of the catalogue's summary living in this module, which is how two shapes of one drama start disagreeing about `totalEpisodes`. It also keeps this slot's responses free of URLs of any kind. The cost is real and is stated in §4: the client cannot render a full card from a hit yet | One field, `items[].drama`, added when `catalog` lands (§5) |
| S52 | **Ranking is: title prefix, title substring, exact tag, partial tag — then play count, then identifier** | A viewer typing a title is naming one drama; a tag is a genre, and answering the genre first is the classic failure of a naive search box. Popularity is the only relevance signal that exists before behavioural data. The identifier tiebreak is what makes the order *total*: an unstable comparator returns one result set in two orders across two requests, and a viewer reads that as the catalogue changing under them | Four constants and one comparator |
| S53 | **Folding is NFKC, `toLowerCase`, `U+0300–U+036F` stripped, NFC, whitespace collapsed — and matching is `String.includes`, never a constructed regular expression** | Each fold answers a case this audience produces: IME fullwidth forms, mixed case, an accent a phone keyboard cannot type. Stripping *all* combining marks — the obvious one-liner — would take the dakuten off Japanese kana and fold `ジ` into `シ`, a different syllable, so the range is deliberate and tested. `toLowerCase` rather than `toLocaleLowerCase` because locale-dependent casing (Turkish `I` → `ı`) is a defect that reproduces on one deployment only. A pattern compiled from caller input is a ReDoS, which is how a search endpoint becomes a denial-of-service amplifier | One function, with tests naming each rule |
| S54 | **An empty `q` is `400`, not an empty result set** | A search box that has not been typed into should not be issuing a request, and "no results for nothing" is indistinguishable from a query that genuinely matched nothing — which is the one state the empty-result screen exists for. `findMatches` also refuses an empty query defensively, because `''` is a prefix of every string and the failure mode is a full catalogue dump | One branch in each place |
| S55 | **An out-of-range `limit` is refused, not clamped; the maximum is 50** | A client that asks for 500 and silently receives 50 believes it has seen every match and never learns otherwise. This is `core/pagination.ts`'s rule on the catalogue branch, deliberately matched. 50 is small because search results are retyped rather than scrolled | One number |
| S56 | **The catalogue dependency is a two-method port with a seed behind it, not an invented catalogue** | There is no `catalog` module on this branch. Inventing records, publication rules and numbering here would create a second source of truth whose removal is a reconciliation rather than a deletion. Instead `SearchableDrama` is field-for-field a *subset* of that module's `DramaRecord` — including the `stat.playCount` nesting — so a `DramaRecord` satisfies it structurally, and the seed reuses that module's ids, titles, tags and counters. §5 has the adapter, which is nine lines | Delete one file, add nine lines |
| S57 | **Favourites reuse `modules/progress/viewer.ts`, and all three refusal reasons answer one `401 AUTH_REQUIRED`** | On slot G's explicit instruction (`w2-work-g.md` §5: take the resolver rather than growing a second one). A second viewer seam is a second place for the property that matters — refuses by default, never reads a user id from anything the caller controls — to be got wrong. The undistinguished `401` is the anti-oracle rule the login and progress endpoints already follow; the reason goes to the log | Nothing; the import moves to `identity` with the port |
| S58 | **The query string is never logged; the search log line carries counts only** | A search term is the most revealing thing a viewer types into this product, and a log is the one place it would be retained by default and reviewed by nobody. Product does need to know what viewers search for, and §6 says why that has to be an explicit, privacy-reviewed event rather than a log line | One log field, and a review |
| S59 | **Search and favourites are one module, `discovery`** | They are one slot, one journey (`U4`) and — today — one dependency: the same `DramaDirectory` answers "which dramas may be found" and "does this drama exist". Two modules would have to share that port across a boundary the architecture says is crossed only by published interfaces, for two endpoints that are always deployed together | Two files split along an existing line |

---

## 4. Deliberately not built

Listed so it is not re-scoped as an omission.

- **No `GET /users/me/favorites`.** The favourites screen (SCR-08) lists `DramaSummary` pages
  (`docs/12-api-contracts.md` §4.3), and `DramaSummary` is a catalogue view object this branch does
  not have. The store already answers per-viewer reads; what is missing is the drama-summary
  projection and the keyset pagination, both of which belong to `catalog`. §5 has the shape.
- **No favourite state in the catalogue's `DramaDetail.viewer`.** That field is `catalog`'s to fill
  and the call is one line; §5 has it. Filling it from here would mean this module editing another
  slot's handler.
- **No `favoriteCount` maintenance.** `docs/12-domain-model.md` §3.1 keeps a denormalised counter
  per drama, updated asynchronously and allowed to lag. Favouriting does not touch it: it is a
  cross-drama aggregate, not a per-viewer row, and computing it inline would put a write on the
  hot path of every tap for a number nobody reads in real time.
- **No search analytics.** No event, no query log, no empty-result-rate metric (S58, and §6).
- **No relevance beyond popularity**, no stemming, no synonyms, no typo tolerance, no word
  segmentation. Every one of those needs a relevance metric to evaluate, and a relevance metric
  needs real queries against a real catalogue; neither exists yet. `W18` is where they belong.
- **No filters on search.** No `category`, no `tag`, no `sort`. `GET /v1/dramas` already owns
  faceted browsing on the catalogue branch, and adding a second faceted list here would be two
  endpoints answering one question.
- **No episode search.** Viewers search for dramas; an episode is reached through one.
- **No client code.** Nothing under `app/src` was touched, no `<video>`, no `<audio>`, no
  `<source>`, and no media URL appears anywhere in this slot. The search response has a test
  asserting its body matches no `https?://` and no `coverUrl`, mirroring the playback and progress
  endpoints.

---

## 5. For the next slots

**For whoever merges `catalog`** (`cursor/w2-work-d-0d0f`). `DramaDirectory` is the entire seam.
`DramaRecord` already satisfies `SearchableDrama` structurally, so the adapter is:

```ts
export function createCatalogDramaDirectory(store: CatalogStore): DramaDirectory {
  return {
    // `listDramas` already returns published dramas only; the sort is irrelevant because
    // `findMatches` imposes its own total order.
    listSearchable: () => store.listDramas({ sort: 'HOT' }),
    lookup: async (dramaId) => (await store.getDrama(dramaId))?.drama,
  };
}
```

Then delete `SEED_SEARCHABLE_DRAMAS` and `createSeedDramaDirectory`, and pass the adapter in
`app.ts`. The search tests keep passing because they assert against drama ids that exist on both
sides — that is why the seed reuses that module's fixture ids rather than inventing its own. Two
follow-ups belong to that merge and not to this slot:

| # | Change | Why it waits |
|---|---|---|
| J-a | `DramaSearchHit` gains `drama: DramaSummary`, and the client renders the same card search returns as the browse list does (S51) | The view object and its `toDramaSummary` projection are `catalog`'s |
| J-b | `DramaDetail.viewer.favorited` is filled from `FavoritesStore.read(viewer.userId, dramaId)`, and `GET /v1/users/me/favorites` is added as a `DramaSummary` page over the viewer's rows | Both are `catalog` handlers; the second also needs a `list(userId)` method on `FavoritesStore`, which was left off deliberately rather than shipped unused |

**For whoever implements the durable store.** The table is
`favorite(user_id, drama_id, created_at)` with the pair as its primary key
(`docs/12-domain-model.md` §3). Two properties of the in-memory implementation are contracts: the
key is `(userId, dramaId)` in that order, and `add` never moves an existing timestamp — which is
`INSERT … ON CONFLICT (user_id, drama_id) DO NOTHING`, not `DO UPDATE`. The favourites *list* query
is `WHERE user_id = $1`, and it wants an index on `(user_id, created_at DESC)` before SCR-08 ships,
because "most recently followed first" is the order that screen reads in.

**For whoever owns search when the catalogue is real.** `findMatches` folds every title and every tag
on every request. That is correct and irrelevant at eight dramas, and wrong at ten thousand: the
folded forms are a property of the record, so they belong in a stored column (or an index) computed
on write. The `W18` acceptance criterion is 500 ms at seed scale, and this implementation meets it
by a wide margin — which is exactly why the replacement has to be triggered by catalogue size rather
than by a latency alarm.

**For slot B, as a transcription obligation** in the style of `playback-contract.md` §9:

| # | File | Required change |
|---|---|---|
| J-1 | `docs/12-api-contracts.md` §4.3 | Favourite endpoints gain the `/v1` prefix (S44). Add `GET /v1/dramas/{dramaId}/favorite`, which the document does not have. Add `GET /v1/search?q=&limit=` with its response shape, and record that it returns hits rather than `DramaSummary` pages until J-a lands (S51) |
| J-2 | `docs/02-information-architecture.md` §10 and `docs/handoff/w1-p2.md` §3 | Gap **G5** is closed for the endpoint (S43): the 剧场 tab's search entry has a contract to call. Note the scope limit — titles and tags, no filters, no cursor |
| J-3 | `docs/12-error-catalog.md` §§2, 5 | `CONTENT_NOT_FOUND` and `CONTENT_OFFLINE` now have a producer on the favourite write, and the rule is "never published is `404`, delisted is `410`" (S46) |
| J-4 | `docs/02-screen-inventory.md` SCR-03 and SCR-08 | SCR-03's search entry is no longer blocked on a missing contract; its result card is a title-and-tags row until J-a. SCR-08 remains blocked on the favourites list endpoint (J-b), not on the favourite itself |
| J-5 | `docs/00-wave-plan.md` W18 | Record what shipped (keyword matching over titles and tags, publication-filtered, deterministic order) and what W18 still owns (relevance, filters, analytics, the folded-form index) |

---

## 6. Known gaps in this slot's own work

- **In-memory storage forgets every favourite on restart**, and drops the least recently written row
  past 50 000. A missing favourite is worse than a missing progress row in one specific way: the
  viewer *chose* it, and a hole in the list is indistinguishable from a drama they never followed —
  so the failure reads as the product silently unfollowing things. `DAT-004`, and not optional work.
- **No rate limit on the writes.** An authenticated client can add and remove favourites as fast as
  it can send requests, and the only bound is the store's global capacity — which means one busy
  caller can evict another viewer's rows. The cap belongs with the shared rate-limiting work
  (`system-overview.md` §12); the honest note is that today nothing stops it.
- **Substring matching produces false positives in Latin scripts.** `the` matches `Mother's Debt`,
  because `mother` contains `the`. Word-boundary matching would fix it for English and break it for
  CJK, which has no spaces — the real answer is per-language tokenisation, which is the same work as
  relevance. The ranking limits the damage (a title *prefix* outranks a mid-word substring) but the
  row is still in the result set.
- **Popularity is the only relevance signal, and it is a fixture number.** `stat.playCount` is a
  denormalised counter that nothing currently updates (§4), so today the ranking within a tier is
  effectively the order the seed was written in. It will start meaning something the day the counter
  does.
- **Nobody can see what viewers search for.** S58 keeps queries out of the logs, which is the right
  default and leaves a real product gap: the empty-result rate is the single most useful signal
  about a catalogue's shape, and there is no way to obtain it here. It needs a deliberate event with
  a retention decision attached — probably the query's *length* and whether it matched, rather than
  the query itself — and that is a privacy review, not a code change.
- **The favourite existence check is only as true as the directory behind it.** With the seed, `PUT`
  refuses ids that the real catalogue may well contain, and accepts eight that it does. This is
  visible in tests as fixture ids and invisible in production only because there is no production;
  it resolves entirely when the adapter in §5 lands.
- **`favoritedAt` is a server clock and the store's read-then-write is not atomic.** Two concurrent
  `PUT`s for one `(viewer, drama)` serialise only because Node is single-threaded; two processes
  would both see "absent" and both insert. The primary key makes that harmless in SQL — the second
  insert does nothing, and `favoritedAt` stays the first one's — which is why the idempotence is
  specified as `ON CONFLICT DO NOTHING` rather than as application logic.
- **One failure still does not wear the standard error envelope.** Past Fastify's default
  `maxParamLength` of 100, an over-long `dramaId` answers `414` with Fastify's own body, exactly as
  `w2-work-g.md` §6 records for `episodeId`. Our own 64-character bound means no plausible
  identifier reaches it. Normalising it needs an app-level `onRequest` check, which belongs with
  whoever owns the envelope invariant.
- **The search cache policy is unresolved** (S49). Today the response carries no cache header at
  all, which means intermediaries apply their own defaults. That is a decision deferred, not a
  decision made, and the two tests guarding "no per-viewer state in this response" are what keep the
  deferral safe.
