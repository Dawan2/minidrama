# Handoff — Wave 2, Work Slot D: the catalogue and feed read surface

> **Branch:** `cursor/w2-work-d-0d0f`, cut from `cursor/w2-work-c-5101` (webhook verification).
> **Scope:** the public read surface — drama browsing, drama detail, the flattened episode list with
> per-episode `viewerAccess`, single-episode detail, and the recommendation feed — plus the cursor
> pagination they share and a guard on the playback contract.
> **Not in scope:** unlocks, wallets, progress, favourites, search, persistence, session
> verification. Nothing in `platform-tiktok` or `identity` was touched. No pull request was opened.

---

## 1. What this slot closes

The storefront existed as a contract (`docs/12-api-contracts.md` §4.3, §4.8) and as nothing else.
`GET /v1/dramas`, `GET /v1/dramas/{dramaId}`, `GET /v1/dramas/{dramaId}/episodes`,
`GET /v1/episodes/{episodeId}` and `GET /v1/recommendations/feed` now run, are documented in
`contracts/openapi.yaml`, and are covered by tests that assert the domain rules rather than the
happy path.

The rule this slot exists to get right is the free window. `docs/12-domain-model.md` §3.4 states it
as "`episodeNumber ≤ drama.freeEpisodes`", and `episodeNumber` is unique **within a season**, not
within a drama. Read literally, a drama that ships a second season gives away that season's first N
episodes as well — and the season after that, and the one after that. The storefront is flat anyway
(W1B decision 10: the episode list is one running order across seasons), so the number that means
anything to a viewer is the drama-wide one. **The free window is measured in `globalEpisodeNumber`,
and `EpisodeItem` carries both numbers so nothing is lost.**

`drm_dynasty_0002` in the seed catalogue is that case made executable: three free episodes, three
episodes per season, so `ep_dynasty_s2e01` has `episodeNumber: 1` and `globalEpisodeNumber: 4` and
is reported `NEED_UNLOCK`. A test asserts exactly that, and it is the test that fails if anyone
reintroduces the per-season reading.

---

## 2. What was delivered

| File | Contents |
| --- | --- |
| `packages/shared/src/catalog.ts` | The view objects the client and server share: `DramaSummary`, `DramaDetail`, `EpisodeItem`, `ViewerAccess`, `Page`, `FeedCard`, and the enumerations |
| `server/src/core/pagination.ts` | Keyset cursor pagination, query fingerprinting, limit parsing, sort-key rendering |
| `server/src/modules/catalog/types.ts` | Storage records — the entities, with the publication state machine the views do not carry |
| `server/src/modules/catalog/numbering.ts` | Global episode numbering, listing visibility, the free-window predicate |
| `server/src/modules/catalog/access.ts` | Effective unlock policy, effective price, `viewerAccess`. The only implementation of these rules anywhere |
| `server/src/modules/catalog/viewer.ts` | The `Viewer` and the `ViewerResolver` seam; the fail-closed anonymous resolver |
| `server/src/modules/catalog/views.ts` | Record → view mapping |
| `server/src/modules/catalog/fixtures.ts` | The seed catalogue, written as a table of cases |
| `server/src/modules/catalog/store.ts` | `CatalogStore` (async interface) and the in-memory implementation, which owns visibility, ordering and numbering |
| `server/src/modules/catalog/routes.ts` | The four catalogue endpoints |
| `server/src/modules/discovery/feed.ts` | Feed composition, isolated from HTTP |
| `server/src/modules/discovery/routes.ts` | `GET /v1/recommendations/feed` |
| `server/src/modules/playback/playback-contract.test.ts` | The guard that a media URL cannot reappear in the playback contract |
| `contracts/openapi.yaml` | Five operations, thirteen schemas and one reusable path parameter, added additively |
| `server/src/contract.test.ts` | Path-parameter samples, so a templated path is really dispatched |
| `server/src/app.ts` | Registration of the two new modules and their injectable dependencies |

Two files outside this slot's modules were edited, both additively: `contracts/openapi.yaml` (475
insertions, 0 deletions) and `server/src/contract.test.ts`. `server/src/app.ts` gained registrations
and three optional dependency fields. **`server/src/modules/playback/routes.ts` was not touched**,
and neither was any file under `app/`.

### 2.1 Verification

Every gate was run on this branch and passed.

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **457 passing, 0 skipped, 0 failing** — 92 app, 16 config, 11 shared, **338 server** (was 162) |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), unchanged |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The client bundle is byte-for-byte unchanged: nothing in this slot is reachable from `app/`. No
`<video>` element exists, no player code was touched, no lint rule or guardrail was relaxed, and no
existing test was weakened, skipped or deleted. The only pre-existing test file modified is
`contract.test.ts`, which gained assertions rather than losing any.

### 2.2 Where the 179 new tests go

| Group | Tests | Protects |
| --- | --- | --- |
| `catalog/routes.test.ts` | 46 | The endpoints end to end: the free-window pin, status gating (404 vs 410), season filtering, paging, validation, and that an `Authorization` header grants nothing |
| `core/pagination.test.ts` | 33 | That paging walks a collection exactly once, survives an insert or a delete mid-scroll, and rejects a foreign, tampered or oversized cursor |
| `catalog/store.test.ts` | 21 | Ordering, filtering, the exclusion of unpublished content, and the reconciliation of the denormalised counters against derived truth |
| `catalog/access.test.ts` | 20 | Every branch of `viewerAccess`, including the ones no route can reach yet (VIP, owned, both at once) |
| `discovery/routes.test.ts` | 18 | The feed over HTTP: dedup across page boundaries, tracking-id freshness, and every way a continue-watching card is dropped |
| `catalog/numbering.test.ts` | 12 | That numbering is global, stable under takedown, and blind to drafts |
| `discovery/feed.test.ts` | 10 | The composition rule: ordering, dedup, scene behaviour, determinism |
| `playback/playback-contract.test.ts` | 10 | That the playback contract cannot grow a media URL, in the schema or in the response |
| `contract.test.ts` | 6 new | That the five new documented operations reach handlers, with real path parameters |
| `shared/catalog.test.ts` | 3 | The published enumerations, and the compile-time proof that no listing type carries a playback handle |

Two of these were probed by mutation rather than assumed:

- Adding `playUrl` to `PlaybackDescriptor` in both the schema and the handler fails 5 of the 10
  playback-contract tests.
- Adding `previewUrl` to `EpisodeItem` fails `pnpm typecheck`, not merely `pnpm test` — the guard is
  a type-level assertion, so the field cannot be added in one commit and the test deleted in
  another.

---

## 3. Decisions taken in this slot

Recorded so the next slot can overturn them deliberately rather than by accident. Numbering
continues from `docs/handoff/w2-work-c.md` §4.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| S21 | **The free window is measured in `globalEpisodeNumber`** | `episodeNumber` restarts at 1 every season, so a window keyed on it is not a statement about the drama. The per-season reading gives away the opening episodes of every season a drama ever ships — revenue lost quietly, in proportion to how successful the drama is | One predicate in `numbering.ts`; the view already carries both numbers |
| S22 | **A published episode keeps its global number when it goes offline; drafts are never numbered** | Renumbering after a takedown makes "episode 7" a different episode tomorrow, which breaks deep links, saved progress and the free window at once. Numbering drafts would push published episodes out of the free window while the drafts sit unreleased | Change one filter; every stored progress row becomes wrong, so effectively irreversible once there is progress data |
| S23 | **An offline *episode* stays listed as `UNAVAILABLE`; an offline *season*'s episodes are not listed at all** | A gap in the grid would claim the drama is shorter than it is. A season is pulled as a unit and the domain model makes a season's visibility govern its episodes (§3.2), so hiding it whole is honest; its numbers stay reserved so the seasons after it do not shift | One predicate in `numbering.ts` |
| S24 | **Draft content answers `404`, delisted content answers `410`** | A deep link or a history entry pointing at a withdrawn drama needs "no longer available", not "wrong link". Unannounced content must stay indistinguishable from a typo, or the endpoint becomes a release-schedule oracle | One branch per route |
| S25 | **Pagination is keyset, and a cursor carries a fingerprint of the query that minted it** | Offsets break under any insert or delete between two pages. The fingerprint turns "a `HOT` cursor replayed against `NEW`" into a `400` rather than a page that is quietly wrong. It is a hash, not a signature: cursors point into public lists and nothing depends on them being unforgeable | The interface is already the one a SQL store implements; swapping the scan for a query touches only `store.ts` |
| S26 | **An out-of-range `limit` is rejected, not clamped** | A client that asks for 500 and silently receives 100 pages the rest of the catalogue by accident and never learns why. The contract publishes the maximum | One branch in `parseLimit` |
| S27 | **A season the drama does not have is `404`; a tag nothing carries is an empty page** | "This drama has no season 9" and "season 9 has no episodes yet" are different answers and only one is true. A tag filter matching nothing is a legitimate empty result | One branch |
| S28 | **Every request resolves to the anonymous viewer, behind a `ViewerResolver` seam** | Session tokens are opaque random bytes with no verification path (W2-C, S18) and there is no entitlement store. Honouring an `Authorization` header today would mean trusting it — an entitlement bypass that reads as a feature and passes tests. Anonymous means no unlocks and no VIP, so nothing is given away | Replace one function; the routes do not change |
| S29 | **`DramaDetail.viewer` is `null`, not `{ favorited: false }`** | The client renders `false` as a confirmed empty heart, so a real favourite would look dropped. `null` says "not known" and the UI can defer | Additive |
| S30 | **An owned episode reports `UNLOCKED` even for a VIP** | The entitlement is permanent and the subscription is not. Reporting `VIP` would make the client hide the owned state and offer the episode for sale again the day the subscription lapses | Reorder two branches in `access.ts` |
| S31 | **Availability is decided before entitlement, so an unavailable episode is never `NEED_UNLOCK`** | An episode that cannot be served is not a conversion opportunity. Offering an unlock for one sells access to something that still would not play, and the refund is ours | Reorder two branches |
| S32 | **`totalSeasons` / `totalEpisodes` are denormalised, counted over what a viewer can see, and reconciled by a test** | They are rendered as "7 episodes" beside a grid, so counting drafts would advertise content that is not there. A counter nobody reconciles is a counter that is eventually wrong; the store test is the reconciler until there is a job | The test is the contract; a real store needs the equivalent job |
| S33 | **The feed alternates the popular and recent orderings instead of concatenating them, and uses no wall clock** | Concatenation gives the tail of the popular list priority over the newest drama in the catalogue, which is how a new release never gets a first impression. A clock in a ranking function is a test that fails on a date nobody chose | One function in `feed.ts` |
| S34 | **`trackingId` is minted per card per response** | It is the join key between an impression and the click it produced. An id reused across responses collapses two impressions into one and makes click-through rate unmeasurable | Additive |
| S35 | **A continue-watching card whose target is withdrawn is dropped, not repaired** | A progress record outlives the content it names. Serving the card sends the viewer straight into an error screen; the drama can still reach the feed on its own merits. The episode number comes from the catalogue, never from the progress record, because numbering is a property of the drama | One filter in `discovery/routes.ts` |
| S36 | **No catalogue response carries a playback handle — no `vid`, no asset key, no URL** | Otherwise the catalogue is a second playback path that never asks whether you may watch. Enforced three ways: a compile-time assertion on `EpisodeItem`, a runtime scan of the responses, and a scan of the seed fixture itself | Deliberately expensive |
| S37 | **`contract.test.ts` substitutes real path-parameter values, and a parameter without a sample fails the suite** | Dispatching `/v1/dramas/{dramaId}` literally reaches the handler and is answered "no such drama", which proves nothing. The failure-on-missing-sample is what stops a future templated path from being added and left untested by omission | None |
| S38 | **`CatalogStore` is async while the implementation is synchronous and in memory** | Every method is one PostgreSQL query later. An interface promising synchronous answers would have to change, along with every caller, on the day the datastore arrives | None; it is already paid |
| S39 | **The feed lives at `/v1/recommendations/feed`** | It is the path `docs/12-api-contracts.md` §4.8 publishes, under this repository's `/v1` prefix. The module is named `discovery` after the architecture's module table, and the two are allowed to differ | Rename one route |

---

## 4. Deliberately not built

Listed so nobody re-scopes it as an omission.

- **No persistence.** `createInMemoryCatalogStore` reads a fixture. `fixtures.ts` *is* the catalogue
  for now; content operations, ingest and the CMS are `media-ops`'s.
- **No entitlement.** Nothing can be unlocked, and `viewerAccess` never reports `UNLOCKED` in
  production because no viewer ever owns anything. The VIP and owned branches exist, are tested, and
  are reachable only through an injected resolver.
- **No favourites, no watch progress, no history.** `DramaDetail.viewer` is `null` and the
  continue-watching source is empty. Both have interfaces waiting.
- **No search.** `docs/02-information-architecture.md` records the missing search contract as gap
  G5; nothing here closes it.
- **No mirrored platform state.** `review_status`, `online_version` and listing state live at the
  platform and are not modelled. Our `PublicationStatus` is *our* publication state only. See §6.
- **No rate limiting and no caching.** The public reads are unthrottled and carry no `ETag` or
  `Cache-Control`. The request pipeline in `docs/architecture/system-overview.md` §7.2 puts rate
  limiting ahead of every handler; it is not built yet, and these are the most cacheable endpoints in
  the product.
- **No schema validation from the contract.** Validators are hand-written per route. The
  OpenAPI-driven validation of tech-stack T13 is a later step; `contract.test.ts` currently checks
  only that documented paths reach handlers, not that responses match their schemas.
- **No localisation.** `recReason` is English (conflict C9).

---

## 5. Known gaps in this slot's own work

Stated plainly rather than left for someone to discover.

- **Playback and the catalogue disagree about who may watch.** `playback/routes.ts` still uses the
  Wave-1 stub, which treats any episode id starting with `ep_locked` as locked. So
  `POST /v1/playback/sessions` issues a descriptor for `ep_dynasty_s2e01` while the catalogue reports
  `NEED_UNLOCK` for it. This is the single most important loose end here, and it was left alone on
  purpose: playback is another slot's file and the fix belongs with the real entitlement check, not
  with a second stub. See §6 for the exact shape.
- **Cover images will not load on device.** Fixture covers are served from
  `cdn.example.invalid`, which is not in `packages/config/src/domains.ts` and therefore not a trusted
  domain. Whatever the real image origin turns out to be, it must be registered in the Portal and in
  the registry — there are 18 free slots — or every poster in the app is a broken image.
- **A feed cursor is stable only while the ranking is.** The mock recomputes the ranking on every
  request, so a catalogue change mid-scroll shifts ranks and the cursor resumes at the wrong place. A
  real feed snapshots the ranking (or seeds it per session) and pages the snapshot. Catalogue lists
  do not have this problem: their sort keys are properties of the records.
- **`playable: true` is a statement about entitlement, not a promise of a frame.** The platform
  independently enforces moderation, online version and listing, and can refuse an episode this
  module approved. Nothing here reconciles the two; the drift reconciler in
  `docs/architecture/system-overview.md` §6.3 is `media-ops`'s and does not exist.
- **The personalised branches are never exercised end to end.** `VIP` and `UNLOCKED` appear only
  under an injected resolver. They are unit-true and integration-untested, and they stay that way
  until session verification lands.
- **Ordering and filtering happen in memory, over the whole catalogue, per request.** Fine for eight
  dramas and wrong for eight thousand. The `CatalogStore` interface is shaped so the work moves into
  SQL without a caller changing, which is the point of it being async and of the sort key being a
  single exported function.
- **Cursors are unsigned.** A client can craft one and resume anywhere in a list. That is acceptable
  because these lists are public and a cursor grants no access, but nothing viewer-specific may ever
  be encoded into one. A test asserts a cursor carries exactly the fingerprint and the sort key.
- **`recReason` is English display copy.** Conflict C9 requires user-facing text to follow
  `Accept-Language`, with English mandatory. This is one of the places that needs it.

---

## 6. For the next slots

**For whoever implements `entitlement`.** Two things plug in, and both are one function.

1. `createAnonymousViewerResolver` in `catalog/viewer.ts` becomes a real resolver: verify the
   session, load the viewer's unlocks as a `Map<episodeId, UnlockMethod>` and their VIP state. Every
   `viewerAccess` in the catalogue and the feed becomes personalised without a route changing. Keep
   the failure mode: an unverifiable session must resolve to `ANONYMOUS_VIEWER`, never to a viewer
   with entitlements, and never to a 500 — catalogue reads are anonymous-capable by contract.
2. `computeViewerAccess` in `catalog/access.ts` is the *only* implementation of the access rules.
   When the unlock endpoint arrives, it must decide "may this be bought" from the same function
   rather than a parallel copy — specifically, `effectiveUnlockPolicy` is what tells you that an
   episode inside the free window cannot be sold, and `UNLOCK_POLICY_NOT_ALLOWED` is the error the
   catalogue's `UNAVAILABLE` and `NEED_VIP` cases map to.

**For whoever wires playback to the catalogue.** Replace `isEntitled` in
`playback/routes.ts` with a call through the catalogue and the entitlement check:
`store.getEpisode(episodeId)` gives you the drama and the positioned episode, and
`computeViewerAccess(...).playable` is the gate. Three properties must survive: the response stays a
descriptor (`playback-contract.test.ts` fails otherwise), a commercial denial stays `EPISODE_LOCKED`
with unlock context while a platform block stays a different code, and the entitlement check happens
server-side even though the catalogue already told the client the answer — the catalogue's
`viewerAccess` is for rendering, not for authorisation.

**For whoever implements `progress`.** Implement `ContinueWatchingSource` in `discovery/feed.ts` and
pass it to `buildApp`. Return entries newest-watched first; the feed preserves your order and does
not re-sort. Do not resolve episode numbers yourself — return the `episodeId` and the position, and
the route takes the number from the catalogue, because a number copied into a progress row goes stale
the moment a season is withdrawn. Also fill `DramaDetail.viewer.lastWatched`, which is `null` today.

**For whoever replaces the store.** Implement `CatalogStore` against PostgreSQL and pass it to
`buildApp`. Three properties are load-bearing. `dramaSortKey` must produce the same order as your
`ORDER BY`, or paging drops rows at the boundaries — export the key from the same place the query
orders by. `positionEpisodes` should become a materialised `global_episode_number` column rather than
a per-request computation, and it must be recomputed on publish and never on withdrawal. And the
denormalised `totalSeasons` / `totalEpisodes` need the reconciliation job that `store.test.ts` stands
in for.

**For whoever owns `media-ops`.** The records here carry no platform columns. When you add
`album_id`, `byteplus_vid`, `review_status`, `online_version` and `publish_status`, the catalogue's
`isServeable` in `access.ts` is where the online/listed check belongs, so an episode that is
published here but not online there reports `UNAVAILABLE` instead of `playable: true`. That is the
one change that turns "a user reports a black screen" into "we knew before the user did".

**For whoever builds the client screens.** `@minidrama/shared` exports the view types; import them
rather than redeclaring. The rule that costs the most to break: `viewerAccess` is the answer, and the
client must never recompute it from `freeEpisodes` and `unlockPolicy`. `freeEpisodes` is there for
the "first 3 free" badge and for nothing else. Paging is `pageInfo.nextCursor` echoed verbatim;
`nextCursor` is `null` exactly when `hasMore` is false, so either one is a safe stop condition.

**For whoever registers the image origin.** Add it to `packages/config/src/domains.ts`, run
`pnpm gen:minis-config`, and register the same origin in the Developer Portal. Until then every
`coverUrl` in the catalogue points at `.invalid` and nothing renders.
